import { getVisibleLyricLines, sanitizeLineTokensForTv } from "./tv-board-layout";
import type { PublicLine, PublicToken } from "./types";

const LINE_BREAK_MARKER = "/";

/** Flatten all lyric lines into one continuous word flow (no section labels or line breaks). */
export function buildDistanceFlowTokens(lines: PublicLine[]): PublicToken[] {
  const visible = getVisibleLyricLines(lines);
  const tokens: PublicToken[] = [];

  for (const line of visible) {
    tokens.push(...sanitizeLineTokensForTv(line.tokens));
  }

  return tokens;
}

export interface DistanceLayoutParams {
  revealedFontSize: number;
  columnCount: number;
  dense: boolean;
  wordGap: number;
  sectionGap: number;
  columnGap: number;
  chipHeight: number;
  chipFontSize: number;
}

export const DISTANCE_FONT_MAX = 44;
export const DISTANCE_FONT_MIN = 26;
export const DISTANCE_FONT_FLOOR = 32;
export const DISTANCE_COLUMN_MIN = 2;
export const DISTANCE_COLUMN_MAX = 5;

function isPunctuationOnly(value: string): boolean {
  return value.length > 0 && !/[a-zA-Z]/.test(value);
}

export function gapsForRevealedFontSize(revealedFontSize: number) {
  return {
    wordGap: Math.min(10, Math.max(4, revealedFontSize * 0.18)),
    sectionGap: Math.min(14, Math.max(6, revealedFontSize * 0.24)),
    columnGap: Math.min(24, Math.max(10, revealedFontSize * 0.35)),
    chipHeight: revealedFontSize * 1.15,
    chipFontSize: revealedFontSize * 0.85,
  };
}

export function buildLayoutParams(
  revealedFontSize: number,
  columnCount: number,
  dense: boolean,
): DistanceLayoutParams {
  const gaps = gapsForRevealedFontSize(revealedFontSize);
  if (dense) {
    gaps.wordGap = Math.max(3, gaps.wordGap * 0.82);
    gaps.sectionGap = Math.max(4, gaps.sectionGap * 0.72);
    gaps.columnGap = Math.max(6, gaps.columnGap * 0.82);
  }

  return {
    revealedFontSize,
    columnCount,
    dense,
    ...gaps,
  };
}

export interface DistanceLayoutMeasurement {
  params: DistanceLayoutParams;
  overflowX: number;
  overflowY: number;
  usedHeightRatio: number;
  usedWidthRatio: number;
  revealedFontSize: number;
}

/** Font sizes within this range compete on fill quality, not just raw px. */
const FONT_SIZE_TIE_EPSILON = 2;
const TARGET_HEIGHT_RATIO = 0.9;
const TARGET_HEIGHT_BAND: [number, number] = [0.88, 0.92];
const MIN_WIDTH_RATIO = 0.95;

function heightFillScore(usedHeightRatio: number): number {
  const bandCenter = TARGET_HEIGHT_RATIO;
  const distanceFromBand =
    usedHeightRatio < TARGET_HEIGHT_BAND[0]
      ? TARGET_HEIGHT_BAND[0] - usedHeightRatio
      : usedHeightRatio > TARGET_HEIGHT_BAND[1]
        ? usedHeightRatio - TARGET_HEIGHT_BAND[1]
        : 0;

  const bandBonus = distanceFromBand === 0 ? 120 : 0;
  const closeness = Math.max(0, 1 - Math.abs(usedHeightRatio - bandCenter) / 0.35);
  const emptyLowerPenalty =
    usedHeightRatio < 0.8 ? (0.8 - usedHeightRatio) * 280 : 0;

  return bandBonus + closeness * 80 - emptyLowerPenalty;
}

function widthFillScore(usedWidthRatio: number): number {
  if (usedWidthRatio >= MIN_WIDTH_RATIO) return 60 + (usedWidthRatio - MIN_WIDTH_RATIO) * 100;
  return usedWidthRatio * 40;
}

function compareDistanceLayouts(
  a: DistanceLayoutMeasurement,
  b: DistanceLayoutMeasurement,
): number {
  const fontDelta = a.revealedFontSize - b.revealedFontSize;
  if (Math.abs(fontDelta) > FONT_SIZE_TIE_EPSILON) return fontDelta;

  const fillDelta =
    heightFillScore(a.usedHeightRatio) +
    widthFillScore(a.usedWidthRatio) -
    (heightFillScore(b.usedHeightRatio) + widthFillScore(b.usedWidthRatio));

  if (fillDelta !== 0) return fillDelta;

  return b.params.columnCount - a.params.columnCount;
}

function enumerateLayoutCandidates(): DistanceLayoutParams[] {
  const candidates: DistanceLayoutParams[] = [];

  for (let fontSize = DISTANCE_FONT_MAX; fontSize >= DISTANCE_FONT_FLOOR; fontSize -= 1) {
    for (let columnCount = DISTANCE_COLUMN_MIN; columnCount <= DISTANCE_COLUMN_MAX; columnCount += 1) {
      candidates.push(buildLayoutParams(fontSize, columnCount, false));
    }
  }

  for (let fontSize = DISTANCE_FONT_FLOOR - 1; fontSize >= DISTANCE_FONT_MIN; fontSize -= 1) {
    for (let columnCount = DISTANCE_COLUMN_MIN; columnCount <= DISTANCE_COLUMN_MAX; columnCount += 1) {
      candidates.push(buildLayoutParams(fontSize, columnCount, true));
    }
  }

  return candidates;
}

/**
 * Layout search priorities (public TV / bar distance):
 * 1. Measure every font/column candidate — never stop at the first fit
 * 2. Reject any candidate with horizontal or vertical overflow
 * 3. Prefer the largest revealed font size
 * 4. When font sizes are close, prefer height fill near 0.88–0.92 and width fill ≥ 0.95
 * 5. Penalize layouts that leave a large empty band below the lyrics
 */
export function pickBestDistanceLayout(
  measure: (params: DistanceLayoutParams) => DistanceLayoutMeasurement,
): DistanceLayoutParams {
  const valid: DistanceLayoutMeasurement[] = [];

  for (const params of enumerateLayoutCandidates()) {
    const measurement = measure(params);
    if (measurement.overflowX > 1 || measurement.overflowY > 1) continue;
    valid.push(measurement);
  }

  if (valid.length === 0) {
    return buildLayoutParams(DISTANCE_FONT_MIN, DISTANCE_COLUMN_MAX, true);
  }

  valid.sort(compareDistanceLayouts);
  return valid[valid.length - 1]!.params;
}

export function isRenderableToken(token: PublicToken): boolean {
  if (token.type === "blank") return true;
  if (token.value === LINE_BREAK_MARKER) return false;
  if (token.value.trim() === "") return false;
  return true;
}

export function isPunctuationToken(token: PublicToken): boolean {
  return token.type === "text" && isPunctuationOnly(token.value);
}
