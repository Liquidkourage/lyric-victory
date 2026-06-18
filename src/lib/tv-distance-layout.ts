import { sanitizeLineTokensForTv } from "./tv-board-layout";
import type { PublicLine, PublicToken } from "./types";

const LINE_BREAK_MARKER = "/";
const SHORT_SONG_LINE_COUNT = 14;
const MIN_WIDTH_RATIO = 0.7;
const TARGET_MIN_WIDTH_RATIO = 0.85;

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

interface FlatLine {
  line: PublicLine;
  sectionLabel?: string;
  isStanzaStart: boolean;
}

export interface DistanceLayoutParams {
  revealedFontSize: number;
  columnCount: number;
  wordGap: number;
  continuationGap: number;
  lineGap: number;
  stanzaGap: number;
  sectionGap: number;
  columnGap: number;
  chipHeight: number;
  chipFontSize: number;
  chipMinWidth: number;
}

export interface LinePackResult {
  rows: PublicToken[][];
  wordGapScale: number;
  fontScale: number;
  widthBoostPx: number;
  wrapped: boolean;
}

const MAX_ORPHAN_UNITS = 3;

export const DISTANCE_FONT_MAX = 56;
export const DISTANCE_FONT_MIN = 26;
export const DISTANCE_COLUMN_MIN = 2;
export const DISTANCE_COLUMN_MAX = 5;

export const TARGET_HEIGHT_RATIO = 0.9;
export const TARGET_WIDTH_RATIO = 0.92;

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
  orphanWrapCount: number;
  maxTokensPerLine: number;
  avgTokensPerLine: number;
}

