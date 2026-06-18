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
  rowGap: number;
  columnGap: number;
  chipHeight: number;
  chipFontSize: number;
}

export const DISTANCE_FONT_MAX = 56;
export const DISTANCE_FONT_MIN = 26;
export const DISTANCE_COLUMN_MIN = 2;
export const DISTANCE_COLUMN_MAX = 5;

export const TARGET_HEIGHT_RATIO = 0.9;
export const TARGET_WIDTH_RATIO = 0.96;
export const MIN_ACCEPTABLE_HEIGHT_RATIO = 0.88;
export const MAX_UNUSED_HEIGHT_RATIO = 0.12;

function isPunctuationOnly(value: string): boolean {
  return value.length > 0 && !/[a-zA-Z]/.test(value);
}

export function gapsForRevealedFontSize(revealedFontSize: number, dense = false) {
  const scale = dense ? 0.82 : 1;
  return {
    wordGap: Math.min(12, Math.max(4, revealedFontSize * 0.18 * scale)),
    rowGap: Math.min(16, Math.max(5, revealedFontSize * 0.24 * scale)),
    columnGap: Math.min(28, Math.max(10, revealedFontSize * 0.35 * scale)),
    chipHeight: revealedFontSize * 1.15,
    chipFontSize: revealedFontSize * 0.85,
  };
}

export function buildLayoutParams(
  revealedFontSize: number,
  columnCount: number,
  dense = false,
): DistanceLayoutParams {
  return {
    revealedFontSize,
    columnCount,
    dense,
    ...gapsForRevealedFontSize(revealedFontSize, dense),
  };
}

export interface DistanceLayoutMeasurement {
  params: DistanceLayoutParams;
  overflowX: number;
  overflowY: number;
  usedHeightRatio: number;
  usedWidthRatio: number;
  revealedFontSize: number;
  contentScrollHeight: number;
  contentScrollWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}

export interface DistanceLayoutDebugInfo {
  columns: number;
  revealedFontSize: number;
  contentScrollHeight: number;
  viewportHeight: number;
  usedHeightRatio: number;
  contentScrollWidth: number;
  viewportWidth: number;
  usedWidthRatio: number;
  overflowX: number;
  overflowY: number;
}

export function toDebugInfo(measurement: DistanceLayoutMeasurement): DistanceLayoutDebugInfo {
  return {
    columns: measurement.params.columnCount,
    revealedFontSize: measurement.revealedFontSize,
    contentScrollHeight: measurement.contentScrollHeight,
    viewportHeight: measurement.viewportHeight,
    usedHeightRatio: measurement.usedHeightRatio,
    contentScrollWidth: measurement.contentScrollWidth,
    viewportWidth: measurement.viewportWidth,
    usedWidthRatio: measurement.usedWidthRatio,
    overflowX: measurement.overflowX,
    overflowY: measurement.overflowY,
  };
}

function heightFitScore(usedHeightRatio: number): number {
  return -Math.abs(usedHeightRatio - TARGET_HEIGHT_RATIO);
}

function widthFitScore(usedWidthRatio: number): number {
  return -Math.abs(usedWidthRatio - TARGET_WIDTH_RATIO);
}

function compareDistanceLayouts(
  a: DistanceLayoutMeasurement,
  b: DistanceLayoutMeasurement,
): number {
  if (a.revealedFontSize !== b.revealedFontSize) {
    return a.revealedFontSize - b.revealedFontSize;
  }

  const heightDelta = heightFitScore(a.usedHeightRatio) - heightFitScore(b.usedHeightRatio);
  if (heightDelta !== 0) return heightDelta;

  const widthDelta = widthFitScore(a.usedWidthRatio) - widthFitScore(b.usedWidthRatio);
  if (widthDelta !== 0) return widthDelta;

  return b.params.columnCount - a.params.columnCount;
}

function isAcceptableMeasurement(measurement: DistanceLayoutMeasurement): boolean {
  if (measurement.overflowX > 1 || measurement.overflowY > 1) return false;

  const unusedHeight = 1 - measurement.usedHeightRatio;
  if (unusedHeight > MAX_UNUSED_HEIGHT_RATIO && measurement.revealedFontSize < DISTANCE_FONT_MAX) {
    return false;
  }

  return true;
}

/**
 * Evaluate every font size per column count, reject overflow, then score survivors.
 * Goal: maximize revealed font while filling ~90% of the lyric viewport.
 */
export function pickBestDistanceLayout(
  measure: (params: DistanceLayoutParams) => DistanceLayoutMeasurement,
): { params: DistanceLayoutParams; measurement: DistanceLayoutMeasurement } {
  const valid: DistanceLayoutMeasurement[] = [];
  const overflowOnly: DistanceLayoutMeasurement[] = [];

  for (let columnCount = DISTANCE_COLUMN_MIN; columnCount <= DISTANCE_COLUMN_MAX; columnCount += 1) {
    for (let fontSize = DISTANCE_FONT_MIN; fontSize <= DISTANCE_FONT_MAX; fontSize += 1) {
      for (const dense of [false, true] as const) {
        const measurement = measure(buildLayoutParams(fontSize, columnCount, dense));
        if (measurement.overflowX > 1 || measurement.overflowY > 1) continue;

        if (isAcceptableMeasurement(measurement)) {
          valid.push(measurement);
        } else {
          overflowOnly.push(measurement);
        }
      }
    }
  }

  const pool = valid.length > 0 ? valid : overflowOnly;

  if (pool.length === 0) {
    const fallback = measure(buildLayoutParams(DISTANCE_FONT_MIN, DISTANCE_COLUMN_MAX, true));
    return { params: fallback.params, measurement: fallback };
  }

  pool.sort(compareDistanceLayouts);
  const best = pool[pool.length - 1]!;
  return { params: best.params, measurement: best };
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
