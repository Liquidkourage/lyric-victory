"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
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
  const [wordCooldownUntil, setWordCooldownUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { state, connected, submitError, joinError: socketJoinError, guessWord, guessSong } =
    usePlayerGame(roomCode, playerId);

  useEffect(() => {
    if (!wordCooldownUntil) return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [wordCooldownUntil]);

  useEffect(() => {
    if (wordCooldownUntil && wordCooldownUntil <= nowMs) {
      setWordCooldownUntil(null);
    }
  }, [wordCooldownUntil, nowMs]);

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

  const currentPlayer = state?.players.find((player) => player.id === playerId);
  const wordGuessingActive = state?.phase === "word-guess" || state?.phase === "between-rounds";
  const wordCooldownRemainingMs = wordCooldownUntil ? Math.max(0, wordCooldownUntil - nowMs) : 0;
  const wordCooldownRemainingSeconds = Math.ceil(wordCooldownRemainingMs / 1000);
  const wordSubmitDisabled = !wordGuess.trim() || wordCooldownRemainingMs > 0;
  const songGuessingActive =
    state?.phase === "word-guess" || state?.phase === "between-rounds" || state?.phase === "song-guess";

  const submitWordGuess = async () => {
    const result = await guessWord(wordGuess);
    if (result.ok) {
      if (result.cooldownUntil) {
        setWordCooldownUntil(result.cooldownUntil);
        setNowMs(Date.now());
      }

      setFeedback(
        result.accepted
          ? `Correct word${(result.count ?? 0) > 1 ? ` x${result.count}` : ""}! +${result.points ?? 0} points`
          : "Word sent. Keep listening.",
      );
      setWordGuess("");
    } else if (result.cooldownUntil) {
      setWordCooldownUntil(result.cooldownUntil);
      setNowMs(Date.now());
    }
  };

  const submitSongGuess = async () => {
    const result = await guessSong(songGuess);
    if (result.ok) {
      setFeedback(
        result.accepted
          ? `Correct song! +${result.points ?? 0} points`
          : "Title sent. Try again when it clicks.",
      );
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
              className="input-dark mb-3 w-full rounded-2xl px-4 py-3 text-sm"
            />
            {(joinError || socketJoinError || submitError) && (
              <p className="mb-3 rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
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
            <p className="text-sm font-semibold text-ink">{displayName}</p>
            <h1 className="font-display text-2xl font-black text-[#f4ede3]">Lyric Victory</h1>
          </div>
          <RoomCodeBadge code={roomCode} />
        </header>

        <div className="mb-4 flex items-center justify-between">
          {state ? <PhaseBadge phase={state.phase} /> : null}
          <span className={`text-sm ${connected ? "text-success" : "text-red-400"}`}>
            {connected ? "Connected" : "Reconnecting…"}
          </span>
        </div>


        <Panel className="mb-4">
          <p className="text-center text-sm font-semibold text-ink">
            Score: {currentPlayer?.score ?? 0}
          </p>
        </Panel>
        {state?.announcement ? (
          <Panel className="mb-4">
            <p className="text-center text-sm font-medium text-ink">{state.announcement}</p>
          </Panel>
        ) : null}

        {state?.currentRound ? (
          <Panel title="Puzzle" className="mb-4">
            <LyricBoard lines={state.currentRound.lines} size="sm" />
          </Panel>
        ) : (
          <Panel className="mb-4">
            <p className="text-center text-sm text-[#c4b5a0]">
              {state?.phase === "lobby"
                ? "Waiting for the host to start the game…"
                : "Waiting for the next round…"}
            </p>
          </Panel>
        )}

        {wordGuessingActive ? (
          <Panel title="Guess a Word" className="mb-4">
            <p className="my-3 text-sm text-[#c4b5a0]">
              Submit whole words as they come to you. Correct matches reveal on the TV board.
            </p>
            <div className="flex gap-2">
              <input
                value={wordGuess}
                onChange={(event) => setWordGuess(event.target.value)}
                placeholder="Your word guess"
                className="input-dark flex-1 rounded-2xl px-4 py-3 text-sm"
              />
              <PrimaryButton onClick={submitWordGuess} disabled={wordSubmitDisabled}>
                {wordCooldownRemainingMs > 0 ? `${wordCooldownRemainingSeconds}s` : "Send"}
              </PrimaryButton>
            </div>
          </Panel>
        ) : null}

        {songGuessingActive ? (
          <Panel title="Name That Song" className="mb-4">
            <div className="flex gap-2">
              <input
                value={songGuess}
                onChange={(event) => setSongGuess(event.target.value)}
                placeholder="Song title"
                className="input-dark flex-1 rounded-2xl px-4 py-3 text-sm"
              />
              <PrimaryButton onClick={submitSongGuess} disabled={!songGuess.trim()}>
                Send
              </PrimaryButton>
            </div>
          </Panel>
        ) : null}

        {feedback || submitError ? (
          <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink ring-1 ring-ink/20">
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

