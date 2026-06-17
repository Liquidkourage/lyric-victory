import { normalizeWordGuess } from "./lyrics";

// Redactle-style auto-reveal words: pre-shown on the board and worth 0 points if guessed.
// Articles, pronouns, all prepositions, plus and/or/but only — other conjunctions stay playable.
// Auxiliaries (is, was, have) and adverbs (not, no) stay playable.

const ARTICLES = ["a", "an", "the"] as const;

const PRONOUNS = [
  // subject
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  // object
  "me",
  "him",
  "her",
  "us",
  "them",
  // possessive
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
] as const;

const PREPOSITIONS = [
  "aboard",
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "alongside",
  "amid",
  "amidst",
  "among",
  "amongst",
  "around",
  "as",
  "at",
  "atop",
  "before",
  "behind",
  "below",
  "beneath",
  "beside",
  "besides",
  "between",
  "beyond",
  "by",
  "concerning",
  "considering",
  "despite",
  "down",
  "during",
  "except",
  "excluding",
  "following",
  "for",
  "from",
  "given",
  "in",
  "including",
  "inside",
  "into",
  "like",
  "minus",
  "near",
  "notwithstanding",
  "of",
  "off",
  "on",
  "onto",
  "opposite",
  "out",
  "outside",
  "over",
  "past",
  "pending",
  "per",
  "plus",
  "regarding",
  "round",
  "save",
  "through",
  "throughout",
  "till",
  "to",
  "toward",
  "towards",
  "under",
  "underneath",
  "unlike",
  "until",
  "up",
  "upon",
  "versus",
  "via",
  "with",
  "within",
  "without",
  "worth",
] as const;

// Only the big three coordinating conjunctions auto-reveal; all others are playable blanks.
const CONJUNCTIONS = ["and", "or", "but"] as const;

export const AUTO_REVEAL_WORD_CATEGORIES = {
  articles: ARTICLES,
  pronouns: PRONOUNS,
  prepositions: PREPOSITIONS,
  conjunctions: CONJUNCTIONS,
} as const;

export const INCREDIBLY_COMMON_WORDS = new Set<string>([
  ...ARTICLES,
  ...PRONOUNS,
  ...PREPOSITIONS,
  ...CONJUNCTIONS,
]);

export function isIncrediblyCommonWord(rawWord: string, autoRevealWords: ReadonlySet<string> = INCREDIBLY_COMMON_WORDS) {
  const word = normalizeWordGuess(rawWord);
  return word !== "" && autoRevealWords.has(word);
}
