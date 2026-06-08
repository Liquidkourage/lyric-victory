"use client";

import { useParams } from "next/navigation";
import {
  BeatTimer,
  PhaseBadge,
  RoomCodeBadge,
  ScaledLyricBoard,
} from "@/components/game-ui";
import { usePublicGame } from "@/hooks/useGameSocket";

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
      className={`display-sidebar-panel flex min-h-0 flex-col overflow-hidden rounded-2xl p-3 ${className}`}
    >
      <h2 className="mb-2 shrink-0 text-sm font-bold uppercase tracking-wide text-[#fde047]">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-hidden text-[#f4ede3]">{children}</div>
    </section>
  );
}

export default function DisplayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const { state, connected, error } = usePublicGame(roomCode);

  const phaseLabel =
    state?.phase === "song-guess"
      ? "Final title chance"
      : state?.phase === "between-rounds"
        ? "Open word rush"
        : state?.phase === "word-guess"
          ? "Guess words and title"
          : "Song title hidden";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-[#f4ede3]">
      <main className="relative flex h-full min-h-0 flex-col px-6 py-5">
        <header className="mb-4 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-baseline gap-5">
            <p className="shrink-0 font-display text-sm font-bold uppercase tracking-[0.35em] text-[#fde047]">
              Lyric Victory
            </p>
            <h1 className="truncate text-4xl font-black text-white">
              {state && state.currentRoundIndex >= 0
                ? `Round ${state.currentRoundIndex + 1}`
                : "Waiting for host"}
            </h1>
            <p className="truncate text-xl font-medium text-white/75">{phaseLabel}</p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <RoomCodeBadge code={roomCode} compact />
            {state ? <PhaseBadge phase={state.phase} /> : null}
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                connected
                  ? "bg-[#16a34a] text-white ring-2 ring-white/80"
                  : "bg-red-700 text-white ring-2 ring-white/50"
              }`}
            >
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </header>

        {error ? (
          <div className="mb-4 shrink-0 rounded-2xl bg-red-900 px-5 py-3 text-base font-semibold text-white ring-2 ring-white/40">
            {error}
          </div>
        ) : null}

        <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] gap-5">
          <div className="tv-board-panel flex min-h-0 flex-col overflow-hidden rounded-2xl p-4">
            {state?.announcement ? (
              <div className="display-announcement mb-3 shrink-0 rounded-xl px-6 py-3 text-center text-2xl font-black tracking-wide text-[#1a1612]">
                {state.announcement}
              </div>
            ) : null}

            {state?.currentRound ? (
              <ScaledLyricBoard lines={state.currentRound.lines} />
            ) : (
              <div className="flex flex-1 items-center justify-center font-display text-4xl font-semibold text-white/50">
                Puzzle board appears when a round starts
              </div>
            )}
          </div>

          <aside className="grid min-h-0 grid-rows-4 gap-3">
            <SidebarCard title={state?.phase === "between-rounds" ? "Rush Timer" : "Round"}>
              <BeatTimer
                active={state?.beat.active ?? false}
                endsAt={state?.beat.endsAt ?? null}
                durationMs={state?.beat.durationMs ?? 15000}
                compact
              />
              <p className="mt-2 text-sm font-medium text-white/70">
                Round {Math.max(0, (state?.currentRoundIndex ?? -1) + 1)} of {state?.totalRounds ?? 0}
              </p>
            </SidebarCard>

            <SidebarCard title="Players">
              <div className="flex flex-wrap gap-2 overflow-hidden">
                {(state?.players ?? []).map((player) => (
                  <span
                    key={player.id}
                    className={`rounded-full px-3 py-1 text-sm font-bold ${
                      player.connected
                        ? "bg-[#16a34a] text-white ring-2 ring-white/70"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {player.displayName} - {player.score}
                  </span>
                ))}
                {(state?.players.length ?? 0) === 0 ? (
                  <p className="text-sm text-white/60">Waiting for players…</p>
                ) : null}
              </div>
            </SidebarCard>

            <SidebarCard title="Recent Guesses">
              <div className="space-y-2 overflow-hidden">
                {(state?.recentWordGuesses ?? []).slice(0, 5).map((guess, index) => (
                  <div
                    key={`${guess.playerId}-${index}`}
                    className="truncate rounded-lg bg-black/35 px-3 py-2 text-sm ring-1 ring-white/15"
                  >
                    <span className="font-bold text-white">{guess.playerName}</span>
                    <span className="text-white/50"> {"->"} </span>
                    <span className="font-black uppercase text-[#fde047]">{guess.word}</span>
                    {guess.points ? <span className="text-white/60"> +{guess.points}</span> : null}
                  </div>
                ))}
                {(state?.recentWordGuesses.length ?? 0) === 0 ? (
                  <p className="text-sm text-white/60">Word guesses appear live.</p>
                ) : null}
              </div>
            </SidebarCard>

            <SidebarCard title="Song Guesses">
              <div className="space-y-2 overflow-hidden">
                {(state?.currentRound?.songGuesses ?? []).slice(0, 5).map((guess) => (
                  <div
                    key={`${guess.playerId}-${guess.submittedAt}`}
                    className={`truncate rounded-lg px-3 py-2 text-sm ring-1 ${
                      guess.accepted
                        ? "bg-[#16a34a]/30 font-semibold text-white ring-[#16a34a]"
                        : "bg-black/35 text-white/80 ring-white/15"
                    }`}
                  >
                    <span className="font-bold">{guess.playerName}</span>
                    <span className="text-white/45"> · </span>
                    <span>{guess.title}</span>
                    {guess.points ? <span className="text-white/60"> +{guess.points}</span> : null}
                  </div>
                ))}
                {(state?.currentRound?.songGuesses.length ?? 0) === 0 ? (
                  <p className="text-sm text-white/60">Song guesses appear live.</p>
                ) : null}
              </div>
            </SidebarCard>
          </aside>
        </section>
      </main>
    </div>
  );
}
