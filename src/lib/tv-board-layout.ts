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

export function chunkLyricLines(lines: PublicLine[], pageSize: number): PublicLine[][] {
  if (lines.length === 0) return [];
  const pages: PublicLine[][] = [];
  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }
  return pages;
}

export function getPageIndexForLine(lineIndex: number, pageSize: number): number {
  return Math.floor(lineIndex / pageSize);
}

export function getRevealSignature(lines: PublicLine[]): string {
  return lines
    .map((line) =>
      line.tokens
        .filter((token) => token.type === "blank")
        .map((token) =>
          token.type === "blank"
            ? token.revealed
              ? `1:${token.answer ?? ""}`
              : `0:${token.length}`
            : "",
        )
        .join(","),
    )
    .join("|");
}

export function findNewlyRevealedLineIndex(previous: PublicLine[], next: PublicLine[]): number | null {
  for (let lineIndex = 0; lineIndex < next.length; lineIndex += 1) {
    const nextLine = next[lineIndex];
    const previousLine = previous[lineIndex];
    if (!nextLine) continue;

    for (let tokenIndex = 0; tokenIndex < nextLine.tokens.length; tokenIndex += 1) {
      const nextToken = nextLine.tokens[tokenIndex];
      if (nextToken.type !== "blank" || !nextToken.revealed) continue;

      const previousToken = previousLine?.tokens[tokenIndex];
      const wasHidden = !previousToken || previousToken.type !== "blank" || !previousToken.revealed;
      if (wasHidden) return lineIndex;
    }
  }

  return null;
}

export const TV_PAGE_SIZE_CANDIDATES = [12, 10, 8, 6, 5, 4] as const;
