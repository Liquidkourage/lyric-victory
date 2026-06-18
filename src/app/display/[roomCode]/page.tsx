"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Roboto_Condensed } from "next/font/google";
import { PhaseCountdown } from "@/components/game-ui";
import { DistanceLyricBoard } from "@/components/tv-distance-board";
import { usePublicGame } from "@/hooks/useGameSocket";
import { FREE_FOR_ALL_MS } from "@/lib/game-constants";
import { groupWordGuessEntries } from "@/lib/guess-events";
import { getBlankProgress } from "@/lib/round-progress";

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-roboto-condensed",
});

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md px-3 py-1 text-lg font-black uppercase tracking-wide ${
        connected ? "bg-[#16a34a] text-white" : "bg-red-800 text-white"
      }`}
      aria-live="polite"
    >
      {connected ? "Live" : "Offline"}
    </span>
  );
}

function DisplayDistanceHud({
  roundLabel,
  revealed,
  hidden,
  percent,
  connected,
  showWordRushTimer,
  phaseEndsAt,
  announcement,
}: {
  roundLabel: string;
  revealed: number;
  hidden: number;
  percent: number;
  connected: boolean;
  showWordRushTimer: boolean;
  phaseEndsAt: number | null;
  announcement: string | null;
}) {
  return (
    <header className="display-distance-hud flex shrink-0 items-center gap-4 px-4 py-2">
      <div className="min-w-0 flex-1 truncate text-xl font-black tracking-tight text-white">
        <span>{roundLabel}</span>
        <span className="mx-2 text-white/35">·</span>
        <span className="text-[#fde047]">{revealed} revealed</span>
        <span className="mx-2 text-white/35">·</span>
        <span className="text-white/80">{percent}% revealed</span>
        {hidden > 0 ? (
          <>
            <span className="mx-2 text-white/35">·</span>
            <span className="text-white/55">{hidden} hidden</span>
          </>
        ) : null}
      </div>
      {showWordRushTimer && phaseEndsAt ? (
        <div className="hidden shrink-0 sm:block">
          <PhaseCountdown
            label="Word rush"
            active
            endsAt={phaseEndsAt}
            durationMs={FREE_FOR_ALL_MS}
            compact
          />
        </div>
      ) : announcement ? (
        <p className="hidden max-w-md truncate text-lg font-bold text-[#fde047] lg:block">{announcement}</p>
      ) : null}
      <ConnectionPill connected={connected} />
    </header>
  );
}

function DisplayDistanceTicker({
  leader,
  latestGuess,
  recentGuesses,
}: {
  leader: { name: string; score: number } | null;
  latestGuess: ReturnType<typeof groupWordGuessEntries>[number] | null;
  recentGuesses: ReturnType<typeof groupWordGuessEntries>;
}) {
  const items: string[] = [];

  if (leader) {
    items.push(`Leader: ${leader.name} — ${leader.score}`);
  }

  if (latestGuess) {
    const points =
      latestGuess.accepted && latestGuess.totalPoints ? ` +${latestGuess.totalPoints}` : "";
    const word = latestGuess.accepted ? latestGuess.word : `${latestGuess.word} ✗`;
    items.push(`Latest: ${latestGuess.playerName} → ${word}${points}`);
  }

  for (const guess of recentGuesses.slice(latestGuess ? 1 : 0, 4)) {
    items.push(`${guess.playerName} → ${guess.word}`);
  }

  if (items.length === 0) {
    return (
      <footer className="display-distance-ticker shrink-0 px-4 py-2 text-lg font-semibold text-white/45">
        Guesses and scores appear here
      </footer>
    );
  }

  return (
    <footer className="display-distance-ticker shrink-0 overflow-hidden px-4 py-2">
      <p className="truncate text-lg font-bold text-white/85">
        {items.map((item, index) => (
          <span key={item}>
            {index > 0 ? <span className="mx-3 text-white/30">|</span> : null}
            {item}
          </span>
        ))}
      </p>
    </footer>
  );
}

export default function DisplayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const { state, connected, error } = usePublicGame(roomCode);
  const recentWordGuesses = groupWordGuessEntries(state?.recentWordGuesses ?? []);
  const sortedPlayers = useMemo(
    () =>
      [...(state?.players ?? [])].sort(
        (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
      ),
    [state?.players],
  );

  const phaseLabel =
    state?.announcement?.startsWith("Auto-reveal tuning")
      ? "Auto-reveal tuning"
      : state?.phase === "song-guess"
        ? "Final title chance"
        : state?.phase === "between-rounds"
          ? "Open word rush"
          : state?.phase === "word-guess"
            ? "Guess words and title"
            : "Song title hidden";

  const showWordRushTimer = state?.phase === "between-rounds" && state.phaseEndsAt !== null;
  const boardActive = Boolean(state?.currentRound);
  const blankProgress = state?.currentRound
    ? getBlankProgress(state.currentRound.lines)
    : { totalBlanks: 0, revealedBlanks: 0, hiddenBlanks: 0 };
  const revealPercent =
    blankProgress.totalBlanks > 0
      ? Math.round((blankProgress.revealedBlanks / blankProgress.totalBlanks) * 100)
      : 0;
  const roundLabel =
    state && state.currentRoundIndex >= 0 ? `Round ${state.currentRoundIndex + 1}` : "Waiting for host";
  const leader = sortedPlayers[0] ?? null;
  const latestWordGuess = recentWordGuesses[0] ?? null;

  return (
    <div className={`${robotoCondensed.variable} relative flex h-full w-full flex-col overflow-hidden text-[#f4ede3]`}>
      {boardActive ? (
        <>
          <DisplayDistanceHud
            roundLabel={roundLabel}
            revealed={blankProgress.revealedBlanks}
            hidden={blankProgress.hiddenBlanks}
            percent={revealPercent}
            connected={connected}
            showWordRushTimer={showWordRushTimer}
            phaseEndsAt={state?.phaseEndsAt ?? null}
            announcement={state?.announcement ?? null}
          />

          {error ? (
            <div className="shrink-0 bg-red-900 px-4 py-3 text-xl font-bold text-white">
              {error}
              {error.toLowerCase().includes("room") ? (
                <span className="mt-1 block text-base font-semibold text-white/80">
                  The server may have redeployed without a persistent volume. Create a new room from
                  /host, or mount a Railway volume at /data.
                </span>
              ) : null}
            </div>
          ) : null}

          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-1">
            {state?.currentRound ? (
              <DistanceLyricBoard lines={state.currentRound.lines} />
            ) : null}
          </main>

          <DisplayDistanceTicker
            leader={leader ? { name: leader.displayName, score: leader.score } : null}
            latestGuess={latestWordGuess}
            recentGuesses={recentWordGuesses}
          />
        </>
      ) : (
        <main className="relative flex h-full min-h-0 flex-col px-6 py-5">
          <header className="mb-4 flex shrink-0 items-start justify-between gap-6 border-b border-white/10 pb-4">
            <div>
              <h1 className="font-display text-6xl font-black leading-none text-white">{roundLabel}</h1>
              <p className="mt-2 text-3xl font-bold text-[#fde047]">{phaseLabel}</p>
            </div>
            <ConnectionPill connected={connected} />
          </header>

          {error ? (
            <div className="mb-4 shrink-0 rounded-2xl bg-red-900 px-5 py-4 text-2xl font-bold text-white">
              {error}
            </div>
          ) : null}

          <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
            <p className="font-display text-5xl font-semibold text-white/50">
              Puzzle board appears when a round starts
            </p>
          </div>
        </main>
      )}

      <p
        className="pointer-events-none absolute bottom-1 left-3 font-mono text-sm font-bold tracking-[0.18em] text-white/30"
        aria-hidden
      >
        {roomCode}
      </p>
    </div>
  );
}
