"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GroupedWordGuess } from "@/lib/guess-events";

const MAX_SCORE_CHIPS = 10;
const MISS_FLASH_MS = 2600;

function guessPopId(guess: GroupedWordGuess): string {
  return `${guess.playerId}-${guess.word}-${guess.submittedAt ?? 0}`;
}

function ScoreChip({
  guess,
  pop,
}: {
  guess: GroupedWordGuess;
  pop: boolean;
}) {
  const countLabel = guess.count > 1 ? ` ×${guess.count}` : "";

  return (
    <div
      className={`display-score-pop flex shrink-0 items-baseline gap-2 rounded-lg border border-[#fde047]/25 bg-black/55 px-3 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.45)${pop ? "" : " display-score-pop--settled"}`}
    >
      <span className="text-lg font-black tracking-tight text-white">{guess.playerName}</span>
      <span className="text-base font-bold text-white/45">→</span>
      <span className="text-lg font-extrabold text-[#fde047]">
        {guess.word}
        {countLabel}
      </span>
      <span className="text-xl font-black tabular-nums text-[#86efac]">+{guess.totalPoints}</span>
    </div>
  );
}

function MissChip({ guess }: { guess: GroupedWordGuess }) {
  return (
    <div className="display-score-miss flex shrink-0 items-baseline gap-2 rounded-lg border border-red-400/20 bg-black/45 px-3 py-1.5">
      <span className="text-lg font-black tracking-tight text-white/80">{guess.playerName}</span>
      <span className="text-base font-bold text-white/35">→</span>
      <span className="text-lg font-extrabold text-red-300/90">{guess.word}</span>
      <span className="text-sm font-black uppercase tracking-wide text-red-400/70">miss</span>
    </div>
  );
}

export function DisplayScoreFeed({
  recentWordGuesses,
  roundKey,
}: {
  recentWordGuesses: GroupedWordGuess[];
  roundKey: number;
}) {
  const scoreChips = useMemo(
    () =>
      recentWordGuesses
        .filter((guess) => guess.accepted && guess.totalPoints > 0)
        .slice(0, MAX_SCORE_CHIPS)
        .reverse(),
    [recentWordGuesses],
  );

  const [scorePopId, setScorePopId] = useState<string | null>(null);
  const [missFlash, setMissFlash] = useState<GroupedWordGuess | null>(null);
  const prevScoreRef = useRef<string | null>(null);
  const prevMissRef = useRef<string | null>(null);

  useEffect(() => {
    prevScoreRef.current = null;
    prevMissRef.current = null;
    setScorePopId(null);
    setMissFlash(null);
  }, [roundKey]);

  useEffect(() => {
    const latestScore = recentWordGuesses.find((guess) => guess.accepted && guess.totalPoints > 0);
    if (!latestScore) return;

    const id = guessPopId(latestScore);
    if (id === prevScoreRef.current) return;
    prevScoreRef.current = id;
    setScorePopId(id);

    const timer = window.setTimeout(() => {
      setScorePopId((current) => (current === id ? null : current));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [recentWordGuesses]);

  useEffect(() => {
    const latestMiss = recentWordGuesses.find((guess) => !guess.accepted);
    if (!latestMiss) return;

    const id = guessPopId(latestMiss);
    if (id === prevMissRef.current) return;
    prevMissRef.current = id;
    setMissFlash(latestMiss);

    const timer = window.setTimeout(() => {
      setMissFlash((current) => (current && guessPopId(current) === id ? null : current));
    }, MISS_FLASH_MS);

    return () => window.clearTimeout(timer);
  }, [recentWordGuesses]);

  return (
    <aside
      className="display-distance-score-lane shrink-0 overflow-hidden"
      aria-live="polite"
      aria-label="Recent scores"
    >
      <div className="flex min-h-[52px] items-center gap-3 overflow-x-auto px-4 py-2 pl-24">
        {scoreChips.map((guess) => (
          <ScoreChip
            key={guessPopId(guess)}
            guess={guess}
            pop={guessPopId(guess) === scorePopId}
          />
        ))}
        {missFlash ? <MissChip key={guessPopId(missFlash)} guess={missFlash} /> : null}
      </div>
    </aside>
  );
}
