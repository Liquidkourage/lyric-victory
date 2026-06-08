import { normalizeWordGuess } from "./lyrics";
import { LYRIC_STEM_RANKS } from "./lyric-stem-ranks";

export const MIN_WORD_POINTS = 10;
export const MAX_WORD_POINTS = 100;
export const WORD_RARITY_SCALE = 18;
export const REPEATED_WORD_DECAY = 0.8;

type LyricScoreSource = "override" | "corpus" | "fallback";

export type LyricWordScoreBreakdown = {
  word: string;
  matchedStem: string | null;
  rank: number;
  basePoints: number;
  pointsPerBlank: number;
  pointValues: number[];
  totalPoints: number;
  totalAppearances: number;
  source: LyricScoreSource;
  stemCandidates: string[];
};

// Singalong/filler words need a little extra nerfing even though the lyric corpus
// already knows they are common.
export const LYRIC_BASE_POINT_OVERRIDES: Record<string, number> = {
  oh: 18,
  ooh: 18,
  ah: 18,
  la: 18,
  na: 18,
  yeah: 22,
  yea: 22,
  hey: 28,
  whoa: 30,
  woah: 30,
};

const MANUAL_STEM_ALIASES: Record<string, string> = {
  baby: "babi",
  babies: "babi",

  going: "go",
  goin: "go",
  goes: "go",

  doing: "do",
  doin: "do",

  being: "be",

  loving: "love",
  lovin: "love",

  dance: "danc",
  dances: "danc",
  danced: "danc",
  dancing: "danc",

  lonely: "lone",
  forever: "forev",

  surrender: "surrend",
  surrendered: "surrend",
  surrendering: "surrend",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stripDoubleFinal(value: string) {
  if (value.length < 3) return value;

  const last = value[value.length - 1];
  const previous = value[value.length - 2];

  if (last && previous && last === previous) {
    return value.slice(0, -1);
  }

  return value;
}

function addCandidate(candidates: Set<string>, value: string) {
  const normalized = normalizeWordGuess(value);
  if (normalized) {
    candidates.add(normalized);
  }
}

export function getLyricStemCandidates(rawWord: string) {
  const word = normalizeWordGuess(rawWord);
  const candidates = new Set<string>();

  if (!word) {
    return [];
  }

  addCandidate(candidates, word);

  const manualAlias = MANUAL_STEM_ALIASES[word];
  if (manualAlias) {
    addCandidate(candidates, manualAlias);
  }

  if (word.endsWith("ies") && word.length > 4) {
    addCandidate(candidates, `${word.slice(0, -3)}i`);
  }

  if (word.endsWith("y") && word.length > 3) {
    addCandidate(candidates, `${word.slice(0, -1)}i`);
  }

  if (word.endsWith("ing") && word.length > 4) {
    const base = word.slice(0, -3);
    addCandidate(candidates, base);
    addCandidate(candidates, stripDoubleFinal(base));
    addCandidate(candidates, `${base}e`);

    if (base.endsWith("y") && base.length > 2) {
      addCandidate(candidates, `${base.slice(0, -1)}i`);
    }
  }

  if (word.endsWith("ed") && word.length > 4) {
    const base = word.slice(0, -2);
    addCandidate(candidates, base);
    addCandidate(candidates, stripDoubleFinal(base));
    addCandidate(candidates, `${base}e`);
  }

  if (word.endsWith("es") && word.length > 4) {
    addCandidate(candidates, word.slice(0, -2));
    addCandidate(candidates, word.slice(0, -1));
  }

  if (word.endsWith("s") && word.length > 3) {
    addCandidate(candidates, word.slice(0, -1));
  }

  return [...candidates];
}

export function getFallbackLyricRank(word: string) {
  if (word.length <= 2) return 100;
  if (word.length <= 4) return 2_000;
  if (word.length <= 7) return 15_000;
  return 60_000;
}

export function getBaseWordPointsFromRank(rank: number) {
  return clamp(
    Math.round(MIN_WORD_POINTS + WORD_RARITY_SCALE * Math.log10(rank)),
    MIN_WORD_POINTS,
    MAX_WORD_POINTS,
  );
}

function getProgressivePointValues(basePoints: number, totalAppearances: number) {
  const count = Math.max(1, totalAppearances);

  return Array.from({ length: count }, (_, index) =>
    Math.max(1, Math.round(basePoints * REPEATED_WORD_DECAY ** index)),
  );
}

export function getLyricWordScoreBreakdown(
  rawWord: string,
  totalAppearances: number,
): LyricWordScoreBreakdown {
  const word = normalizeWordGuess(rawWord);
  const stemCandidates = getLyricStemCandidates(word);

  if (!word) {
    return {
      word,
      matchedStem: null,
      rank: 0,
      basePoints: MIN_WORD_POINTS,
      pointsPerBlank: MIN_WORD_POINTS,
      pointValues: [MIN_WORD_POINTS],
      totalPoints: MIN_WORD_POINTS,
      totalAppearances,
      source: "fallback",
      stemCandidates,
    };
  }

  let matchedStem: string | null = null;
  let matchedRank: number | null = null;

  for (const candidate of stemCandidates) {
    const rank = LYRIC_STEM_RANKS[candidate];
    if (!rank) continue;

    // Prefer the most common matching stem, not the first candidate.
    // The dataset sometimes contains rare exact forms while the useful lyric stem is common.
    if (matchedRank === null || rank < matchedRank) {
      matchedStem = candidate;
      matchedRank = rank;
    }
  }

  const overrideBasePoints = LYRIC_BASE_POINT_OVERRIDES[word];
  const rank = matchedRank ?? getFallbackLyricRank(word);
  const basePoints = overrideBasePoints ?? getBaseWordPointsFromRank(rank);
  const pointValues = getProgressivePointValues(basePoints, totalAppearances);
  const totalPoints = pointValues.reduce((sum, value) => sum + value, 0);
  const pointsPerBlank = pointValues[0] ?? basePoints;

  return {
    word,
    matchedStem,
    rank,
    basePoints,
    pointsPerBlank,
    pointValues,
    totalPoints,
    totalAppearances,
    source: overrideBasePoints !== undefined ? "override" : matchedRank ? "corpus" : "fallback",
    stemCandidates,
  };
}

export function getWordGuessPointValues(word: string, totalAppearances: number) {
  return getLyricWordScoreBreakdown(word, totalAppearances).pointValues;
}

export function getWordGuessTotalPoints(word: string, totalAppearances: number) {
  return getLyricWordScoreBreakdown(word, totalAppearances).totalPoints;
}

export function getWordGuessPoints(word: string, totalAppearances: number) {
  return getLyricWordScoreBreakdown(word, totalAppearances).pointsPerBlank;
}
