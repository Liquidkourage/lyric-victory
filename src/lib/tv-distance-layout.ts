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

function snapSplitToStanzaStart(flat: FlatLine[], targetIndex: number, minIndex: number): number {
  const searchRadius = 4;
  let best = targetIndex;

  for (let offset = 0; offset <= searchRadius; offset += 1) {
    const forward = targetIndex + offset;
    if (forward > minIndex && forward < flat.length && flat[forward]?.isStanzaStart) {
      return forward;
    }

    const backward = targetIndex - offset;
    if (backward > minIndex && backward < flat.length && flat[backward]?.isStanzaStart) {
      return backward;
    }
  }

  return best;
}

function splitFlatLinesIntoColumns(flat: FlatLine[], columnCount: number): FlatLine[][] {
  if (flat.length === 0) return Array.from({ length: columnCount }, () => []);
  if (columnCount <= 1) return [flat];

  const linesPerColumn = Math.ceil(flat.length / columnCount);
  const chunks: FlatLine[][] = [];
  let start = 0;

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    if (start >= flat.length) {
      chunks.push([]);
      continue;
    }

    const isLast = columnIndex === columnCount - 1;
    let end = isLast ? flat.length : Math.min(start + linesPerColumn, flat.length);

    if (!isLast && end < flat.length) {
      end = snapSplitToStanzaStart(flat, end, start);
      if (end <= start) end = Math.min(start + linesPerColumn, flat.length);
    }

    chunks.push(flat.slice(start, end));
    start = end;
  }

  return chunks;
}

/**
 * Newspaper-style column flow: read down column 1, then column 2, etc.
 * Keeps stanza starts intact when possible and always returns N column slots.
 */
export function distributeSectionsToColumns(
  sections: LyricSection[],
  columnCount: number,
): LyricSheetColumn[] {
  const flat = flattenSectionsToLines(sections);
  const chunks = splitFlatLinesIntoColumns(flat, Math.max(1, columnCount));

  return chunks.map((chunk) => ({
    sections: rebuildSectionsFromFlatChunk(chunk),
  }));
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
    wordGap: Math.min(8, Math.max(3, revealedFontSize * 0.14)),
    lineGap: Math.min(14, Math.max(6, revealedFontSize * 0.22)),
    stanzaGap: Math.min(28, Math.max(12, revealedFontSize * 0.38)),
    columnGap: Math.min(48, Math.max(24, revealedFontSize * 0.45)),
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
  if (usedHeightRatio < 0.85 || usedHeightRatio > 0.95) {
    const distance =
      usedHeightRatio < 0.85 ? 0.85 - usedHeightRatio : usedHeightRatio - 0.95;
    return -distance * 140;
  }
  return 24 - Math.abs(usedHeightRatio - TARGET_HEIGHT_RATIO) * 80;
}

function widthFitScore(usedWidthRatio: number): number {
  if (usedWidthRatio < TARGET_MIN_WIDTH_RATIO) {
    return -((TARGET_MIN_WIDTH_RATIO - usedWidthRatio) * 220);
  }
  return 20 - Math.abs(usedWidthRatio - TARGET_WIDTH_RATIO) * 50;
}

function wrapPenalty(wrappedLaneCount: number, lineCount: number): number {
  if (lineCount === 0) return 0;
  return -(wrappedLaneCount / lineCount) * 120 - wrappedLaneCount * 6;
}

function isAcceptableWidth(measurement: DistanceLayoutMeasurement): boolean {
  if (measurement.lineCount <= SHORT_SONG_LINE_COUNT) return true;
  return measurement.usedWidthRatio >= MIN_WIDTH_RATIO;
}

function compareDistanceLayouts(
  a: DistanceLayoutMeasurement,
  b: DistanceLayoutMeasurement,
): number {
  const fontDelta = a.revealedFontSize - b.revealedFontSize;
  if (fontDelta !== 0) return fontDelta;

  const widthDelta = widthFitScore(a.usedWidthRatio) - widthFitScore(b.usedWidthRatio);
  if (widthDelta !== 0) return widthDelta;

  const heightDelta = heightFitScore(a.usedHeightRatio) - heightFitScore(b.usedHeightRatio);
  if (heightDelta !== 0) return heightDelta;

  const wrapDelta = wrapPenalty(a.wrappedLaneCount, a.lineCount) - wrapPenalty(b.wrappedLaneCount, b.lineCount);
  if (wrapDelta !== 0) return wrapDelta;

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
  const lineCount = countLyricLines(sections);
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
