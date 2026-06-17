import { attachAnswers, normalizeWordGuess, parseLyricTemplate } from "./lyrics";
import type { PublicLine, RoundConfig } from "./types";

export function buildPreviewLines(round: Pick<RoundConfig, "template" | "answers">, autoRevealWords: ReadonlySet<string>): PublicLine[] {
  const parsed = attachAnswers(parseLyricTemplate(round.template), round.answers);

  return parsed.lines.map((line) => ({
    tokens: line.map((token) => {
      if (token.type === "text") {
        return { type: "text" as const, value: token.value };
      }

      const answer = parsed.answers[token.index] ?? "";
      const revealed = autoRevealWords.has(normalizeWordGuess(answer));

      return {
        type: "blank" as const,
        index: token.index,
        length: token.length,
        revealed,
        answer: revealed ? answer : undefined,
      };
    }),
  }));
}
