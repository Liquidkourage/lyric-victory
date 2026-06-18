"use client";

import { useEffect, useRef, useState } from "react";
import type { GroupedWordGuess } from "@/lib/guess-events";

interface ScorePop {
  id: string;
  playerName: string;
  word: string;
  points: number;
  count: number;
}

const POP_LIFETIME_MS = 3200;
const MAX_VISIBLE = 5;

function guessPopId(guess: GroupedWordGuess): string {
  return `${guess.playerId}-${guess.word}-${guess.submittedAt ?? 0}`;
}

function ScorePopCard({ pop }: { pop: ScorePop }) {
  const countLabel = pop.count > 1 ? ` ×${pop.count}` : "";

  return (
    <div className="display-score-pop flex shrink-0 items-baseline gap-2 rounded-lg border border-[#fde047]/25 bg-black/55 px-3 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.45)]">
      <span className="text-lg font-black tracking-tight text-white">{pop.playerName}</span>
      <span className="text-base font-bold text-white/45">→</span>
      <span className="text-lg font-extrabold text-[#fde047]">
        {pop.word}
        {countLabel}
      </span>
      <span className="text-xl font-black tabular-nums text-[#86efac]">+{pop.points}</span>
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
  const [pops, setPops] = useState<ScorePop[]>([]);
  const prevLatestRef = useRef<string | null>(null);
  const skipNextPopRef = useRef(true);

  useEffect(() => {
    setPops([]);
    prevLatestRef.current = null;
    skipNextPopRef.current = true;
  }, [roundKey]);

  useEffect(() => {
    const latest = recentWordGuesses[0];
    if (!latest?.accepted || latest.totalPoints <= 0) {
      if (!latest) prevLatestRef.current = null;
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

    const pop: ScorePop = {
      id,
      playerName: latest.playerName,
      word: latest.word,
      points: latest.totalPoints,
      count: latest.count,
    };

    setPops((current) => [...current, pop].slice(-MAX_VISIBLE));

    window.setTimeout(() => {
      setPops((current) => current.filter((entry) => entry.id !== id));
    }, POP_LIFETIME_MS);
  }, [recentWordGuesses]);

  return (
    <aside
      className="display-distance-score-lane shrink-0 overflow-hidden"
      aria-live="polite"
      aria-label="Recent scores"
    >
      <div className="flex min-h-[52px] items-center gap-3 overflow-x-auto px-4 py-2 pl-24">
        {pops.map((pop) => (
          <ScorePopCard key={pop.id} pop={pop} />
        ))}
      </div>
    </aside>
  );
}
