"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { HostGameState, PublicGameState } from "@/lib/types";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

function useGameState(code?: string) {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!code) return;

    const client = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (nextState: PublicGameState) => setState(nextState);

    client.on("connect", onConnect);
    client.on("disconnect", onDisconnect);
    client.on("game:state", onState);

    if (client.connected) {
      setConnected(true);
    } else {
      client.connect();
    }

    return () => {
      client.off("connect", onConnect);
      client.off("disconnect", onDisconnect);
      client.off("game:state", onState);
    };
  }, [code]);

  return { state, connected, setState };
}

export function usePublicGame(code?: string) {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    const client = getSocket();

    const joinDisplay = () => {
      client.emit("display:join", { code }, (response: { ok: boolean; error?: string }) => {
        if (!response?.ok) {
          setError(response?.error ?? "Unable to join room.");
        } else {
          setError(null);
        }
      });
    };

    const onConnect = () => {
      setConnected(true);
      joinDisplay();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (nextState: PublicGameState) => setState(nextState);

    client.on("connect", onConnect);
    client.on("disconnect", onDisconnect);
    client.on("game:state", onState);

    if (client.connected) {
      onConnect();
    } else {
      client.connect();
    }

    return () => {
      client.off("connect", onConnect);
      client.off("disconnect", onDisconnect);
      client.off("game:state", onState);
    };
  }, [code]);

  return { state, connected, error };
}

export function usePlayerGame(code: string, playerId: string | null) {
  const { state, connected } = useGameState(code);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastGuess, setLastGuess] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !playerId) return;

    const client = getSocket();

    const rejoin = () => {
      client.emit(
        "player:rejoin",
        { code, playerId },
        (response: { ok: boolean; error?: string }) => {
          if (!response.ok) {
            setJoinError(response.error ?? "Unable to rejoin room.");
          } else {
            setJoinError(null);
          }
        },
      );
    };

    client.on("connect", rejoin);
    if (client.connected) {
      rejoin();
    } else {
      client.connect();
    }

    return () => {
      client.off("connect", rejoin);
    };
  }, [code, playerId]);

  const guessWord = (word: string) =>
    new Promise<{ ok: boolean; accepted?: boolean; points?: number; count?: number; cooldownUntil?: number | null }>((resolve) => {
      if (!playerId) {
        resolve({ ok: false });
        return;
      }
      getSocket().emit(
        "player:guess-word",
        { code, playerId, word },
        (response: { ok: boolean; accepted?: boolean; points?: number; count?: number; cooldownUntil?: number | null; error?: string }) => {
          if (!response.ok) {
            setSubmitError(response.error ?? "Guess failed.");
            resolve({ ok: false, cooldownUntil: response.cooldownUntil });
            return;
          }
          setSubmitError(null);
          setLastGuess(word);
          resolve({
              ok: true,
              accepted: response.accepted,
              points: response.points,
              count: response.count,
              cooldownUntil: response.cooldownUntil,
            });
        },
      );
    });

  const guessSong = (title: string) =>
    new Promise<{ ok: boolean; accepted?: boolean; points?: number; rank?: number }>((resolve) => {
      if (!playerId) {
        resolve({ ok: false });
        return;
      }
      getSocket().emit(
        "player:guess-song",
        { code, playerId, title },
        (response: { ok: boolean; accepted?: boolean; points?: number; rank?: number; error?: string }) => {
          if (!response.ok) {
            setSubmitError(response.error ?? "Guess failed.");
            resolve({ ok: false });
            return;
          }
          setSubmitError(null);
          resolve({ ok: true, accepted: response.accepted, points: response.points, rank: response.rank });
        },
      );
    });

  return {
    state,
    connected,
    joinError,
    submitError,
    lastGuess,
    guessWord,
    guessSong,
  };
}

