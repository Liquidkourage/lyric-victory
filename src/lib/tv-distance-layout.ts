import { sanitizeLineTokensForTv } from "./tv-board-layout";
import type { PublicLine, PublicToken } from "./types";

const LINE_BREAK_MARKER = "/";
const SHORT_SONG_LINE_COUNT = 14;
const MIN_WIDTH_RATIO = 0.7;
const TARGET_MIN_WIDTH_RATIO = 0.85;
const MIN_CONTINUATION_UNITS = 3;

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

/** Assign whole stanzas to columns — never split a stanza across columns. */
function splitStanzasIntoColumns(flat: FlatLine[], columnCount: number): FlatLine[][] {
  if (flat.length === 0) return Array.from({ length: columnCount }, () => []);
  if (columnCount <= 1) return [flat];

  const stanzas = groupFlatIntoStanzas(flat);
  const chunks: FlatLine[][] = Array.from({ length: columnCount }, () => []);
  const weights = Array(columnCount).fill(0);

  for (const stanza of stanzas) {
    let target = 0;
    for (let index = 1; index < columnCount; index += 1) {
      if (weights[index]! < weights[target]!) target = index;
    }

    chunks[target]!.push(...stanza);
    weights[target]! += stanza.length;
  }

  return chunks;
}

export function distributeSectionsToColumns(
  sections: LyricSection[],
  columnCount: number,
): LyricSheetColumn[] {
  const flat = flattenSectionsToLines(sections);
  const chunks = splitStanzasIntoColumns(flat, Math.max(1, columnCount));

  return chunks.map((chunk) => ({
    sections: rebuildSectionsFromFlatChunk(chunk),
  }));
}

export function computeColumnWidth(viewportWidth: number, params: DistanceLayoutParams): number {
  const horizontalPadding = 16;
  const gaps = Math.max(0, params.columnCount - 1) * params.columnGap;
  return Math.max(120, (viewportWidth - horizontalPadding - gaps) / params.columnCount);
}

export function estimateTokenWidthPx(token: PublicToken, params: DistanceLayoutParams): number {
  if (isPunctuationToken(token)) return params.revealedFontSize * 0.34;

  if (token.type === "blank") {
    if (token.revealed && token.answer) {
      return Math.max(params.chipMinWidth, token.answer.length * params.revealedFontSize * 0.5);
    }
    return params.chipMinWidth;
  }

  return Math.max(params.revealedFontSize * 0.45, token.value.length * params.revealedFontSize * 0.5);
}

function countRowUnits(tokens: PublicToken[]): number {
  return countLineUnits(tokens);
}

/** Pack one lyric line into 1–2 balanced rows for its column width. */
export function packTokensIntoRows(
  tokens: PublicToken[],
  columnWidthPx: number,
  params: DistanceLayoutParams,
): PublicToken[][] {
  if (tokens.length === 0) return [];

  let totalWidth = 0;
  for (const token of tokens) {
    totalWidth += estimateTokenWidthPx(token, params) + params.wordGap;
  }

  if (totalWidth <= columnWidthPx * 1.02) {
    return [tokens];
  }

  let bestSplit = 1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let split = 1; split < tokens.length; split += 1) {
    const first = tokens.slice(0, split);
    const second = tokens.slice(split);
    const firstUnits = countRowUnits(first);
    const secondUnits = countRowUnits(second);

    if (secondUnits === 0) continue;

    let score = 0;
    score -= Math.abs(firstUnits - secondUnits) * 12;

    if (secondUnits <= 2) score -= 120;
    if (secondUnits === 1) score -= 80;
    if (firstUnits <= 2 && secondUnits > 2) score -= 60;

    const firstWidth = first.reduce(
      (sum, token) => sum + estimateTokenWidthPx(token, params) + params.wordGap,
      0,
    );
    const secondWidth = second.reduce(
      (sum, token) => sum + estimateTokenWidthPx(token, params) + params.wordGap,
      0,
    );

    if (firstWidth <= columnWidthPx * 1.05) score += 20;
    if (secondWidth <= columnWidthPx * 1.05) score += 20;
    if (secondWidth > columnWidthPx * 1.15) score -= 40;

    if (score > bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }

  const firstRow = tokens.slice(0, bestSplit);
  const secondRow = tokens.slice(bestSplit);

  if (secondRow.length === 0) return [firstRow];
  return [firstRow, secondRow];
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
    wordGap: Math.min(7, Math.max(3, revealedFontSize * 0.12)),
    lineGap: Math.min(11, Math.max(5, revealedFontSize * 0.18)),
    stanzaGap: Math.min(36, Math.max(16, revealedFontSize * 0.48)),
    columnGap: Math.min(48, Math.max(24, revealedFontSize * 0.45)),
    chipHeight: revealedFontSize * 1.02,
    chipFontSize: revealedFontSize * 0.66,
    chipMinWidth: revealedFontSize * 1.16,
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
    -measurement.orphanWrapCount * 90 -
    measurement.wrappedLaneCount * 10 -
    (measurement.lineCount > 0 ? (measurement.wrappedLaneCount / measurement.lineCount) * 80 : 0)
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

export { MIN_CONTINUATION_UNITS };
