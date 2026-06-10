"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  LyricBoard,
  MusicBackdrop,
  Panel,
  PhaseBadge,
  PrimaryButton,
  SecondaryButton,
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
  const [answerMode, setAnswerMode] = useState<"word" | "song">("word");
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
  const activeAnswerMode = state?.phase === "song-guess" ? "song" : answerMode;
  const answerValue = activeAnswerMode === "song" ? songGuess : wordGuess;
  const answerLocked = activeAnswerMode === "word" && wordCooldownRemainingMs > 0;
  const answerActive = activeAnswerMode === "song" ? songGuessingActive : wordGuessingActive;
  const answerPlaceholder = activeAnswerMode === "song" ? "Song title" : "Your word guess";
  const answerSubmitLabel =
    activeAnswerMode === "song"
      ? "Submit Song"
      : wordCooldownRemainingMs > 0
        ? `${wordCooldownRemainingSeconds}s`
        : "Send";
  const answerDisabled =
    !answerActive ||
    !answerValue.trim() ||
    (activeAnswerMode === "word" && wordSubmitDisabled);

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

  const submitAnswer = () => {
    if (activeAnswerMode === "song") {
      void submitSongGuess();
      return;
    }

    void submitWordGuess();
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
      <main className="mx-auto flex min-h-full max-w-lg flex-col px-4 py-4 sm:max-w-xl">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-black text-[#f4ede3]">{displayName}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7d6b]">Lyric Victory</p>
          </div>
          {state ? <PhaseBadge phase={state.phase} /> : null}
        </header>

        <div className="mb-3 grid grid-cols-[1fr_1.2fr_1fr] gap-2">
          <div className="rounded-xl bg-surface/90 px-3 py-2 text-center ring-1 ring-ink/20">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a7d6b]">Score</p>
            <p className="text-xl font-black text-ink">{currentPlayer?.score ?? 0}</p>
          </div>
          <div
            className={`rounded-xl px-3 py-2 text-center ring-1 ${
              answerLocked
                ? "bg-red-950/70 ring-red-400/40"
                : "bg-surface/90 ring-ink/20"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a7d6b]">Lockout</p>
            <p className={`text-xl font-black ${answerLocked ? "text-red-200" : "text-success"}`}>
              {answerLocked ? `${wordCooldownRemainingSeconds}s` : "Ready"}
            </p>
          </div>
          <div className="rounded-xl bg-surface/90 px-3 py-2 text-center ring-1 ring-ink/20">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a7d6b]">Room</p>
            <p className="font-mono text-xl font-black tracking-wide text-ink">{roomCode}</p>
          </div>
        </div>

        {!connected ? (
          <p className="mb-3 rounded-xl bg-red-950/60 px-4 py-2 text-center text-sm font-semibold text-red-300 ring-1 ring-red-500/30">
            Reconnecting...
          </p>
        ) : null}

        {wordGuessingActive || songGuessingActive ? (
          <Panel title={activeAnswerMode === "song" ? "Guess the song" : "Guess a missing word"} className="mb-3">
            <div className="mb-3 flex gap-2">
              <input
                value={answerValue}
                onChange={(event) => {
                  if (activeAnswerMode === "song") {
                    setSongGuess(event.target.value);
                  } else {
                    setWordGuess(event.target.value);
                  }
                }}
                placeholder={answerPlaceholder}
                className="input-dark min-h-16 min-w-0 flex-1 rounded-2xl px-4 py-4 text-lg font-black"
              />
              <PrimaryButton onClick={submitAnswer} disabled={answerDisabled} className="min-w-24">
                {answerSubmitLabel}
              </PrimaryButton>
            </div>
            <div className="flex items-center gap-2">
              {state?.phase !== "song-guess" ? (
                <SecondaryButton
                  onClick={() => setAnswerMode(activeAnswerMode === "song" ? "word" : "song")}
                  disabled={!songGuessingActive}
                  className="shrink-0"
                >
                  {activeAnswerMode === "song" ? "Guess Word" : "Guess Song"}
                </SecondaryButton>
              ) : null}
              <p className="min-w-0 flex-1 text-sm font-medium text-[#c4b5a0]">
                {submitError ??
                  feedback ??
                  (activeAnswerMode === "song"
                    ? "Name the track."
                    : answerLocked
                      ? `Locked for ${wordCooldownRemainingSeconds}s.`
                      : "Type any missing lyric word.")}
              </p>
            </div>
            {state?.announcement ? (
              <p className="mt-3 border-t border-ink/15 pt-3 text-center text-xs font-semibold text-ink">
                {state.announcement}
              </p>
            ) : null}
          </Panel>
        ) : (
          <Panel className="mb-3">
            <p className="text-center text-sm text-[#c4b5a0]">
              {state?.phase === "lobby"
                ? "Waiting for the host to start the game..."
                : "Waiting for the next round..."}
            </p>
          </Panel>
        )}

        {state?.currentRound ? (
          <Panel title="Missing lyric clues" className="mb-3">
            <p className="mb-2 text-xs font-medium text-[#8a7d6b]">
              Numbers show the length of each hidden word.
            </p>
            <div className="max-h-36 overflow-y-auto pr-1">
              <LyricBoard lines={state.currentRound.lines} size="sm" />
            </div>
          </Panel>
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

