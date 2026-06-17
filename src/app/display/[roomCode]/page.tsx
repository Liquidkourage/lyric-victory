"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { DisplayPuzzleProgress, PhaseCountdown, ScaledLyricBoard } from "@/components/game-ui";
import { usePublicGame } from "@/hooks/useGameSocket";
import { FREE_FOR_ALL_MS } from "@/lib/game-constants";
import { groupWordGuessEntries } from "@/lib/guess-events";

function SidebarCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`display-sidebar-panel flex min-h-0 flex-col overflow-hidden rounded-2xl p-4 ${className}`}
    >
      <h2 className="mb-3 shrink-0 text-2xl font-black uppercase tracking-wider text-[#fde047]">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-hidden text-[#f4ede3]">{children}</div>
    </section>
  );
}

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span
      className={`rounded-xl px-4 py-2 text-2xl font-black uppercase tracking-wide ring-2 ${
        connected
          ? "bg-[#16a34a] text-white ring-white/80"
          : "bg-red-700 text-white ring-white/50"
      }`}
      aria-live="polite"
    >
      {connected ? "Live" : "Offline"}
    </span>
  );
}

export default function DisplayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const { state, connected, error } = usePublicGame(roomCode);
  const recentWordGuesses = groupWordGuessEntries(state?.recentWordGuesses ?? []).slice(0, 4);
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
  const acceptedSongGuess = state?.currentRound?.songGuesses.find((guess) => guess.accepted);
  const latestWordGuess = recentWordGuesses[0];
  const boardActive = Boolean(state?.currentRound);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-[#f4ede3]">
      <main className="relative flex h-full min-h-0 flex-col px-5 py-3">
        <header
          className={`flex shrink-0 items-start justify-between gap-6 border-b border-white/10 ${
            boardActive ? "mb-2 pb-2" : "mb-3 pb-3"
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <h1
                className={`font-display font-black leading-none text-white ${
                  boardActive ? "text-4xl" : "text-6xl"
                }`}
              >
                {state && state.currentRoundIndex >= 0
                  ? `Round ${state.currentRoundIndex + 1}`
                  : "Waiting for host"}
              </h1>
              {!boardActive ? <p className="text-3xl font-bold text-[#fde047]">{phaseLabel}</p> : null}
            </div>
            {acceptedSongGuess ? (
              <p className="mt-2 text-4xl font-black leading-tight text-white">
                {acceptedSongGuess.title}
                <span className="ml-3 font-semibold text-white/65">— solved!</span>
              </p>
            ) : null}
          </div>

          <ConnectionStatus connected={connected} />
        </header>

        {error ? (
          <div className="mb-3 shrink-0 rounded-2xl bg-red-900 px-5 py-4 text-2xl font-bold text-white ring-2 ring-white/40">
            {error}
          </div>
        ) : null}

        <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-3">
          <div className={`tv-board-panel flex min-h-0 flex-col overflow-hidden rounded-2xl ${boardActive ? "p-2" : "p-4"}`}>
            {state?.announcement ? (
              <div
                className={`display-announcement shrink-0 rounded-xl px-4 text-center font-black leading-tight tracking-wide text-[#1a1612] ${
                  boardActive ? "mb-2 py-2 text-2xl" : "mb-3 px-6 py-4 text-4xl"
                }`}
              >
                {state.announcement}
              </div>
            ) : null}

            {state?.currentRound ? (
              <ScaledLyricBoard lines={state.currentRound.lines} />
            ) : (
              <div className="flex flex-1 items-center justify-center font-display text-5xl font-semibold text-white/50">
                Puzzle board appears when a round starts
              </div>
            )}
          </div>

          <aside className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-3">
            <SidebarCard title={showWordRushTimer ? "Word Rush" : "Puzzle"}>
              {showWordRushTimer ? (
                <PhaseCountdown
                  label="Open word rush"
                  active
                  endsAt={state.phaseEndsAt}
                  durationMs={FREE_FOR_ALL_MS}
                  variant="tv"
                />
              ) : state?.currentRound ? (
                <DisplayPuzzleProgress lines={state.currentRound.lines} variant="tv" />
              ) : (
                <p className="text-xl font-semibold text-white/60">Waiting for round…</p>
              )}
              <p className="mt-3 text-xl font-bold text-white/75">
                Round {Math.max(0, (state?.currentRoundIndex ?? -1) + 1)} of{" "}
                {state?.totalRounds ?? 0}
              </p>
            </SidebarCard>

            <SidebarCard title="Leaderboard">
              <div className="space-y-2">
                {sortedPlayers.slice(0, 8).map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 ring-2 ${
                      player.connected
                        ? "bg-black/35 text-white ring-white/20"
                        : "bg-black/20 text-white/50 ring-white/10"
                    }`}
                  >
                    <span className="min-w-0 flex-1 break-words text-2xl font-bold leading-tight">
                      {index + 1}. {player.displayName}
                    </span>
                    <span className="shrink-0 font-display text-3xl font-black text-[#fde047]">
                      {player.score}
                    </span>
                  </div>
                ))}
                {sortedPlayers.length === 0 ? (
                  <p className="text-xl font-semibold text-white/60">Waiting for players…</p>
                ) : null}
              </div>
            </SidebarCard>

            <SidebarCard title="Live Feed">
              {latestWordGuess ? (
                <div
                  className={`mb-3 rounded-xl px-4 py-3 ring-2 ${
                    latestWordGuess.accepted
                      ? "bg-[#fde047]/15 ring-[#fde047]/50"
                      : "bg-black/35 ring-white/15"
                  }`}
                >
                  <p className="text-lg font-bold uppercase tracking-wide text-white/60">Latest word</p>
                  <p className="mt-1 text-2xl font-bold text-white">{latestWordGuess.playerName}</p>
                  <p
                    className={`mt-1 break-words text-4xl font-black uppercase leading-tight ${
                      latestWordGuess.accepted ? "text-[#fde047]" : "text-white/40 line-through"
                    }`}
                  >
                    {latestWordGuess.word}
                    {latestWordGuess.totalPoints ? (
                      <span className="ml-2 text-2xl font-bold text-white/70">
                        +{latestWordGuess.totalPoints}
                      </span>
                    ) : null}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                {recentWordGuesses.slice(latestWordGuess ? 1 : 0).map((guess, index) => (
                  <div
                    key={`${guess.playerId}-${index}`}
                    className="rounded-lg bg-black/30 px-3 py-2 text-xl ring-1 ring-white/10"
                  >
                    <span className="font-bold text-white">{guess.playerName}</span>
                    <span className="text-white/45"> → </span>
                    <span
                      className={`font-black uppercase ${
                        guess.accepted ? "text-[#fde047]" : "text-white/40"
                      }`}
                    >
                      {guess.word}
                    </span>
                    {guess.totalPoints ? (
                      <span className="text-white/60"> +{guess.totalPoints}</span>
                    ) : null}
                  </div>
                ))}

                {(state?.currentRound?.songGuesses ?? []).slice(0, 3).map((guess) => (
                  <div
                    key={`${guess.playerId}-${guess.submittedAt}`}
                    className={`rounded-lg px-3 py-2 text-xl ring-2 ${
                      guess.accepted
                        ? "bg-[#16a34a]/30 font-semibold text-white ring-[#16a34a]"
                        : "bg-black/30 text-white/80 ring-white/10"
                    }`}
                  >
                    <span className="font-bold">{guess.playerName}</span>
                    <span className="text-white/45"> · </span>
                    <span className="break-words">{guess.title}</span>
                    {guess.points ? <span className="text-white/60"> +{guess.points}</span> : null}
                  </div>
                ))}

                {recentWordGuesses.length === 0 &&
                (state?.currentRound?.songGuesses.length ?? 0) === 0 ? (
                  <p className="text-xl font-semibold text-white/60">Guesses appear live here.</p>
                ) : null}
              </div>
            </SidebarCard>
          </aside>
        </section>

        <p
          className="pointer-events-none absolute bottom-3 left-5 font-mono text-xl font-bold tracking-[0.2em] text-white/45"
          aria-hidden
        >
          {roomCode}
        </p>
      </main>
    </div>
  );
}
