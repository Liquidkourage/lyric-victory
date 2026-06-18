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
import { getBlankProgress } from "@/lib/round-progress";
import type { Player } from "@/lib/types";

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

function formatHudPhaseLabel(announcement: string | null | undefined, phaseLabel: string): string {
  if (!announcement) return phaseLabel;
  if (announcement.startsWith("Round ") && announcement.includes("—")) {
    return announcement.split("—")[1]?.trim() ?? phaseLabel;
  }
  return phaseLabel;
}

function formatRoundLabel(roundNumber: number, totalRounds: number): string {
  if (roundNumber <= 0) return "Round —";
  if (totalRounds > 0) return `Round ${roundNumber} of ${totalRounds}`;
  return `Round ${roundNumber}`;
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
  revealed,
  hidden,
  percent,
  connected,
  showWordRushTimer,
  phaseEndsAt,
  topPlayers,
}: {
  roundNumber: number;
  totalRounds: number;
  phaseLabel: string;
  revealed: number;
  hidden: number;
  percent: number;
  connected: boolean;
  showWordRushTimer: boolean;
  phaseEndsAt: number | null;
  topPlayers: Player[];
}) {
  return (
    <header className="display-distance-hud flex shrink-0 items-center gap-3 px-4 py-1.5">
      <div className="min-w-0 flex-1 truncate text-lg font-black tracking-tight text-white">
        <span>{formatRoundLabel(roundNumber, totalRounds)}</span>
        <span className="mx-2 text-white/35">·</span>
        <span className="text-[#fde047]">{phaseLabel}</span>
        <span className="mx-2 text-white/35">·</span>
        <span>{revealed} revealed</span>
        <span className="mx-2 text-white/35">·</span>
        <span>{hidden} hidden</span>
        <span className="mx-2 text-white/35">·</span>
        <span>{percent}%</span>
      </div>
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
      <ConnectionPill connected={connected} />
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

  const phaseLabel =
    state?.announcement?.startsWith("Auto-reveal tuning")
      ? "Auto-reveal tuning"
      : state?.phase === "song-guess"
        ? "Final title chance"
        : state?.phase === "between-rounds"
          ? "Open word rush"
          : state?.phase === "word-guess"
            ? "Guess the words"
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
  const roundNumber = state && state.currentRoundIndex >= 0 ? state.currentRoundIndex + 1 : 0;
  const totalRounds = state?.totalRounds ?? 0;
  const roundLabel =
    state && state.currentRoundIndex >= 0 ? `Round ${state.currentRoundIndex + 1}` : "Waiting for host";
  const showLayoutDebug =
    process.env.NODE_ENV === "development" || searchParams.get("debugLayout") === "1";
  const hudPhaseLabel = formatHudPhaseLabel(state?.announcement, phaseLabel);

  return (
    <div className={`${robotoCondensed.variable} relative flex h-full w-full flex-col overflow-hidden text-[#f4ede3]`}>
      {boardActive ? (
        <>
          <DisplayDistanceHud
            roundNumber={roundNumber}
            totalRounds={totalRounds}
            phaseLabel={hudPhaseLabel}
            revealed={blankProgress.revealedBlanks}
            hidden={blankProgress.hiddenBlanks}
            percent={revealPercent}
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
