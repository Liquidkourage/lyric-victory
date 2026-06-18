"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GroupedWordGuess } from "@/lib/guess-events";

const MAX_CHIPS = 10;

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

export function DisplayScoreFeed({
  recentWordGuesses,
  roundKey,
}: {
  recentWordGuesses: GroupedWordGuess[];
  roundKey: number;
}) {
  const chips = useMemo(
    () =>
      recentWordGuesses
        .filter((guess) => guess.accepted && guess.totalPoints > 0)
        .slice(0, MAX_CHIPS)
        .reverse(),
    [recentWordGuesses],
  );

  const [popId, setPopId] = useState<string | null>(null);
  const prevLatestRef = useRef<string | null>(null);
  const skipNextPopRef = useRef(true);

  useEffect(() => {
    prevLatestRef.current = null;
    skipNextPopRef.current = true;
    setPopId(null);
  }, [roundKey]);

  useEffect(() => {
    const latest = recentWordGuesses.find((guess) => guess.accepted && guess.totalPoints > 0);
    if (!latest) {
      prevLatestRef.current = null;
      return;
    }

    const id = guessPopId(latest);
    if (skipNextPopRef.current) {
      skipNextPopRef.current = false;
      prevLatestRef.current = id;
      return;
    }

    if (id === prevLatestRef.current) return;
    prevLatestRef.current = id;
    setPopId(id);

    const timer = window.setTimeout(() => {
      setPopId((current) => (current === id ? null : current));
    }, 450);

    return () => window.clearTimeout(timer);
  }, [recentWordGuesses]);

  return (
    <aside
      className="display-distance-score-lane shrink-0 overflow-hidden"
      aria-live="polite"
      aria-label="Recent scores"
    >
      <div className="flex min-h-[52px] items-center gap-3 overflow-x-auto px-4 py-2 pl-24">
        {chips.map((guess) => (
          <ScoreChip key={guessPopId(guess)} guess={guess} pop={guessPopId(guess) === popId} />
        ))}
      </div>
    </aside>
  );
}
