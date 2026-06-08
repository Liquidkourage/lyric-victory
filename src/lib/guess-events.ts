import type { WordGuessEntry } from "./types";

export interface GroupedWordGuess extends WordGuessEntry {
  count: number;
  totalPoints: number;
}

export function groupWordGuessEntries(guesses: WordGuessEntry[]): GroupedWordGuess[] {
  const grouped: GroupedWordGuess[] = [];

  for (const guess of guesses) {
    const previous = grouped[grouped.length - 1];
    if (
      previous &&
      previous.playerId === guess.playerId &&
      previous.word === guess.word &&
      previous.accepted === guess.accepted &&
      previous.submittedAt === guess.submittedAt
    ) {
      previous.count += 1;
      previous.totalPoints += guess.points ?? 0;
      continue;
    }

    grouped.push({
      ...guess,
      count: 1,
      totalPoints: guess.points ?? 0,
    });
  }

  return grouped;
}
