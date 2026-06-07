"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BeatTimer,
  CollapsiblePanel,
  LyricBoard,
  MusicBackdrop,
  Panel,
  PhaseBadge,
  PrimaryButton,
  RoomCodeBadge,
  SecondaryButton,
} from "@/components/game-ui";
import { getStoredHostToken, useHostGame } from "@/hooks/useGameSocket";
import { countBlanks } from "@/lib/lyrics";
import type { SongSearchResult } from "@/lib/types";

export default function HostRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const hostToken = useMemo(() => getStoredHostToken(roomCode), [roomCode]);
  const {
    state,
    connected,
    error,
    addRound,
    removeRound,
    setAnnouncement,
    startGame,
    startWordPhase,
    startBeat,
    endBeat,
    startSongPhase,
    nextRound,
    endGame,
  } = useHostGame(roomCode, hostToken);

  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customArtist, setCustomArtist] = useState("");
  const [customTemplate, setCustomTemplate] = useState("Hey {6}, I just met a {4}\nAnd {4} is {7} crazy");
  const [customAnswers, setCustomAnswers] = useState("jude, girl, this, getting");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [loadingLyrics, setLoadingLyrics] = useState(false);

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

  const addCustomRound = async () => {
    setActionError(null);
    try {
      const answers = customAnswers
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const blankCount = countBlanks(customTemplate);
      if (answers.length !== blankCount) {
        setActionError(`Expected ${blankCount} comma-separated answers, got ${answers.length}.`);
        return;
      }
      const result = await addRound({
        title: customTitle.trim() || "Untitled Song",
        artist: customArtist.trim() || "Unknown Artist",
        template: customTemplate,
        answers,
      });
      if (!result.ok) {
        setActionError(result.error ?? "Could not add custom round.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Invalid custom round.");
    }
  };

  const runHostAction = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setActionError(null);
    const result = await action();
    if (!result.ok) {
      setActionError(result.error ?? "Action failed.");
    }
  };

  if (!hostToken) {
    return (
      <MusicBackdrop>
        <main className="mx-auto max-w-lg px-6 py-16">
          <Panel title="Host session expired">
            <p className="mb-4 text-sm text-slate-600">
              Open this room from the same browser that created it, or start a new game.
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
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-500">Host Console</p>
            <h1 className="text-3xl font-black text-slate-900">Lyric Victory</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RoomCodeBadge code={roomCode} />
            {state ? <PhaseBadge phase={state.phase} /> : null}
            <span className={`text-sm font-medium ${connected ? "text-emerald-600" : "text-red-500"}`}>
              {connected ? "Live" : "Reconnecting…"}
            </span>
          </div>
        </header>

        {(error || actionError) && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
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
                      className="flex-1 rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
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
                        className="flex w-full items-start justify-between rounded-2xl bg-violet-50 px-4 py-3 text-left transition hover:bg-violet-100"
                      >
                        <span>
                          <span className="block font-semibold text-slate-800">{song.title}</span>
                          <span className="text-sm text-slate-500">
                            {song.artist} · {song.album}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-violet-600">Add</span>
                      </button>
                    ))}
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="Custom Lyrics" defaultOpen={false}>
                  <p className="mb-4 text-sm text-slate-600">
                    Use <code className="rounded bg-slate-100 px-1">{`{4}`}</code> for a 4-letter word.
                    Visible words in your paste are auto-hidden — only letter counts show on the board.
                    Answers are comma-separated in blank order.
                  </p>
                  <div className="grid gap-3">
                    <input
                      value={customTitle}
                      onChange={(event) => setCustomTitle(event.target.value)}
                      placeholder="Song title"
                      className="rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
                    />
                    <input
                      value={customArtist}
                      onChange={(event) => setCustomArtist(event.target.value)}
                      placeholder="Artist"
                      className="rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
                    />
                    <textarea
                      value={customTemplate}
                      onChange={(event) => setCustomTemplate(event.target.value)}
                      rows={6}
                      className="rounded-2xl border border-violet-100 px-4 py-3 font-mono text-sm outline-none ring-violet-200 focus:ring-2"
                    />
                    <input
                      value={customAnswers}
                      onChange={(event) => setCustomAnswers(event.target.value)}
                      placeholder="Answers, comma separated"
                      className="rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
                    />
                    <PrimaryButton onClick={addCustomRound}>Add Custom Round</PrimaryButton>
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="Queued Rounds" defaultOpen>
                  {(state?.pendingRounds.length ?? 0) === 0 ? (
                    <p className="text-sm text-slate-500">No rounds queued yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {state?.pendingRounds.map((round, index) => (
                        <div
                          key={`${round.title}-${index}`}
                          className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                        >
                          <span>
                            <span className="block font-semibold text-slate-800">{round.title}</span>
                            <span className="text-sm text-slate-500">{round.artist}</span>
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
                    <p className="text-xl font-bold text-slate-900">{state.currentRound.title}</p>
                    <p className="text-sm text-slate-500">{state.currentRound.artist}</p>
                  </div>
                </div>
                <LyricBoard lines={state.currentRound.lines} />
              </CollapsiblePanel>
            ) : null}
          </div>

          <div className="space-y-6">
            <CollapsiblePanel title="Live Controls" defaultOpen>
              <BeatTimer
                active={state?.beat.active ?? false}
                endsAt={state?.beat.endsAt ?? null}
                durationMs={state?.beat.durationMs ?? 15000}
              />
              <div className="mt-4 grid gap-2">
                {state?.phase === "round-setup" ? (
                  <PrimaryButton onClick={() => runHostAction(startWordPhase)}>
                    Start Word Guessing
                  </PrimaryButton>
                ) : null}
                {state?.phase === "word-guess" ? (
                  <>
                    <PrimaryButton onClick={() => runHostAction(startBeat)}>
                      Start Beat
                    </PrimaryButton>
                    <SecondaryButton onClick={() => runHostAction(endBeat)}>
                      End Beat Early
                    </SecondaryButton>
                    <SecondaryButton onClick={() => runHostAction(startSongPhase)}>
                      Move to Song Guess
                    </SecondaryButton>
                  </>
                ) : null}
                {state?.phase === "song-guess" ? (
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
                className="mb-3 w-full rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
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
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {player.displayName}
                  </span>
                ))}
              </div>
            </CollapsiblePanel>

            {state?.answerKey.length ? (
              <CollapsiblePanel title="Answer Key (host only)" defaultOpen>
                <p className="font-mono text-sm text-slate-600">{state.answerKey.join(", ")}</p>
              </CollapsiblePanel>
            ) : null}

            {state?.recentWordGuesses.length ? (
              <CollapsiblePanel title="Recent Word Guesses" defaultOpen>
                <div className="space-y-2">
                  {state.recentWordGuesses.map((guess, index) => (
                    <div key={`${guess.playerId}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-800">{guess.playerName}</span>
                      <span className="text-slate-500"> guessed </span>
                      <span className="font-semibold text-violet-700">{guess.word}</span>
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
                        guess.accepted ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-700"
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
