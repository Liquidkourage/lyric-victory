"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AutoRevealTuner } from "@/components/auto-reveal-tuner";
import {
  CollapsiblePanel,
  HostRoundSummary,
  MusicBackdrop,
  Panel,
  PhaseBadge,
  PrimaryButton,
  RoomCodeBadge,
  SecondaryButton,
} from "@/components/game-ui";
import { getStoredHostToken, rememberHostToken, useHostGame } from "@/hooks/useGameSocket";
import { groupWordGuessEntries } from "@/lib/guess-events";
import type { SongSearchResult } from "@/lib/types";

export default function HostRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const [hostToken, setHostToken] = useState<string | null>(null);

  useEffect(() => {
    const urlToken = new URL(window.location.href).searchParams.get("hostToken");
    if (urlToken) {
      rememberHostToken(roomCode, urlToken);
      setHostToken(urlToken);
      return;
    }
    setHostToken(getStoredHostToken(roomCode));
  }, [roomCode]);
  const {
    state,
    connected,
    error,
    addRound,
    removeRound,
    setAnnouncement,
    startGame,
    startWordPhase,
    nextRound,
    endGame,
    setAutoRevealWords,
    startAutoRevealPreview,
    stopAutoRevealPreview,
  } = useHostGame(roomCode, hostToken);

  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const recentWordGuesses = groupWordGuessEntries(state?.recentWordGuesses ?? []);

  useEffect(() => {
    if (state?.announcement) {
      setAnnouncementDraft(state.announcement);
    }
  }, [state?.announcement]);

  const runSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/songs/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = (await response.json()) as { results: SongSearchResult[] };
      setSearchResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  };

  const importSong = async (song: SongSearchResult) => {
    setLoadingLyrics(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/songs/lyrics?id=${song.id}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        setActionError(data.error ?? "Could not load lyrics.");
        return;
      }
      const result = await addRound({
        title: data.title,
        artist: data.artist,
        template: data.template,
        answers: data.answers,
      });
      if (!result.ok) {
        setActionError(result.error ?? "Could not add round.");
      }
    } finally {
      setLoadingLyrics(false);
    }
  };

  const runHostAction = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setActionError(null);
    const result = await action();
    if (!result.ok) {
      setActionError(result.error ?? "Action failed.");
    }
  };

  if (hostToken === null) {
    return (
      <MusicBackdrop>
        <main className="mx-auto max-w-lg px-6 py-16">
          <Panel title="Loading host session…">
            <p className="text-sm text-[#c4b5a0]">Reconnecting to your room…</p>
          </Panel>
        </main>
      </MusicBackdrop>
    );
  }

  if (!hostToken) {
    return (
      <MusicBackdrop>
        <main className="mx-auto max-w-lg px-6 py-16">
          <Panel title="Host session expired">
            <p className="mb-4 text-sm text-[#c4b5a0]">
              Open the host link from the browser that created the room, or start a new game. After
              a deploy, rooms only survive if Railway has a volume mounted at <code>/data</code>.
            </p>
            <Link href="/host">
              <PrimaryButton>Create New Game</PrimaryButton>
            </Link>
          </Panel>
        </main>
      </MusicBackdrop>
    );
  }

  return (
    <MusicBackdrop>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-ink">Host Console</p>
            <h1 className="font-display text-3xl font-bold text-[#f4ede3]">Lyric Victory</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RoomCodeBadge code={roomCode} />
            {state ? <PhaseBadge phase={state.phase} /> : null}
            <span className={`text-sm font-medium ${connected ? "text-success" : "text-red-400"}`}>
              {connected ? "Live" : "Reconnecting…"}
            </span>
          </div>
        </header>

        {(error || actionError) && (
          <div className="mb-4 rounded-2xl bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
            {error ?? actionError}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <Link href={`/display/${roomCode}`} target="_blank">
            <SecondaryButton>Open TV Display</SecondaryButton>
          </Link>
          <SecondaryButton onClick={() => navigator.clipboard.writeText(roomCode)}>
            Copy Room Code
          </SecondaryButton>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            {state?.phase === "lobby" ? (
              <>
                <CollapsiblePanel title="Song Search" defaultOpen>
                  <div className="mb-4 flex gap-2">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search songs…"
                      className="input-dark flex-1 rounded-2xl px-4 py-3 text-sm"
                    />
                    <PrimaryButton onClick={runSearch} disabled={searching}>
                      {searching ? "Searching…" : "Search"}
                    </PrimaryButton>
                  </div>
                  <div className="space-y-2">
                    {searchResults.map((song) => (
                      <button
                        key={song.id}
                        type="button"
                        onClick={() => importSong(song)}
                        disabled={loadingLyrics}
                        className="flex w-full items-start justify-between rounded-2xl bg-surface-muted px-4 py-3 text-left transition hover:bg-[#443a2e] ring-1 ring-ink/15"
                      >
                        <span>
                          <span className="block font-semibold text-[#f4ede3]">{song.title}</span>
                          <span className="text-sm text-[#8a7d6b]">
                            {song.artist} · {song.album}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-ink">Add</span>
                      </button>
                    ))}
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="Queued Rounds" defaultOpen>
                  {(state?.pendingRounds.length ?? 0) === 0 ? (
                    <p className="text-sm text-[#8a7d6b]">No rounds queued yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {state?.pendingRounds.map((round, index) => (
                        <div
                          key={`${round.title}-${index}`}
                          className="flex items-center justify-between rounded-2xl bg-surface-muted px-4 py-3 ring-1 ring-ink/15"
                        >
                          <span>
                            <span className="block font-semibold text-[#f4ede3]">{round.title}</span>
                            <span className="text-sm text-[#8a7d6b]">{round.artist}</span>
                          </span>
                          <SecondaryButton onClick={() => runHostAction(() => removeRound(index))}>
                            Remove
                          </SecondaryButton>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4">
                    <PrimaryButton
                      onClick={() => runHostAction(startGame)}
                      disabled={(state?.pendingRounds.length ?? 0) === 0}
                    >
                      Start Game
                    </PrimaryButton>
                  </div>
                </CollapsiblePanel>
              </>
            ) : null}

            {state?.currentRound ? (
              <CollapsiblePanel title={`Round ${state.currentRoundIndex + 1} Board`} defaultOpen>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-xl font-bold text-[#f4ede3]">{state.currentRound.title}</p>
                    <p className="text-sm text-[#8a7d6b]">{state.currentRound.artist}</p>
                  </div>
                </div>
                <HostRoundSummary lines={state.currentRound.lines} />
              </CollapsiblePanel>
            ) : null}
          </div>

          <div className="space-y-6">
            <CollapsiblePanel title="Auto-Reveal Tuner (temp)" defaultOpen={false}>
              <AutoRevealTuner
                pendingRounds={state?.pendingRounds ?? []}
                roomAutoRevealWords={state?.autoRevealWords ?? null}
                tuningActive={state?.autoRevealTuningActive ?? false}
                onStartPreview={startAutoRevealPreview}
                onStopPreview={stopAutoRevealPreview}
                onApply={setAutoRevealWords}
              />
            </CollapsiblePanel>

            <CollapsiblePanel title="Live Controls" defaultOpen>
              <div className="grid gap-2">
                {state?.phase === "round-setup" ? (
                  <PrimaryButton onClick={() => runHostAction(startWordPhase)}>
                    Start Round
                  </PrimaryButton>
                ) : null}
                {state?.phase === "word-guess" || state?.phase === "between-rounds" || state?.phase === "song-guess" ? (
                  <PrimaryButton onClick={() => runHostAction(nextRound)}>
                    Next Round / End Game
                  </PrimaryButton>
                ) : null}
                {state && state.phase !== "lobby" && state.phase !== "ended" ? (
                  <SecondaryButton onClick={() => runHostAction(endGame)}>End Game</SecondaryButton>
                ) : null}
              </div>
            </CollapsiblePanel>
            <CollapsiblePanel title="Announcement" defaultOpen={false}>
              <textarea
                value={announcementDraft}
                onChange={(event) => setAnnouncementDraft(event.target.value)}
                rows={3}
                className="mb-3 w-full rounded-2xl input-dark px-4 py-3 text-sm"
              />
              <PrimaryButton onClick={() => runHostAction(() => setAnnouncement(announcementDraft))}>
                Push to Display
              </PrimaryButton>
            </CollapsiblePanel>

            <CollapsiblePanel title={`Players (${state?.players.length ?? 0})`} defaultOpen>
              <div className="flex flex-wrap gap-2">
                {state?.players.map((player) => (
                  <span
                    key={player.id}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      player.connected
                        ? "bg-success/15 text-success ring-1 ring-success/30"
                        : "bg-surface-muted text-[#8a7d6b]"
                    }`}
                  >
                    {player.displayName} - {player.score}
                  </span>
                ))}
              </div>
            </CollapsiblePanel>

            {state?.answerKey.length ? (
              <CollapsiblePanel title="Answer Key (host only)" defaultOpen>
                <p className="font-mono text-sm text-[#c4b5a0]">{state.answerKey.join(", ")}</p>
              </CollapsiblePanel>
            ) : null}

            {recentWordGuesses.length ? (
              <CollapsiblePanel title="Recent Word Guesses" defaultOpen>
                <div className="space-y-2">
                  {recentWordGuesses.map((guess, index) => (
                    <div key={`${guess.playerId}-${index}`} className="rounded-xl bg-surface-muted px-3 py-2 text-sm ring-1 ring-ink/15">
                      <span className="font-semibold text-[#f4ede3]">{guess.playerName}</span>
                      <span className="text-[#8a7d6b]"> guessed </span>
                      <span className="font-semibold text-ink">{guess.word}</span>
                      {guess.count > 1 ? (
                        <span className="ml-2 rounded-full bg-ink/15 px-2 py-0.5 text-xs font-bold text-ink">
                          {guess.count}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CollapsiblePanel>
            ) : null}

            {state?.currentRound?.songGuesses.length ? (
              <CollapsiblePanel title="Song Guesses" defaultOpen>
                <div className="space-y-2">
                  {state.currentRound.songGuesses.map((guess) => (
                    <div
                      key={`${guess.playerId}-${guess.submittedAt}`}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        guess.accepted ? "bg-success/15 text-success" : "bg-surface-muted text-[#c4b5a0]"
                      }`}
                    >
                      <span className="font-semibold">{guess.playerName}</span>: {guess.title}
                    </div>
                  ))}
                </div>
              </CollapsiblePanel>
            ) : null}
          </div>
        </div>
      </main>
    </MusicBackdrop>
  );
}

