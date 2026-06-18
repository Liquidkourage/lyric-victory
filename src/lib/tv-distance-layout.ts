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

/**
 * Layout search priorities (public TV / bar distance):
 * 1. Largest revealed-word font that fits the full song without scroll
 * 2. Fewest columns at that font size (wider columns = larger type)
 * 3. Only enter dense mode (smaller type, tighter chrome) after font 32px fails at 5 columns
 */
export function searchDistanceLayout(
  fits: (params: DistanceLayoutParams) => boolean,
): DistanceLayoutParams {
  for (let fontSize = DISTANCE_FONT_MAX; fontSize >= DISTANCE_FONT_FLOOR; fontSize -= 1) {
    for (let columnCount = DISTANCE_COLUMN_MIN; columnCount <= DISTANCE_COLUMN_MAX; columnCount += 1) {
      const params = buildLayoutParams(fontSize, columnCount, false);
      if (fits(params)) return params;
    }
  }

  for (let fontSize = DISTANCE_FONT_FLOOR; fontSize >= DISTANCE_FONT_MIN; fontSize -= 1) {
    for (let columnCount = DISTANCE_COLUMN_MIN; columnCount <= DISTANCE_COLUMN_MAX; columnCount += 1) {
      const params = buildLayoutParams(fontSize, columnCount, true);
      if (fits(params)) return params;
    }
  }

  return buildLayoutParams(DISTANCE_FONT_MIN, DISTANCE_COLUMN_MAX, true);
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
