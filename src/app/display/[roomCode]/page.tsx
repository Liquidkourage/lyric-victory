"use client";

import { useParams } from "next/navigation";
import {
  BeatTimer,
  LyricBoard,
  PhaseBadge,
  RoomCodeBadge,
} from "@/components/game-ui";
import { usePublicGame } from "@/hooks/useGameSocket";

export default function DisplayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const { state, connected, error } = usePublicGame(roomCode);

  return (
    <div className="min-h-screen bg-[#faf7f2] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.15),transparent_35%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.12),transparent_30%)]" />

      <main className="relative mx-auto grid min-h-screen max-w-[1920px] grid-rows-[auto_1fr_auto] gap-6 px-10 py-8">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-violet-500">
              Lyric Victory
            </p>
            <h1 className="mt-2 text-5xl font-black tracking-tight text-slate-900">
              {state?.currentRound?.title ?? "Waiting for host"}
            </h1>
            {state?.currentRound?.artist ? (
              <p className="mt-2 text-2xl text-slate-500">{state.currentRound.artist}</p>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-3">
            <RoomCodeBadge code={roomCode} />
            <div className="flex items-center gap-3">
              {state ? <PhaseBadge phase={state.phase} /> : null}
              <span className={`text-sm font-semibold ${connected ? "text-emerald-600" : "text-red-500"}`}>
                {connected ? "Live" : "Offline"}
              </span>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-3xl bg-red-50 px-6 py-4 text-lg text-red-700">{error}</div>
        ) : null}

        <section className="grid grid-cols-[1fr_360px] gap-6">
          <div className="rounded-[2rem] bg-white/90 p-8 shadow-sm ring-1 ring-violet-100">
            {state?.announcement ? (
              <div className="mb-6 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-6 py-4 text-center text-2xl font-semibold text-white shadow-lg">
                {state.announcement}
              </div>
            ) : null}

            {state?.currentRound ? (
              <LyricBoard lines={state.currentRound.lines} size="lg" />
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center text-3xl text-slate-400">
                Puzzle board appears when a round starts
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] bg-white/90 p-6 shadow-sm ring-1 ring-violet-100">
              <h2 className="mb-4 text-xl font-bold text-slate-800">Beat</h2>
              <BeatTimer
                active={state?.beat.active ?? false}
                endsAt={state?.beat.endsAt ?? null}
                durationMs={state?.beat.durationMs ?? 15000}
              />
              <p className="mt-4 text-sm text-slate-500">
                Round {Math.max(0, (state?.currentRoundIndex ?? -1) + 1)} of {state?.totalRounds ?? 0}
              </p>
            </div>

            <div className="rounded-[2rem] bg-white/90 p-6 shadow-sm ring-1 ring-violet-100">
              <h2 className="mb-4 text-xl font-bold text-slate-800">Players</h2>
              <div className="flex flex-wrap gap-2">
                {(state?.players ?? []).map((player) => (
                  <span
                    key={player.id}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      player.connected
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {player.displayName}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white/90 p-6 shadow-sm ring-1 ring-violet-100">
              <h2 className="mb-4 text-xl font-bold text-slate-800">Recent Guesses</h2>
              <div className="space-y-2">
                {(state?.recentWordGuesses ?? []).slice(0, 8).map((guess, index) => (
                  <div key={`${guess.playerId}-${index}`} className="rounded-xl bg-violet-50 px-4 py-3">
                    <span className="font-semibold text-slate-800">{guess.playerName}</span>
                    <span className="text-slate-500"> → </span>
                    <span className="text-lg font-bold uppercase text-violet-700">{guess.word}</span>
                  </div>
                ))}
                {(state?.recentWordGuesses.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-500">Word guesses will appear here each beat.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white/90 p-6 shadow-sm ring-1 ring-violet-100">
              <h2 className="mb-4 text-xl font-bold text-slate-800">Song Guesses</h2>
              <div className="space-y-2">
                {(state?.currentRound?.songGuesses ?? []).map((guess) => (
                  <div
                    key={`${guess.playerId}-${guess.submittedAt}`}
                    className={`rounded-xl px-4 py-3 ${
                      guess.accepted ? "bg-emerald-100 text-emerald-800" : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-semibold">{guess.playerName}</span>
                    <span className="block text-lg">{guess.title}</span>
                  </div>
                ))}
                {(state?.currentRound?.songGuesses.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-500">Song title guesses show up in this phase.</p>
                ) : null}
              </div>
            </div>
          </aside>
        </section>

        <footer className="flex items-center justify-between text-sm text-slate-500">
          <span>1080p display layout</span>
          <span>{state?.phase === "ended" ? "Game over" : "Lyric Victory"}</span>
        </footer>
      </main>
    </div>
  );
}
