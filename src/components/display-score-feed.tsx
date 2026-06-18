"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GroupedWordGuess } from "@/lib/guess-events";

const MIN_SEQUENCE_ITEMS = 8;
const CRAWL_PIXELS_PER_SECOND = 52;
const MISS_FLASH_MS = 2600;

function guessPopId(guess: GroupedWordGuess): string {
  return `${guess.playerId}-${guess.word}-${guess.submittedAt ?? 0}`;
}

function ScoreChip({ guess }: { guess: GroupedWordGuess }) {
  const countLabel = guess.count > 1 ? ` ×${guess.count}` : "";

  return (
    <div className="display-score-pop flex shrink-0 items-baseline gap-2 rounded-lg border border-[#fde047]/25 bg-black/55 px-3 py-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.45) display-score-pop--settled">
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

function buildCrawlSequence(scores: GroupedWordGuess[]): GroupedWordGuess[] {
  if (scores.length === 0) return [];

  const ordered = [...scores].reverse();
  let base = ordered;

  while (base.length < MIN_SEQUENCE_ITEMS) {
    base = [...base, ...ordered];
  }

  return [...base, ...base];
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

  const crawlSequence = useMemo(() => buildCrawlSequence(acceptedScores), [acceptedScores]);
  const crawlKey = useMemo(
    () => crawlSequence.map((guess) => guessPopId(guess)).join("|"),
    [crawlSequence],
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const [missFlash, setMissFlash] = useState<GroupedWordGuess | null>(null);
  const prevMissRef = useRef<string | null>(null);

  useEffect(() => {
    prevMissRef.current = null;
    setMissFlash(null);
  }, [roundKey]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || crawlSequence.length === 0) return;

    const updateDuration = () => {
      const loopWidth = track.scrollWidth / 2;
      if (loopWidth <= 0) return;
      const duration = loopWidth / CRAWL_PIXELS_PER_SECOND;
      track.style.setProperty("--ticker-duration", `${duration}s`);
    };

    updateDuration();

    const observer = new ResizeObserver(updateDuration);
    observer.observe(track);

    return () => observer.disconnect();
  }, [crawlKey, crawlSequence.length]);

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
        {crawlSequence.length > 0 ? (
          <div className="display-score-ticker-crawl min-w-0 flex-1 overflow-hidden">
            <div
              key={crawlKey}
              ref={trackRef}
              className="display-score-ticker-track display-score-ticker-track--crawl flex w-max items-center gap-3"
            >
              {crawlSequence.map((guess, index) => (
                <ScoreChip key={`${guessPopId(guess)}-${index}`} guess={guess} />
              ))}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {missFlash ? (
          <div className="ml-3 shrink-0">
            <MissChip key={guessPopId(missFlash)} guess={missFlash} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
