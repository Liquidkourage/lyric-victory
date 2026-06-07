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
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white/90 p-3 shadow-sm ring-1 ring-violet-100 ${className}`}
    >
      <h2 className="mb-2 shrink-0 text-sm font-bold text-slate-800">{title}</h2>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

export default function DisplayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const { state, connected, error } = usePublicGame(roomCode);

  const phaseLabel =
    state?.phase === "song-guess"
      ? "Name that song"
      : state?.phase === "word-guess"
        ? "Guess the words"
        : "Song title hidden";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.12),transparent_35%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.1),transparent_30%)]" />

      <main className="relative flex h-full min-h-0 flex-col px-5 py-4">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-4">
            <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.3em] text-violet-500">
              Lyric Victory
            </p>
            <h1 className="truncate text-3xl font-black text-slate-900">
              {state && state.currentRoundIndex >= 0
                ? `Round ${state.currentRoundIndex + 1}`
                : "Waiting for host"}
            </h1>
            <p className="truncate text-lg text-slate-500">{phaseLabel}</p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <RoomCodeBadge code={roomCode} compact />
            {state ? <PhaseBadge phase={state.phase} /> : null}
            <span className={`text-xs font-semibold ${connected ? "text-emerald-600" : "text-red-500"}`}>
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </header>

        {error ? (
          <div className="mb-3 shrink-0 rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-4">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-violet-100">
            {state?.announcement ? (
              <div className="mb-3 shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-center text-lg font-semibold text-white">
                {state.announcement}
              </div>
            ) : null}

            {state?.currentRound ? (
              <ScaledLyricBoard lines={state.currentRound.lines} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-2xl text-slate-400">
                Puzzle board appears when a round starts
              </div>
            )}
          </div>

          <aside className="grid min-h-0 grid-rows-4 gap-3">
            <SidebarCard title="Beat">
              <BeatTimer
                active={state?.beat.active ?? false}
                endsAt={state?.beat.endsAt ?? null}
                durationMs={state?.beat.durationMs ?? 15000}
                compact
              />
              <p className="mt-2 text-xs text-slate-500">
                Round {Math.max(0, (state?.currentRoundIndex ?? -1) + 1)} of {state?.totalRounds ?? 0}
              </p>
            </SidebarCard>

            <SidebarCard title="Players">
              <div className="flex flex-wrap gap-1.5 overflow-hidden">
                {(state?.players ?? []).map((player) => (
                  <span
                    key={player.id}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      player.connected
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {player.displayName}
                  </span>
                ))}
                {(state?.players.length ?? 0) === 0 ? (
                  <p className="text-xs text-slate-500">Waiting for players…</p>
                ) : null}
              </div>
            </SidebarCard>

            <SidebarCard title="Recent Guesses">
              <div className="space-y-1.5 overflow-hidden">
                {(state?.recentWordGuesses ?? []).slice(0, 5).map((guess, index) => (
                  <div key={`${guess.playerId}-${index}`} className="truncate rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-slate-800">{guess.playerName}</span>
                    <span className="text-slate-500"> → </span>
                    <span className="font-bold uppercase text-violet-700">{guess.word}</span>
                  </div>
                ))}
                {(state?.recentWordGuesses.length ?? 0) === 0 ? (
                  <p className="text-xs text-slate-500">Word guesses appear each beat.</p>
                ) : null}
              </div>
            </SidebarCard>

            <SidebarCard title="Song Guesses">
              <div className="space-y-1.5 overflow-hidden">
                {(state?.currentRound?.songGuesses ?? []).slice(0, 5).map((guess) => (
                  <div
                    key={`${guess.playerId}-${guess.submittedAt}`}
                    className={`truncate rounded-lg px-2.5 py-1.5 text-xs ${
                      guess.accepted ? "bg-emerald-100 text-emerald-800" : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-semibold">{guess.playerName}</span>
                    <span className="text-slate-500"> · </span>
                    <span>{guess.title}</span>
                  </div>
                ))}
                {(state?.currentRound?.songGuesses.length ?? 0) === 0 ? (
                  <p className="text-xs text-slate-500">Song guesses show in that phase.</p>
                ) : null}
              </div>
            </SidebarCard>
          </aside>
        </section>
      </main>
    </div>
  );
}
