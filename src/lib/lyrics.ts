import type { LyricToken, ParsedLyric } from "./types";

const BLANK_PATTERN = /\{(\d+)\}/g;

export function parseLyricTemplate(template: string): ParsedLyric {
  const tokens: LyricToken[] = [];
  const answers: string[] = [];
  const lines: LyricToken[][] = [[]];
  let blankIndex = 0;

  const normalized = template.replace(/\r\n/g, "\n").trim();
  const regex = new RegExp(BLANK_PATTERN.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    appendText(normalized.slice(lastIndex, match.index), tokens, lines);
    const length = Number(match[1]);
    const blank: LyricToken = { type: "blank", index: blankIndex, length };
    tokens.push(blank);
    lines[lines.length - 1].push(blank);
    answers.push("");
    blankIndex += 1;
    lastIndex = regex.lastIndex;
  }

  appendText(normalized.slice(lastIndex), tokens, lines);

  return { template: normalized, tokens, answers, lines };
}

function appendText(segment: string, tokens: LyricToken[], lines: LyricToken[][]) {
  if (!segment) return;

  const parts = segment.split("\n");
  parts.forEach((part, index) => {
    if (part) {
      const textToken: LyricToken = { type: "text", value: part };
      tokens.push(textToken);
      lines[lines.length - 1].push(textToken);
    }
    if (index < parts.length - 1) {
      lines.push([]);
    }
  });
}

export function attachAnswers(parsed: ParsedLyric, answers: string[]): ParsedLyric {
  const normalizedAnswers = answers.map((answer) => answer.trim().toLowerCase());
  if (normalizedAnswers.length !== parsed.answers.length) {
    throw new Error("Answer count does not match blank count.");
  }
  return { ...parsed, answers: normalizedAnswers };
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "is", "it",
  "i", "you", "we", "they", "he", "she", "my", "your", "our", "be", "are", "was", "were",
]);

export function plainLyricsToTemplate(
  plainLyrics: string,
  blankEvery = 2,
): { template: string; answers: string[] } {
  const answers: string[] = [];
  const outputLines: string[] = [];

  for (const rawLine of plainLyrics.replace(/\r\n/g, "\n").split("\n")) {
    const words = rawLine.match(/\S+/g) ?? [];
    if (words.length === 0) {
      outputLines.push("");
      continue;
    }

    const rendered: string[] = [];
    words.forEach((word, index) => {
      const cleaned = word.replace(/^[^\w']+|[^\w']+$/g, "");
      const shouldBlank =
        cleaned.length >= 3 &&
        !STOP_WORDS.has(cleaned.toLowerCase()) &&
        index % blankEvery === 0;

      if (shouldBlank && cleaned.length > 0) {
        rendered.push(`{${cleaned.length}}`);
        answers.push(cleaned.toLowerCase());
      } else {
        rendered.push(word);
      }
    });

    outputLines.push(rendered.join(" "));
  }

  return { template: outputLines.join("\n"), answers };
}

export function normalizeSongTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s']/g, "")
    .replace(/\s+/g, " ");
}

export function titlesMatch(guess: string, answer: string): boolean {
  const normalizedGuess = normalizeSongTitle(guess);
  const normalizedAnswer = normalizeSongTitle(answer);
  if (!normalizedGuess || !normalizedAnswer) return false;
  return (
    normalizedGuess === normalizedAnswer ||
    normalizedAnswer.includes(normalizedGuess) ||
    normalizedGuess.includes(normalizedAnswer)
  );
}

export function countBlanks(template: string): number {
  return [...template.matchAll(BLANK_PATTERN)].length;
}
