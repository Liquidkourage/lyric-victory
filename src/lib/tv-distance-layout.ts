import { getVisibleLyricLines, sanitizeLineTokensForTv } from "./tv-board-layout";
import type { PublicLine, PublicToken } from "./types";

const LINE_BREAK_MARKER = "/";

export interface DistancePhraseLine {
  tokens: PublicToken[];
}

export interface PhraseSplitOptions {
  targetTokens: number;
  maxTokens: number;
  preserveUpTo: number;
}

export function phraseOptionsForColumnCount(columnCount: number): PhraseSplitOptions {
  if (columnCount <= 2) {
    return { targetTokens: 6, maxTokens: 8, preserveUpTo: 8 };
  }
  if (columnCount <= 4) {
    return { targetTokens: 8, maxTokens: 10, preserveUpTo: 10 };
  }
  return { targetTokens: 9, maxTokens: 11, preserveUpTo: 11 };
}

export function countPhraseUnits(tokens: PublicToken[]): number {
  return tokens.filter(isPhraseUnit).length;
}

function isPhraseUnit(token: PublicToken): boolean {
  if (!isRenderableToken(token)) return false;
  return !isPunctuationToken(token);
}

function splitTokensIntoPhrases(
  tokens: PublicToken[],
  options: PhraseSplitOptions,
): PublicToken[][] {
  const phrases: PublicToken[][] = [];
  let current: PublicToken[] = [];
  let unitCount = 0;

  const pushCurrent = () => {
    if (current.length === 0) return;
    phrases.push(current);
    current = [];
    unitCount = 0;
  };

  for (const token of tokens) {
    const addsUnit = isPhraseUnit(token);

    if (addsUnit && unitCount >= options.targetTokens && current.length > 0) {
      pushCurrent();
    }

    current.push(token);
    if (addsUnit) unitCount += 1;

    if (unitCount >= options.maxTokens) {
      pushCurrent();
    }
  }

  pushCurrent();

  if (phrases.length > 1) {
    const last = phrases[phrases.length - 1]!;
    const lastUnits = countPhraseUnits(last);
    const prev = phrases[phrases.length - 2]!;
    const prevUnits = countPhraseUnits(prev);

    if (lastUnits > 0 && lastUnits < 4 && prevUnits + lastUnits <= options.maxTokens) {
      phrases[phrases.length - 2] = [...prev, ...last];
      phrases.pop();
    }
  }

  return phrases;
}

/**
 * Preserve original lyric line breaks when short enough; otherwise split into 5–10 token phrases.
 * Phrase targets vary by column count so 3–4 column layouts get scan-friendly row lengths.
 */
export function buildDistancePhraseLines(
  lines: PublicLine[],
  columnCount: number,
): DistancePhraseLine[] {
  const options = phraseOptionsForColumnCount(columnCount);
  const visible = getVisibleLyricLines(lines);
  const phrases: DistancePhraseLine[] = [];

  for (const line of visible) {
    const tokens = sanitizeLineTokensForTv(line.tokens).filter(isRenderableToken);
    if (tokens.length === 0) continue;

    const units = countPhraseUnits(tokens);
    if (units <= options.preserveUpTo) {
      phrases.push({ tokens });
      continue;
    }

    for (const chunk of splitTokensIntoPhrases(tokens, options)) {
      phrases.push({ tokens: chunk });
    }
  }

  return phrases;
}

export function summarizePhraseLines(phrases: DistancePhraseLine[]) {
  const counts = phrases.map((phrase) => countPhraseUnits(phrase.tokens));
  const total = counts.reduce((sum, count) => sum + count, 0);

  return {
    avgTokensPerLine: counts.length > 0 ? total / counts.length : 0,
    maxTokensPerLine: counts.length > 0 ? Math.max(...counts) : 0,
  };
}

export interface DistanceLayoutParams {
  revealedFontSize: number;
  columnCount: number;
  dense: boolean;
  wordGap: number;
  rowGap: number;
  columnGap: number;
}

/** Width in em units for a hidden blank, matched to revealed-word typography. */
export function blankWidthEm(charCount: number): number {
  return Math.max(1.6, charCount * 0.56);
}

export const DISTANCE_FONT_MAX = 56;
export const DISTANCE_FONT_MIN = 26;
export const DISTANCE_COLUMN_MIN = 2;
export const DISTANCE_COLUMN_MAX = 5;

export const TARGET_HEIGHT_RATIO = 0.895;
export const TARGET_WIDTH_RATIO = 0.94;
export const TARGET_TOKENS_PER_LINE = 9;
export const IDEAL_TOKENS_PER_LINE: [number, number] = [8, 10];

function isPunctuationOnly(value: string): boolean {
  return value.length > 0 && !/[a-zA-Z]/.test(value);
}