export function useHostGame(code: string, hostToken: string | null) {
  const [state, setState] = useState<HostGameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !hostToken) return;

    const client = getSocket();

    const onConnect = () => {
      setConnected(true);
      client.emit(
        "host:rejoin",
        { code, hostToken },
        (response: { ok: boolean; error?: string }) => {
          if (!response?.ok) {
            setError(response?.error ?? "Unable to rejoin as host.");
          } else {
            setError(null);
          }
        },
      );
    };
    const onDisconnect = () => setConnected(false);
    const onPublicState = (nextState: PublicGameState) => {
      setState((prev) => (prev ? { ...prev, ...nextState } : null));
    };
    const onHostState = (nextState: HostGameState) => setState(nextState);

    client.on("connect", onConnect);
    client.on("disconnect", onDisconnect);
    client.on("game:state", onPublicState);
    client.on("game:host-state", onHostState);

    if (!client.connected) {
      client.connect();
    } else {
      onConnect();
    }

    return () => {
      client.off("connect", onConnect);
      client.off("disconnect", onDisconnect);
      client.off("game:state", onPublicState);
      client.off("game:host-state", onHostState);
    };
  }, [code, hostToken]);

  const emitHost = <T,>(event: string, payload: Record<string, unknown>) =>
    new Promise<T>((resolve) => {
      if (!hostToken) {
        resolve({ ok: false, error: "Missing host token." } as T);
        return;
      }
      getSocket().emit(event, { code, hostToken, ...payload }, resolve);
    });

  return {
    state,
    connected,
    error,
    addRound: (round: { title: string; artist: string; template: string; answers: string[] }) =>
      emitHost<{ ok: boolean; error?: string }>("host:add-round", { round }),
    removeRound: (index: number) =>
      emitHost<{ ok: boolean; error?: string }>("host:remove-round", { index }),
    setAnnouncement: (message: string) =>
      emitHost<{ ok: boolean; error?: string }>("host:set-announcement", { message }),
    startGame: () => emitHost<{ ok: boolean; error?: string }>("host:start-game", {}),
    startWordPhase: () => emitHost<{ ok: boolean; error?: string }>("host:start-word-phase", {}),
    startSongPhase: () => emitHost<{ ok: boolean; error?: string }>("host:start-song-phase", {}),
    nextRound: () => emitHost<{ ok: boolean; error?: string }>("host:next-round", {}),
    endGame: () => emitHost<{ ok: boolean; error?: string }>("host:end-game", {}),
    setAutoRevealWords: (words: string[]) =>
      emitHost<{ ok: boolean; error?: string }>("host:set-auto-reveal-words", { words }),
    startAutoRevealPreview: (roundIndex: number, resetWords = true) =>
      emitHost<{ ok: boolean; error?: string }>("host:start-auto-reveal-preview", {
        roundIndex,
        resetWords,
      }),
    stopAutoRevealPreview: () =>
      emitHost<{ ok: boolean; error?: string }>("host:stop-auto-reveal-preview", {}),
    clearAutoRevealWords: () =>
      emitHost<{ ok: boolean; error?: string }>("host:clear-auto-reveal-words", {}),
  };
}

function storeHostToken(code: string, hostToken: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`lv-host-${code}`, hostToken);
  sessionStorage.setItem(`lv-host-${code}`, hostToken);
}

export function createRoom(): Promise<{ code: string; hostToken: string }> {
  return new Promise((resolve, reject) => {
    const client = getSocket();
    if (!client.connected) {
      client.connect();
    }
    client.emit("host:create-room", (response: { code: string; hostToken: string }) => {
      if (!response?.code) {
        reject(new Error("Failed to create room."));
        return;
      }
      storeHostToken(response.code, response.hostToken);
      resolve(response);
    });
  });
}

export function joinAsPlayer(
  code: string,
  displayName: string,
): Promise<{ playerId: string; displayName: string }> {
  return new Promise((resolve, reject) => {
    const client = getSocket();
    if (!client.connected) {
      client.connect();
    }
    client.emit(
      "player:join",
      { code, displayName },
      (response: {
        ok: boolean;
        playerId?: string;
        displayName?: string;
        error?: string;
      }) => {
        if (!response.ok || !response.playerId) {
          reject(new Error(response.error ?? "Failed to join room."));
          return;
        }
        sessionStorage.setItem(`lv-player-${code}`, response.playerId);
        sessionStorage.setItem(`lv-player-name-${code}`, response.displayName ?? displayName);
        resolve({ playerId: response.playerId, displayName: response.displayName ?? displayName });
      },
    );
  });
}

export function getStoredHostToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`lv-host-${code}`) ?? sessionStorage.getItem(`lv-host-${code}`);
}

export function getStoredPlayerId(code: string): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(`lv-player-${code}`);
}

export function getStoredPlayerName(code: string): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(`lv-player-name-${code}`);
}
