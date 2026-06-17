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
