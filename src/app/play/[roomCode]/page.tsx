"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  BeatTimer,
  LyricBoard,
  MusicBackdrop,
  Panel,
  PhaseBadge,
  PrimaryButton,
  RoomCodeBadge,
} from "@/components/game-ui";
import {
  getStoredPlayerId,
  getStoredPlayerName,
  joinAsPlayer,
  usePlayerGame,
} from "@/hooks/useGameSocket";

function PlayRoomContent() {
  const params = useParams<{ roomCode: string }>();
  const searchParams = useSearchParams();
  const roomCode = params.roomCode.toUpperCase();
  const initialName = searchParams.get("name") ?? "";

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(initialName);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [wordGuess, setWordGuess] = useState("");
  const [songGuess, setSongGuess] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const { state, connected, submitError, joinError: socketJoinError, guessWord, guessSong } =
    usePlayerGame(roomCode, playerId);

  useEffect(() => {
    const storedId = getStoredPlayerId(roomCode);
    const storedName = getStoredPlayerName(roomCode);
    if (storedId) {
      setPlayerId(storedId);
      if (storedName) setDisplayName(storedName);
      return;
    }
    if (!initialName) return;

    setJoining(true);
    joinAsPlayer(roomCode, initialName)
      .then(({ playerId: id, displayName: name }) => {
        setPlayerId(id);
        setDisplayName(name);
      })
      .catch((error: Error) => setJoinError(error.message))
      .finally(() => setJoining(false));
  }, [roomCode, initialName]);

  const handleJoin = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const result = await joinAsPlayer(roomCode, displayName);
      setPlayerId(result.playerId);
      setDisplayName(result.displayName);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Join failed.");
    } finally {
      setJoining(false);
    }
  };

  const submitWordGuess = async () => {
    const ok = await guessWord(wordGuess);
    if (ok) {
      setFeedback("Guess submitted for this beat.");
      setWordGuess("");
    }
  };

  const submitSongGuess = async () => {
    const result = await guessSong(songGuess);
    if (result.ok) {
      setFeedback(result.accepted ? "Correct song!" : "Submitted — waiting for match.");
      if (result.accepted) setSongGuess("");
    }
  };

  if (!playerId) {
    return (
      <MusicBackdrop>
        <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
          <Panel title={`Join ${roomCode}`}>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              className="mb-3 w-full rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
            />
            {(joinError || socketJoinError || submitError) && (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {joinError ?? socketJoinError ?? submitError}
              </p>
            )}
            <PrimaryButton onClick={handleJoin} disabled={joining || !displayName.trim()} className="w-full">
              {joining ? "Joining…" : "Join Game"}
            </PrimaryButton>
          </Panel>
        </main>
      </MusicBackdrop>
    );
  }

  return (
    <MusicBackdrop>
      <main className="mx-auto max-w-lg px-4 py-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-600">{displayName}</p>
            <h1 className="text-2xl font-black text-slate-900">Lyric Victory</h1>
          </div>
          <RoomCodeBadge code={roomCode} />
        </header>

        <div className="mb-4 flex items-center justify-between">
          {state ? <PhaseBadge phase={state.phase} /> : null}
          <span className={`text-sm ${connected ? "text-emerald-600" : "text-red-500"}`}>
            {connected ? "Connected" : "Reconnecting…"}
          </span>
        </div>

        {state?.announcement ? (
          <Panel className="mb-4">
            <p className="text-center text-sm font-medium text-violet-700">{state.announcement}</p>
          </Panel>
        ) : null}

        {state?.currentRound ? (
          <Panel title="Lyrics" className="mb-4">
            <LyricBoard lines={state.currentRound.lines} size="sm" />
          </Panel>
        ) : (
          <Panel className="mb-4">
            <p className="text-center text-sm text-slate-500">
              {state?.phase === "lobby"
                ? "Waiting for the host to start the game…"
                : "Waiting for the next round…"}
            </p>
          </Panel>
        )}

        {state?.phase === "word-guess" ? (
          <Panel title="Guess a Word" className="mb-4">
            <BeatTimer
              active={state.beat.active}
              endsAt={state.beat.endsAt}
              durationMs={state.beat.durationMs}
            />
            <p className="my-3 text-sm text-slate-600">
              Submit whole words during each beat. All correct matches reveal on the TV board.
            </p>
            <div className="flex gap-2">
              <input
                value={wordGuess}
                onChange={(event) => setWordGuess(event.target.value)}
                placeholder="Your word guess"
                className="flex-1 rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
              />
              <PrimaryButton onClick={submitWordGuess} disabled={!state.beat.active || !wordGuess.trim()}>
                Send
              </PrimaryButton>
            </div>
          </Panel>
        ) : null}

        {state?.phase === "song-guess" ? (
          <Panel title="Name That Song" className="mb-4">
            <div className="flex gap-2">
              <input
                value={songGuess}
                onChange={(event) => setSongGuess(event.target.value)}
                placeholder="Song title"
                className="flex-1 rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
              />
              <PrimaryButton onClick={submitSongGuess} disabled={!songGuess.trim()}>
                Send
              </PrimaryButton>
            </div>
          </Panel>
        ) : null}

        {feedback || submitError ? (
          <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700">
            {submitError ?? feedback}
          </p>
        ) : null}
      </main>
    </MusicBackdrop>
  );
}

export default function PlayRoomPage() {
  return (
    <Suspense
      fallback={
        <MusicBackdrop>
          <main className="mx-auto flex min-h-full max-w-lg items-center justify-center px-6 py-16">
            <Panel>Loading player view…</Panel>
          </main>
        </MusicBackdrop>
      }
    >
      <PlayRoomContent />
    </Suspense>
  );
}
