"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Roboto_Condensed } from "next/font/google";
import { DisplayScoreFeed } from "@/components/display-score-feed";
import { PhaseCountdown } from "@/components/game-ui";
import { DistanceLyricBoard } from "@/components/tv-distance-board";
import { usePublicGame } from "@/hooks/useGameSocket";
import { FREE_FOR_ALL_MS } from "@/lib/game-constants";
import { groupWordGuessEntries } from "@/lib/guess-events";
import type { Player, PublicGameState } from "@/lib/types";

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-roboto-condensed",
});

function OfflinePill() {
  return (
    <span
      className="shrink-0 rounded-md bg-red-800 px-3 py-1 text-lg font-black uppercase tracking-wide text-white"
      aria-live="polite"
    >
      Offline
    </span>
  );
}

function formatRoundLabel(roundNumber: number, totalRounds: number): string {
  if (roundNumber <= 0) return "Round —";
  if (totalRounds > 0) return `Round ${roundNumber} of ${totalRounds}`;
  return `Round ${roundNumber}`;
}

function displayPhaseLabel(state: PublicGameState | null): string {
  if (!state) return "Waiting for host";

  switch (state.phase) {
    case "song-guess":
      return "Final title chance";
    case "between-rounds":
      return "Open word rush";
    case "word-guess":
      return "Guess the words";
    case "ended":
      return "Game over";
    default:
      return "Song title hidden";
  }
}

function HudStandings({ players }: { players: Player[] }) {
  const top = players.filter((player) => player.score > 0).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="display-hud-standings max-w-[min(34vw,420px)] shrink-0 truncate text-base font-bold text-white/75">
      {top.map((player, index) => (
        <span key={player.id}>
          {index > 0 ? <span className="mx-2 text-white/25">·</span> : null}
          <span className={index === 0 ? "text-white" : undefined}>{player.displayName}</span>
          <span className="ml-1 tabular-nums text-[#fde047]/90">{player.score}</span>
        </span>
      ))}
    </div>
  );
}

function DisplayDistanceHud({
  roundNumber,
  totalRounds,
  phaseLabel,
  connected,
  showWordRushTimer,
  phaseEndsAt,
  topPlayers,
}: {
  roundNumber: number;
  totalRounds: number;
  phaseLabel: string;
  connected: boolean;
  showWordRushTimer: boolean;
  phaseEndsAt: number | null;
  topPlayers: Player[];
}) {
  return (
    <header className="display-distance-hud flex shrink-0 items-center gap-4 px-4 py-2">
      <div className="min-w-0 shrink-0 text-xl font-black tracking-tight text-white">
        <span>{formatRoundLabel(roundNumber, totalRounds)}</span>
        <span className="mx-2 text-white/35">·</span>
        <span className="text-[#fde047]">{phaseLabel}</span>
      </div>
      <div className="min-w-0 flex-1" />
      <HudStandings players={topPlayers} />
      {showWordRushTimer && phaseEndsAt ? (
        <div className="shrink-0">
          <PhaseCountdown
            label="Word rush"
            active
            endsAt={phaseEndsAt}
            durationMs={FREE_FOR_ALL_MS}
            compact
          />
        </div>
      ) : null}
      {!connected ? <OfflinePill /> : null}
    </header>
  );
}

export default function DisplayPageContent() {
  const params = useParams<{ roomCode: string }>();
  const searchParams = useSearchParams();
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

  const phaseLabel = displayPhaseLabel(state);
  const showWordRushTimer = state?.phase === "between-rounds" && state.phaseEndsAt !== null;
  const boardActive = Boolean(state?.currentRound);
  const roundNumber = state && state.currentRoundIndex >= 0 ? state.currentRoundIndex + 1 : 0;
  const totalRounds = state?.totalRounds ?? 0;
  const roundLabel =
    state && state.currentRoundIndex >= 0 ? `Round ${state.currentRoundIndex + 1}` : "Waiting for host";
  const showLayoutDebug =
    process.env.NODE_ENV === "development" || searchParams.get("debugLayout") === "1";

  return (
    <div className={`${robotoCondensed.variable} relative flex h-full w-full flex-col overflow-hidden text-[#f4ede3]`}>
      {boardActive ? (
        <>
          <DisplayDistanceHud
            roundNumber={roundNumber}
            totalRounds={totalRounds}
            phaseLabel={phaseLabel}
            connected={connected}
            showWordRushTimer={showWordRushTimer}
            phaseEndsAt={state?.phaseEndsAt ?? null}
            topPlayers={sortedPlayers}
          />

          {error ? (
            <div className="shrink-0 bg-red-900 px-4 py-2 text-lg font-bold text-white">
              {error}
              {error.toLowerCase().includes("room") ? (
                <span className="mt-1 block text-base font-semibold text-white/80">
                  The server redeployed without a saved room. Add Railway Postgres to this project,
                  then create a new room from /host.
                </span>
              ) : null}
            </div>
          ) : null}

          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {state?.currentRound ? (
              <DistanceLyricBoard lines={state.currentRound.lines} showDebug={showLayoutDebug} />
            ) : null}
          </main>

          <DisplayScoreFeed recentWordGuesses={recentWordGuesses} roundKey={roundNumber} />
        </>
      ) : (
        <main className="relative flex h-full min-h-0 flex-col px-6 py-5">
          <header className="mb-4 flex shrink-0 items-start justify-between gap-6 border-b border-white/10 pb-4">
            <div>
              <h1 className="font-display text-6xl font-black leading-none text-white">{roundLabel}</h1>
              <p className="mt-2 text-3xl font-bold text-[#fde047]">{phaseLabel}</p>
            </div>
            {!connected ? <OfflinePill /> : null}
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
