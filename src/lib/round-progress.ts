import type { PublicLine } from "./types";

export function getBlankProgress(lines: PublicLine[]) {
  let totalBlanks = 0;
  let revealedBlanks = 0;

  for (const line of lines) {
    for (const token of line.tokens) {
      if (token.type !== "blank") continue;
      totalBlanks += 1;
      if (token.revealed) revealedBlanks += 1;
    }
  }

  return {
    totalBlanks,
    revealedBlanks,
    hiddenBlanks: totalBlanks - revealedBlanks,
  };
}
