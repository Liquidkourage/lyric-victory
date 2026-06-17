import { normalizeWordGuess } from "./lyrics";

// Curated auto-reveal words: pre-shown on the board and worth 0 points if guessed.
// Built via host corpus tuning (top-10 cutoff).
export const AUTO_REVEAL_WORDS = new Set([
  "a",
  "and",
  "i",
  "is",
  "la",
  "of",
  "oh",
  "the",
  "to",
  "you",
]);

/** @deprecated Use AUTO_REVEAL_WORDS */
export const INCREDIBLY_COMMON_WORDS = AUTO_REVEAL_WORDS;

export function isAutoRevealWord(rawWord: string, autoRevealWords: ReadonlySet<string> = AUTO_REVEAL_WORDS) {
  const word = normalizeWordGuess(rawWord);
  return word !== "" && autoRevealWords.has(word);
}

/** @deprecated Use isAutoRevealWord */
export const isIncrediblyCommonWord = isAutoRevealWord;