export function gapsForRevealedFontSize(revealedFontSize: number, dense = false) {
  const scale = dense ? 0.82 : 1;
  return {
    wordGap: Math.min(12, Math.max(4, revealedFontSize * 0.18 * scale)),
    rowGap: Math.min(14, Math.max(4, revealedFontSize * 0.2 * scale)),
    columnGap: Math.min(28, Math.max(10, revealedFontSize * 0.35 * scale)),
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
  avgTokensPerLine: number;
  maxTokensPerLine: number;
}

export interface DistanceLayoutDebugInfo {
  columns: number;
  revealedFontSize: number;
  avgTokensPerLine: number;
  maxTokensPerLine: number;
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
    avgTokensPerLine: measurement.avgTokensPerLine,
    maxTokensPerLine: measurement.maxTokensPerLine,
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

function lineLengthScore(maxTokensPerLine: number, avgTokensPerLine: number): number {
  let score = 0;

  if (maxTokensPerLine > 12) {
    score -= 240 + (maxTokensPerLine - 12) * 40;
  } else {
    score -= Math.abs(maxTokensPerLine - TARGET_TOKENS_PER_LINE) * 18;
    if (
      maxTokensPerLine >= IDEAL_TOKENS_PER_LINE[0] &&
      maxTokensPerLine <= IDEAL_TOKENS_PER_LINE[1]
    ) {
      score += 24;
    }
  }

  score -= Math.abs(avgTokensPerLine - 8) * 10;
  return score;
}

function heightFitScore(usedHeightRatio: number): number {
  if (usedHeightRatio < 0.85 || usedHeightRatio > 0.94) {
    const distance =
      usedHeightRatio < 0.85 ? 0.85 - usedHeightRatio : usedHeightRatio - 0.94;
    return -distance * 120;
  }
  return 24 - Math.abs(usedHeightRatio - TARGET_HEIGHT_RATIO) * 80;
}

function widthFitScore(usedWidthRatio: number): number {
  if (usedWidthRatio < 0.9 || usedWidthRatio > 0.98) {
    const distance =
      usedWidthRatio < 0.9 ? 0.9 - usedWidthRatio : usedWidthRatio - 0.98;
    return -distance * 100;
  }
  return 16 - Math.abs(usedWidthRatio - TARGET_WIDTH_RATIO) * 60;
}

function columnPreferenceScore(columnCount: number): number {
  if (columnCount === 3 || columnCount === 4) return 28;
  if (columnCount === 5) return 8;
  if (columnCount === 2) return -22;
  return 0;
}

function compareDistanceLayouts(
  a: DistanceLayoutMeasurement,
  b: DistanceLayoutMeasurement,
): number {
  if (a.revealedFontSize !== b.revealedFontSize) {
    return a.revealedFontSize - b.revealedFontSize;
  }

  const lineDelta =
    lineLengthScore(a.maxTokensPerLine, a.avgTokensPerLine) -
    lineLengthScore(b.maxTokensPerLine, b.avgTokensPerLine);
  if (lineDelta !== 0) return lineDelta;

  const columnDelta = columnPreferenceScore(a.params.columnCount) - columnPreferenceScore(b.params.columnCount);
  if (columnDelta !== 0) return columnDelta;

  const heightDelta = heightFitScore(a.usedHeightRatio) - heightFitScore(b.usedHeightRatio);
  if (heightDelta !== 0) return heightDelta;

  const widthDelta = widthFitScore(a.usedWidthRatio) - widthFitScore(b.usedWidthRatio);
  if (widthDelta !== 0) return widthDelta;

  return b.params.columnCount - a.params.columnCount;
}

export interface DistanceLayoutPick {
  params: DistanceLayoutParams;
  measurement: DistanceLayoutMeasurement;
  phraseLines: DistancePhraseLine[];
}

/**
 * For each column count, split phrases for scan-friendly row lengths, then evaluate fonts.
 * Score for distance readability: font size, line length, viewport fill, column preference.
 */
export function pickBestDistanceLayout(
  lines: PublicLine[],
  measure: (
    params: DistanceLayoutParams,
    phrases: DistancePhraseLine[],
  ) => DistanceLayoutMeasurement,
): DistanceLayoutPick {
  const valid: DistanceLayoutMeasurement[] = [];
  const phraseLinesByColumn = new Map<number, DistancePhraseLine[]>();

  for (let columnCount = DISTANCE_COLUMN_MIN; columnCount <= DISTANCE_COLUMN_MAX; columnCount += 1) {
    const phrases = buildDistancePhraseLines(lines, columnCount);
    phraseLinesByColumn.set(columnCount, phrases);

    for (let fontSize = DISTANCE_FONT_MIN; fontSize <= DISTANCE_FONT_MAX; fontSize += 1) {
      for (const dense of [false, true] as const) {
        const measurement = measure(buildLayoutParams(fontSize, columnCount, dense), phrases);
        if (measurement.overflowX > 1 || measurement.overflowY > 1) continue;
        if (measurement.revealedFontSize < DISTANCE_FONT_MIN) continue;
        valid.push(measurement);
      }
    }
  }

  if (valid.length === 0) {
    const columnCount = 4;
    const phrases = buildDistancePhraseLines(lines, columnCount);
    const fallback = measure(buildLayoutParams(DISTANCE_FONT_MIN, columnCount, true), phrases);
    return {
      params: fallback.params,
      measurement: fallback,
      phraseLines: phrases,
    };
  }

  valid.sort(compareDistanceLayouts);
  const best = valid[valid.length - 1]!;
  return {
    params: best.params,
    measurement: best,
    phraseLines: phraseLinesByColumn.get(best.params.columnCount) ?? [],
  };
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
