import { sanitizeLineTokensForTv } from "./tv-board-layout";
import type { PublicLine, PublicToken } from "./types";

const LINE_BREAK_MARKER = "/";

const SECTION_LABEL_PATTERN =
  /^\[?\s*(verse|chorus|bridge|intro|outro|pre-?chorus|hook|refrain|interlude|part)\s*\d*\]?\s*$/i;

export interface LyricStanza {
  lines: PublicLine[];
}

export interface LyricSection {
  label?: string;
  stanzas: LyricStanza[];
}

export interface LyricSheetColumn {
  sections: LyricSection[];
}

export interface DistanceLayoutParams {
  revealedFontSize: number;
  columnCount: number;
  wordGap: number;
  lineGap: number;
  stanzaGap: number;
  columnGap: number;
  chipHeight: number;
  chipFontSize: number;
  chipMinWidth: number;
}

export const DISTANCE_FONT_MAX = 56;
export const DISTANCE_FONT_MIN = 26;
export const DISTANCE_COLUMN_MIN = 2;
export const DISTANCE_COLUMN_MAX = 4;
export const DISTANCE_FONT_TIE_EPSILON = 3;

export const TARGET_HEIGHT_RATIO = 0.9;
export const TARGET_WIDTH_RATIO = 0.94;

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
  lineCount: number;
  sectionCount: number;
  wrappedLaneCount: number;
  maxTokensPerLine: number;
  avgTokensPerLine: number;
}

