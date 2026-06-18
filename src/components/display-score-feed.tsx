"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GroupedWordGuess } from "@/lib/guess-events";

const MAX_SCORE_CHIPS = 8;
const TICKER_CYCLE_MS = 3200;
const MISS_FLASH_MS = 2600;

function guessPopId(guess: GroupedWordGuess): string {
  return `${guess.playerId}-${guess.word}-${guess.submittedAt ?? 0}`;
}

function ScoreChip({
  guess,
  entering,
}: {
  guess: GroupedWordGuess;
  entering: boolean;
}) {
  const countLabel = guess.count > 1 ? ` ×${guess.count}` : "";

  return (
    <div
      className={`display-score-pop flex shrink-0 items-baseline gap-2 rounded-lg border border-[#fde047]/25 bg-black/55 px-3 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.45)${entering ? "" : " display-score-pop--settled"}`}
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
  const acceptedScores = useMemo(
    () => recentWordGuesses.filter((guess) => guess.accepted && guess.totalPoints > 0),
    [recentWordGuesses],
  );

  const [windowStart, setWindowStart] = useState(0);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [missFlash, setMissFlash] = useState<GroupedWordGuess | null>(null);
  const prevLatestScoreRef = useRef<string | null>(null);
  const prevMissRef = useRef<string | null>(null);

  useEffect(() => {
    prevLatestScoreRef.current = null;
    prevMissRef.current = null;
    setWindowStart(0);
    setEnteringId(null);
    setMissFlash(null);
  }, [roundKey]);

  useEffect(() => {
    const latestScore = acceptedScores[0];
    if (!latestScore) return;

    const id = guessPopId(latestScore);
    if (id === prevLatestScoreRef.current) return;
    prevLatestScoreRef.current = id;
    setWindowStart(0);
    setEnteringId(id);

    const timer = window.setTimeout(() => {
      setEnteringId((current) => (current === id ? null : current));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [acceptedScores]);

  useEffect(() => {
    if (acceptedScores.length <= MAX_SCORE_CHIPS) return;

    const timer = window.setInterval(() => {
      setWindowStart((current) => {
        const maxStart = acceptedScores.length - MAX_SCORE_CHIPS;
        return current >= maxStart ? 0 : current + 1;
      });
    }, TICKER_CYCLE_MS);

    return () => window.clearInterval(timer);
  }, [acceptedScores.length]);

  const scoreChips = useMemo(() => {
    const windowed = acceptedScores.slice(windowStart, windowStart + MAX_SCORE_CHIPS);
    return [...windowed].reverse();
  }, [acceptedScores, windowStart]);

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
      className="display-distance-score-lane shrink-0"
      aria-live="polite"
      aria-label="Recent scores"
    >
      <div className="display-score-ticker-viewport flex min-h-[52px] items-center px-4 py-2 pl-24">
        <div className="display-score-ticker-track flex min-w-0 flex-1 items-center gap-3">
          {scoreChips.map((guess) => (
            <ScoreChip
              key={guessPopId(guess)}
              guess={guess}
              entering={guessPopId(guess) === enteringId}
            />
          ))}
        </div>
        {missFlash ? (
          <div className="ml-3 shrink-0">
            <MissChip key={guessPopId(missFlash)} guess={missFlash} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
