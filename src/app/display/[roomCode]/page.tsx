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
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl bg-surface/90 p-3 shadow-sm ring-1 ring-ink/20 ${className}`}
    >
      <h2 className="mb-2 shrink-0 text-sm font-bold text-[#f4ede3]">{title}</h2>
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
    <div className="flex h-full w-full flex-col overflow-hidden text-[#f4ede3]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,168,83,0.12),transparent_40%),radial-gradient(circle_at_top_right,rgba(91,164,184,0.1),transparent_35%)]" />

      <main className="relative flex h-full min-h-0 flex-col px-5 py-4">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-4">
            <p className="shrink-0 font-display text-xs font-semibold uppercase tracking-[0.3em] text-ink">
              Lyric Victory
            </p>
            <h1 className="truncate text-3xl font-black text-[#f4ede3]">
              {state && state.currentRoundIndex >= 0
                ? `Round ${state.currentRoundIndex + 1}`
                : "Waiting for host"}
            </h1>
            <p className="truncate text-lg text-[#c4b5a0]">{phaseLabel}</p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <RoomCodeBadge code={roomCode} compact />
            {state ? <PhaseBadge phase={state.phase} /> : null}
            <span className={`text-xs font-semibold ${connected ? "text-success" : "text-red-400"}`}>
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </header>

        {error ? (
          <div className="mb-3 shrink-0 rounded-2xl bg-red-950/60 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
            {error}
          </div>
        ) : null}

        <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-4">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-surface/90 p-3 shadow-sm ring-1 ring-ink/20">
            {state?.announcement ? (
              <div className="mb-2 shrink-0 rounded-xl bg-gradient-to-r from-amber-800 via-ink to-amber-600 px-4 py-1.5 text-center text-base font-semibold text-[#1a1612]">
                {state.announcement}
              </div>
            ) : null}

            {state?.currentRound ? (
              <ScaledLyricBoard lines={state.currentRound.lines} />
            ) : (
              <div className="flex flex-1 items-center justify-center font-display text-2xl text-[#8a7d6b]">
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
              <p className="mt-2 text-xs text-[#c4b5a0]">
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
                        ? "bg-success/15 text-success ring-1 ring-success/35"
                        : "bg-surface-muted text-[#8a7d6b]"
                    }`}
                  >
                    {player.displayName}
                  </span>
                ))}
                {(state?.players.length ?? 0) === 0 ? (
                  <p className="text-xs text-[#c4b5a0]">Waiting for players…</p>
                ) : null}
              </div>
            </SidebarCard>

            <SidebarCard title="Recent Guesses">
              <div className="space-y-1.5 overflow-hidden">
                {(state?.recentWordGuesses ?? []).slice(0, 5).map((guess, index) => (
                  <div
                    key={`${guess.playerId}-${index}`}
                    className="truncate rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs ring-1 ring-ink/20"
                  >
                    <span className="font-semibold text-[#f4ede3]">{guess.playerName}</span>
                    <span className="text-[#8a7d6b]"> → </span>
                    <span className="font-bold uppercase text-ink">{guess.word}</span>
                  </div>
                ))}
                {(state?.recentWordGuesses.length ?? 0) === 0 ? (
                  <p className="text-xs text-[#c4b5a0]">Word guesses appear each beat.</p>
                ) : null}
              </div>
            </SidebarCard>

            <SidebarCard title="Song Guesses">
              <div className="space-y-1.5 overflow-hidden">
                {(state?.currentRound?.songGuesses ?? []).slice(0, 5).map((guess) => (
                  <div
                    key={`${guess.playerId}-${guess.submittedAt}`}
                    className={`truncate rounded-lg px-2.5 py-1.5 text-xs ring-1 ${
                      guess.accepted
                        ? "bg-success/15 text-success ring-success/35"
                        : "bg-surface-muted text-[#c4b5a0] ring-ink/15"
                    }`}
                  >
                    <span className="font-semibold">{guess.playerName}</span>
                    <span className="text-[#8a7d6b]"> · </span>
                    <span>{guess.title}</span>
                  </div>
                ))}
                {(state?.currentRound?.songGuesses.length ?? 0) === 0 ? (
                  <p className="text-xs text-[#c4b5a0]">Song guesses show in that phase.</p>
                ) : null}
              </div>
            </SidebarCard>
          </aside>
        </section>
      </main>
    </div>
  );
}