export interface DistanceLayoutDebugInfo {
  columns: number;
  revealedFontSize: number;
  lineCount: number;
  sectionCount: number;
  wrappedLaneCount: number;
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

export interface DistanceLayoutPick {
  params: DistanceLayoutParams;
  measurement: DistanceLayoutMeasurement;
  columns: LyricSheetColumn[];
}

function isPunctuationOnly(value: string): boolean {
  return value.length > 0 && !/[a-zA-Z]/.test(value);
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

function countLineUnits(tokens: PublicToken[]): number {
  return tokens.filter((token) => isRenderableToken(token) && !isPunctuationToken(token)).length;
}

function isSectionLabelLine(tokens: PublicToken[]): string | null {
  if (tokens.length !== 1 || tokens[0].type !== "text") return null;
  const value = tokens[0].value.trim();
  if (!SECTION_LABEL_PATTERN.test(value)) return null;
  return value;
}

function finalizeSection(section: LyricSection): LyricSection | null {
  const stanzas = section.stanzas.filter((stanza) => stanza.lines.length > 0);
  if (stanzas.length === 0 && !section.label) return null;
  return { ...section, stanzas };
}

/**
 * Build intact lyric sections from original line breaks and blank-line stanza gaps.
 */
export function buildLyricSections(lines: PublicLine[]): LyricSection[] {
  const sections: LyricSection[] = [];
  let current: LyricSection = { stanzas: [{ lines: [] }] };
  let currentStanza = current.stanzas[0]!;

  for (const line of lines) {
    const tokens = sanitizeLineTokensForTv(line.tokens);

    if (tokens.length === 0) {
      if (currentStanza.lines.length > 0) {
        current.stanzas.push({ lines: [] });
        currentStanza = current.stanzas[current.stanzas.length - 1]!;
      }
      continue;
    }

    const sectionLabel = isSectionLabelLine(tokens);
    if (sectionLabel) {
      const finalized = finalizeSection(current);
      if (finalized) sections.push(finalized);
      current = { label: sectionLabel, stanzas: [{ lines: [] }] };
      currentStanza = current.stanzas[0]!;
      continue;
    }

    const renderable = tokens.filter(isRenderableToken);
    if (renderable.length === 0) continue;

    currentStanza.lines.push({ tokens: renderable });
  }

  const finalized = finalizeSection(current);
  if (finalized) sections.push(finalized);

  return sections.filter((section) => section.stanzas.length > 0);
}

export function countLyricLines(sections: LyricSection[]): number {
  return sections.reduce(
    (total, section) =>
      total + section.stanzas.reduce((stanzaTotal, stanza) => stanzaTotal + stanza.lines.length, 0),
    0,
  );
}

/** Assign whole sections to columns — never split stanzas across columns. */
export function distributeSectionsToColumns(
  sections: LyricSection[],
  columnCount: number,
): LyricSheetColumn[] {
  if (sections.length === 0) return [];
  if (columnCount <= 1) return [{ sections }];

  const columns: LyricSheetColumn[] = Array.from({ length: columnCount }, () => ({ sections: [] }));
  const weights = Array(columnCount).fill(0);

  for (const section of sections) {
    const sectionWeight =
      section.stanzas.reduce((total, stanza) => total + stanza.lines.length, 0) +
      (section.label ? 2 : 0) +
      section.stanzas.length;

    let target = 0;
    for (let index = 1; index < columnCount; index += 1) {
      if (weights[index]! < weights[target]!) target = index;
    }

    columns[target]!.sections.push(section);
    weights[target]! += sectionWeight;
  }

  return columns.filter((column) => column.sections.length > 0);
}

export function gapsForRevealedFontSize(revealedFontSize: number) {
  return {
    wordGap: Math.min(8, Math.max(3, revealedFontSize * 0.14)),
    lineGap: Math.min(14, Math.max(6, revealedFontSize * 0.22)),
    stanzaGap: Math.min(28, Math.max(12, revealedFontSize * 0.38)),
    columnGap: Math.min(36, Math.max(16, revealedFontSize * 0.45)),
    chipHeight: revealedFontSize * 1.08,
    chipFontSize: revealedFontSize * 0.78,
    chipMinWidth: revealedFontSize * 1.22,
  };
}

export function buildLayoutParams(
  revealedFontSize: number,
  columnCount: number,
): DistanceLayoutParams {
  return {
    revealedFontSize,
    columnCount,
    ...gapsForRevealedFontSize(revealedFontSize),
  };
}

export function toDebugInfo(measurement: DistanceLayoutMeasurement): DistanceLayoutDebugInfo {
  return {
    columns: measurement.params.columnCount,
    revealedFontSize: measurement.revealedFontSize,
    lineCount: measurement.lineCount,
    sectionCount: measurement.sectionCount,
    wrappedLaneCount: measurement.wrappedLaneCount,
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

function heightFitScore(usedHeightRatio: number): number {
  if (usedHeightRatio < 0.82 || usedHeightRatio > 0.96) {
    const distance =
      usedHeightRatio < 0.82 ? 0.82 - usedHeightRatio : usedHeightRatio - 0.96;
    return -distance * 120;
  }
  return 20 - Math.abs(usedHeightRatio - TARGET_HEIGHT_RATIO) * 70;
}

function widthFitScore(usedWidthRatio: number): number {
  if (usedWidthRatio < 0.88 || usedWidthRatio > 0.98) {
    const distance =
      usedWidthRatio < 0.88 ? 0.88 - usedWidthRatio : usedWidthRatio - 0.98;
    return -distance * 100;
  }
  return 14 - Math.abs(usedWidthRatio - TARGET_WIDTH_RATIO) * 60;
}

function wrapPenalty(wrappedLaneCount: number, lineCount: number): number {
  if (lineCount === 0) return 0;
  const ratio = wrappedLaneCount / lineCount;
  return -ratio * 180 - wrappedLaneCount * 8;
}

function lineLengthScore(maxTokensPerLine: number, avgTokensPerLine: number): number {
  let score = 0;
  if (maxTokensPerLine > 14) score -= 200 + (maxTokensPerLine - 14) * 30;
  else if (maxTokensPerLine > 10) score -= (maxTokensPerLine - 10) * 18;
  else score += 12;

  score -= Math.abs(avgTokensPerLine - 7) * 8;
  return score;
}

function columnPreferenceScore(columnCount: number): number {
  if (columnCount === 3) return 24;
  if (columnCount === 4) return 20;
  if (columnCount === 2) return -16;
  return 0;
}

function compareDistanceLayouts(
  a: DistanceLayoutMeasurement,
  b: DistanceLayoutMeasurement,
): number {
  const wrapDelta = wrapPenalty(a.wrappedLaneCount, a.lineCount) - wrapPenalty(b.wrappedLaneCount, b.lineCount);
  if (wrapDelta !== 0) return wrapDelta;

  const lineDelta =
    lineLengthScore(a.maxTokensPerLine, a.avgTokensPerLine) -
    lineLengthScore(b.maxTokensPerLine, b.avgTokensPerLine);
  if (lineDelta !== 0) return lineDelta;

  const columnDelta =
    columnPreferenceScore(a.params.columnCount) - columnPreferenceScore(b.params.columnCount);
  if (columnDelta !== 0) return columnDelta;

  const fontDelta = a.revealedFontSize - b.revealedFontSize;
  if (Math.abs(fontDelta) > DISTANCE_FONT_TIE_EPSILON) return fontDelta;

  const heightDelta = heightFitScore(a.usedHeightRatio) - heightFitScore(b.usedHeightRatio);
  if (heightDelta !== 0) return heightDelta;

  const widthDelta = widthFitScore(a.usedWidthRatio) - widthFitScore(b.usedWidthRatio);
  if (widthDelta !== 0) return widthDelta;

  if (fontDelta !== 0) return fontDelta;

  return b.params.columnCount - a.params.columnCount;
}

export function pickBestDistanceLayout(
  lines: PublicLine[],
  measure: (params: DistanceLayoutParams, columns: LyricSheetColumn[]) => DistanceLayoutMeasurement,
): DistanceLayoutPick {
  const sections = buildLyricSections(lines);
  const valid: DistanceLayoutMeasurement[] = [];
  const columnsByCount = new Map<number, LyricSheetColumn[]>();

  for (let columnCount = DISTANCE_COLUMN_MIN; columnCount <= DISTANCE_COLUMN_MAX; columnCount += 1) {
    const columns = distributeSectionsToColumns(sections, columnCount);
    columnsByCount.set(columnCount, columns);

    for (let fontSize = DISTANCE_FONT_MIN; fontSize <= DISTANCE_FONT_MAX; fontSize += 1) {
      const measurement = measure(buildLayoutParams(fontSize, columnCount), columns);
      if (measurement.overflowX > 1 || measurement.overflowY > 1) continue;
      valid.push(measurement);
    }
  }

  if (valid.length === 0) {
    const columnCount = 3;
    const columns = distributeSectionsToColumns(sections, columnCount);
    const fallback = measure(buildLayoutParams(DISTANCE_FONT_MIN, columnCount), columns);
    return { params: fallback.params, measurement: fallback, columns };
  }

  valid.sort(compareDistanceLayouts);
  const best = valid[valid.length - 1]!;
  return {
    params: best.params,
    measurement: best,
    columns: columnsByCount.get(best.params.columnCount) ?? [],
  };
}

export function summarizeSheetColumns(columns: LyricSheetColumn[]) {
  const lineCounts: number[] = [];

  for (const column of columns) {
    for (const section of column.sections) {
      for (const stanza of section.stanzas) {
        for (const line of stanza.lines) {
          lineCounts.push(countLineUnits(line.tokens));
        }
      }
    }
  }

  const total = lineCounts.reduce((sum, count) => sum + count, 0);
  return {
    lineCount: lineCounts.length,
    sectionCount: columns.reduce((sum, column) => sum + column.sections.length, 0),
    avgTokensPerLine: lineCounts.length > 0 ? total / lineCounts.length : 0,
    maxTokensPerLine: lineCounts.length > 0 ? Math.max(...lineCounts) : 0,
  };
}
