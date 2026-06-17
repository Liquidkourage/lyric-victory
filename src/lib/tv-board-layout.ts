import type { PublicLine } from "./types";

const LINE_BREAK_MARKER = "/";

export function sanitizeLineTokensForTv<T extends { type: string; value?: string }>(tokens: T[]): T[] {
  return tokens.filter(
    (token) => !(token.type === "text" && (token.value === LINE_BREAK_MARKER || token.value?.trim() === "")),
  );
}

export function getVisibleLyricLines(lines: PublicLine[]): PublicLine[] {
  return lines
    .map((line) => ({ ...line, tokens: sanitizeLineTokensForTv(line.tokens) }))
    .filter((line) => line.tokens.length > 0);
}

export function getRowGapRemForLineCount(lineCount: number, baseGapRem: number): number {
  if (lineCount <= 10) return baseGapRem;
  if (lineCount <= 18) return baseGapRem * 0.82;
  if (lineCount <= 28) return baseGapRem * 0.68;
  if (lineCount <= 40) return baseGapRem * 0.55;
  return baseGapRem * 0.45;
}

/** Newspaper-style columns: read down column 1, then column 2, etc. */
export function distributeLinesToColumns(lines: PublicLine[], columnCount: number): PublicLine[][] {
  if (columnCount <= 1 || lines.length === 0) return [lines];

  const columns: PublicLine[][] = [];
  const linesPerColumn = Math.ceil(lines.length / columnCount);

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const chunk = lines.slice(columnIndex * linesPerColumn, (columnIndex + 1) * linesPerColumn);
    if (chunk.length > 0) columns.push(chunk);
  }

  return columns;
}

export function getColumnCountCandidates(lineCount: number): number[] {
  if (lineCount <= 6) return [1];
  if (lineCount <= 12) return [2, 1];
  if (lineCount <= 20) return [3, 2, 1];
  if (lineCount <= 32) return [4, 3, 2, 1];
  if (lineCount <= 48) return [5, 4, 3, 2, 1];
  return [6, 5, 4, 3, 2, 1];
}

export function getRowGapRemForColumn(lineCount: number, columnCount: number, baseGapRem: number): number {
  const linesPerColumn = Math.ceil(lineCount / Math.max(1, columnCount));
  return getRowGapRemForLineCount(linesPerColumn, baseGapRem);
}