export interface DistanceLayoutDebugInfo {
  columns: number;
  revealedFontSize: number;
  lineCount: number;
  sectionCount: number;
  wrappedLaneCount: number;
  orphanWrapCount: number;
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

export function countLineUnits(tokens: PublicToken[]): number {
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

export function flattenSectionsToLines(sections: LyricSection[]): FlatLine[] {
  const flat: FlatLine[] = [];

  for (const section of sections) {
    section.stanzas.forEach((stanza, stanzaIndex) => {
      stanza.lines.forEach((line, lineIndex) => {
        flat.push({
          line,
          sectionLabel:
            stanzaIndex === 0 && lineIndex === 0 && section.label ? section.label : undefined,
          isStanzaStart: lineIndex === 0,
        });
      });
    });
  }

  return flat;
}

function groupFlatIntoStanzas(flat: FlatLine[]): FlatLine[][] {
  const stanzas: FlatLine[][] = [];
  let current: FlatLine[] = [];

  for (const item of flat) {
    if (item.isStanzaStart && current.length > 0) {
      stanzas.push(current);
      current = [];
    }
    current.push(item);
  }

  if (current.length > 0) stanzas.push(current);
  return stanzas;
}

function rebuildSectionsFromFlatChunk(chunk: FlatLine[]): LyricSection[] {
  if (chunk.length === 0) return [];

  const sections: LyricSection[] = [];
  let current: LyricSection = { stanzas: [{ lines: [] }] };
  let currentStanza = current.stanzas[0]!;

  for (const item of chunk) {
    if (item.sectionLabel && item.isStanzaStart) {
      if (currentStanza.lines.length > 0 || current.label) {
        const finalized = finalizeSection(current);
        if (finalized) sections.push(finalized);
      }
      current = { label: item.sectionLabel, stanzas: [{ lines: [] }] };
      currentStanza = current.stanzas[0]!;
    } else if (item.isStanzaStart && currentStanza.lines.length > 0) {
      current.stanzas.push({ lines: [] });
      currentStanza = current.stanzas[current.stanzas.length - 1]!;
    }

    currentStanza.lines.push(item.line);
  }

  const finalized = finalizeSection(current);
  if (finalized) sections.push(finalized);
  return sections;
}

/** Fill columns sequentially: col 1 top→bottom, then col 2, etc. (newspaper continuation). */
function distributeFlatLinesColumnFill(flat: FlatLine[], columnCount: number): FlatLine[][] {
  if (flat.length === 0) return Array.from({ length: columnCount }, () => []);
  if (columnCount <= 1) return [flat];

  const chunks: FlatLine[][] = Array.from({ length: columnCount }, () => []);
  const totalWeight = flat.reduce(
    (sum, item) => sum + Math.max(1, countLineUnits(item.line.tokens)),
    0,
  );
  const targetPerColumn = totalWeight / columnCount;

  let columnIndex = 0;
  let columnWeight = 0;

  for (const item of flat) {
    const weight = Math.max(1, countLineUnits(item.line.tokens));

    if (
      columnIndex < columnCount - 1 &&
      columnWeight > 0 &&
      columnWeight + weight * 0.5 > targetPerColumn
    ) {
      columnIndex += 1;
      columnWeight = 0;
    }

    chunks[columnIndex]!.push(item);
    columnWeight += weight;
  }

  return chunks;
}

export function distributeSectionsToColumns(
  sections: LyricSection[],
  columnCount: number,
): LyricSheetColumn[] {
  const flat = flattenSectionsToLines(sections);
  const chunks = distributeFlatLinesColumnFill(flat, Math.max(1, columnCount));

  return chunks.map((chunk) => ({
    sections: rebuildSectionsFromFlatChunk(chunk),
  }));
}

export function computeColumnWidth(viewportWidth: number, params: DistanceLayoutParams): number {
  const horizontalPadding = 16;
  const gaps = Math.max(0, params.columnCount - 1) * params.columnGap;
  return Math.max(120, (viewportWidth - horizontalPadding - gaps) / params.columnCount);
}

export function estimateTokenWidthPx(
  token: PublicToken,
  params: DistanceLayoutParams,
  fontScale = 1,
): number {
  const fontSize = params.revealedFontSize * fontScale;
  const chipWidth = params.chipMinWidth * fontScale;

  if (isPunctuationToken(token)) return fontSize * 0.34;

  if (token.type === "blank") {
    if (token.revealed && token.answer) {
      return Math.max(chipWidth, token.answer.length * fontSize * 0.5);
    }
    return chipWidth;
  }

  return Math.max(fontSize * 0.45, token.value.length * fontSize * 0.5);
}

function rowWidthPx(
  tokens: PublicToken[],
  params: DistanceLayoutParams,
  wordGapScale: number,
  fontScale: number,
): number {
  const gap = params.wordGap * wordGapScale;
  return tokens.reduce(
    (sum, token) => sum + estimateTokenWidthPx(token, params, fontScale) + gap,
    0,
  );
}

function continuationUnits(tokens: PublicToken[]): number {
  return countLineUnits(tokens);
}

function splitScore(
  first: PublicToken[],
  second: PublicToken[],
  columnWidthPx: number,
  params: DistanceLayoutParams,
  wordGapScale: number,
  fontScale: number,
): number {
  const firstUnits = countLineUnits(first);
  const secondUnits = countLineUnits(second);
  if (secondUnits === 0) return Number.NEGATIVE_INFINITY;

  let score = 0;
  const totalUnits = firstUnits + secondUnits;
  const balance = totalUnits > 0 ? Math.abs(firstUnits - secondUnits) / totalUnits : 1;
  score -= balance * 80;

  if (secondUnits <= MAX_ORPHAN_UNITS) {
    score -= 200 + (MAX_ORPHAN_UNITS - secondUnits + 1) * 35;
  }
  if (firstUnits <= 2 && secondUnits > MAX_ORPHAN_UNITS) score -= 50;

  const firstWidth = rowWidthPx(first, params, wordGapScale, fontScale);
  const secondWidth = rowWidthPx(second, params, wordGapScale, fontScale);

  if (firstWidth <= columnWidthPx * 1.04) score += 24;
  if (secondWidth <= columnWidthPx * 1.04) score += 24;
  if (secondWidth > columnWidthPx * 1.12) score -= 60;
  if (firstWidth > columnWidthPx * 1.12) score -= 40;

  return score;
}

function findBestSplit(
  tokens: PublicToken[],
  columnWidthPx: number,
  params: DistanceLayoutParams,
  wordGapScale: number,
  fontScale: number,
): { rows: PublicToken[][]; score: number } {
  let bestSplit = 1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let split = 1; split < tokens.length; split += 1) {
    const first = tokens.slice(0, split);
    const second = tokens.slice(split);
    const score = splitScore(first, second, columnWidthPx, params, wordGapScale, fontScale);
    if (score > bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }

  const firstRow = tokens.slice(0, bestSplit);
  const secondRow = tokens.slice(bestSplit);
  if (secondRow.length === 0) return { rows: [firstRow], score: bestScore };

  return { rows: [firstRow, secondRow], score: bestScore };
}

function hasOrphanTail(rows: PublicToken[][]): boolean {
  if (rows.length < 2) return false;
  return continuationUnits(rows[rows.length - 1]!) <= MAX_ORPHAN_UNITS;
}

/** Pack one lyric line into 1–2 balanced rows, trying local fixes before orphan tails. */
export function packTokensIntoRows(
  tokens: PublicToken[],
  columnWidthPx: number,
  params: DistanceLayoutParams,
): LinePackResult {
  if (tokens.length === 0) {
    return { rows: [], wordGapScale: 1, fontScale: 1, widthBoostPx: 0, wrapped: false };
  }

  const singleRowWidth = rowWidthPx(tokens, params, 1, 1);
  if (singleRowWidth <= columnWidthPx * 1.02) {
    return { rows: [tokens], wordGapScale: 1, fontScale: 1, widthBoostPx: 0, wrapped: false };
  }

  type Candidate = LinePackResult & { score: number };
  const candidates: Candidate[] = [];

  const strategies: Array<{
    widthMul: number;
    widthBoostPx: number;
    wordGapScale: number;
    fontScale: number;
  }> = [
    { widthMul: 1, widthBoostPx: 0, wordGapScale: 1, fontScale: 1 },
    { widthMul: 1.05, widthBoostPx: 8, wordGapScale: 1, fontScale: 1 },
    { widthMul: 1.08, widthBoostPx: 12, wordGapScale: 1, fontScale: 1 },
    { widthMul: 1.1, widthBoostPx: 16, wordGapScale: 1, fontScale: 1 },
    { widthMul: 1.12, widthBoostPx: 20, wordGapScale: 1, fontScale: 1 },
  ];

  for (const strategy of strategies) {
    const effectiveWidth = columnWidthPx * strategy.widthMul + strategy.widthBoostPx;
    const { rows, score } = findBestSplit(
      tokens,
      effectiveWidth,
      params,
      strategy.wordGapScale,
      strategy.fontScale,
    );

    candidates.push({
      rows,
      wordGapScale: strategy.wordGapScale,
      fontScale: strategy.fontScale,
      widthBoostPx: strategy.widthBoostPx,
      wrapped: rows.length > 1,
      score,
    });
  }

  candidates.sort((a, b) => {
    const orphanA = hasOrphanTail(a.rows) ? 1 : 0;
    const orphanB = hasOrphanTail(b.rows) ? 1 : 0;
    if (orphanA !== orphanB) return orphanA - orphanB;
    return b.score - a.score;
  });

  const best = candidates[0]!;
  return {
    rows: best.rows,
    wordGapScale: best.wordGapScale,
    fontScale: best.fontScale,
    widthBoostPx: best.widthBoostPx,
    wrapped: best.wrapped,
  };
}

export function countLyricLines(sections: LyricSection[]): number {
  return sections.reduce(
    (total, section) =>
      total + section.stanzas.reduce((stanzaTotal, stanza) => stanzaTotal + stanza.lines.length, 0),
    0,
  );
}

export function gapsForRevealedFontSize(revealedFontSize: number) {
  return {
    wordGap: Math.min(18, Math.max(10, revealedFontSize * 0.28)),
    continuationGap: Math.min(2, Math.max(1, revealedFontSize * 0.028)),
    lineGap: Math.min(12, Math.max(6, revealedFontSize * 0.2)),
    stanzaGap: Math.min(48, Math.max(24, revealedFontSize * 0.62)),
    sectionGap: Math.min(60, Math.max(32, revealedFontSize * 0.78)),
    columnGap: Math.min(48, Math.max(24, revealedFontSize * 0.45)),
    chipHeight: revealedFontSize * 0.9,
    chipFontSize: revealedFontSize * 0.56,
    chipMinWidth: revealedFontSize * 1.04,
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
    orphanWrapCount: measurement.orphanWrapCount,
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
  if (usedHeightRatio < 0.85 || usedHeightRatio > 0.95) {
    const distance =
      usedHeightRatio < 0.85 ? 0.85 - usedHeightRatio : usedHeightRatio - 0.95;
    return -distance * 120;
  }
  return 20 - Math.abs(usedHeightRatio - TARGET_HEIGHT_RATIO) * 70;
}

function widthFitScore(usedWidthRatio: number): number {
  if (usedWidthRatio < TARGET_MIN_WIDTH_RATIO) {
    return -((TARGET_MIN_WIDTH_RATIO - usedWidthRatio) * 200);
  }
  return 16 - Math.abs(usedWidthRatio - TARGET_WIDTH_RATIO) * 45;
}

function wrapQualityScore(measurement: DistanceLayoutMeasurement): number {
  return (
    -measurement.orphanWrapCount * 110 -
    measurement.wrappedLaneCount * 8 -
    (measurement.lineCount > 0 ? (measurement.wrappedLaneCount / measurement.lineCount) * 70 : 0)
  );
}

function isAcceptableWidth(measurement: DistanceLayoutMeasurement): boolean {
  if (measurement.lineCount <= SHORT_SONG_LINE_COUNT) return true;
  return measurement.usedWidthRatio >= MIN_WIDTH_RATIO;
}

function compareDistanceLayouts(
  a: DistanceLayoutMeasurement,
  b: DistanceLayoutMeasurement,
): number {
  const wrapDelta = wrapQualityScore(a) - wrapQualityScore(b);
  if (wrapDelta !== 0) return wrapDelta;

  const fontDelta = a.revealedFontSize - b.revealedFontSize;
  if (Math.abs(fontDelta) > 2) return fontDelta;

  const widthDelta = widthFitScore(a.usedWidthRatio) - widthFitScore(b.usedWidthRatio);
  if (widthDelta !== 0) return widthDelta;

  const heightDelta = heightFitScore(a.usedHeightRatio) - heightFitScore(b.usedHeightRatio);
  if (heightDelta !== 0) return heightDelta;

  if (fontDelta !== 0) return fontDelta;

  return a.params.columnCount - b.params.columnCount;
}

function maxFittingFontForColumns(
  columnCount: number,
  columns: LyricSheetColumn[],
  measure: (params: DistanceLayoutParams, columns: LyricSheetColumn[]) => DistanceLayoutMeasurement,
): DistanceLayoutMeasurement | null {
  let lo = DISTANCE_FONT_MIN;
  let hi = DISTANCE_FONT_MAX;
  let best: DistanceLayoutMeasurement | null = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const measurement = measure(buildLayoutParams(mid, columnCount), columns);

    if (measurement.overflowX <= 1 && measurement.overflowY <= 1 && isAcceptableWidth(measurement)) {
      best = measurement;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
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

    const bestForColumns = maxFittingFontForColumns(columnCount, columns, measure);
    if (bestForColumns) valid.push(bestForColumns);
  }

  if (valid.length === 0) {
    const columnCount = Math.min(3, DISTANCE_COLUMN_MAX);
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
