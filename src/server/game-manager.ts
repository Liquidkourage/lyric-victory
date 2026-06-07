import type { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import {
  attachAnswers,
  fullyHideLyrics,
  normalizeSongTitle,
  parseLyricTemplate,
  titlesMatch,
} from "../lib/lyrics";
import { generateRoomCode, normalizeRoomCode } from "../lib/room-code";
import type {
  BeatState,
  HostGameState,
  Player,
  PublicGameState,
  PublicLine,
  PublicRoundState,
  RoundConfig,
  RoundState,
  SongGuessEntry,
  WordGuessEntry,
} from "../lib/types";

const BEAT_DURATION_MS = 15_000;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

interface InternalRoom {
  code: string;
  hostSocketId: string | null;
  hostToken: string;
  phase: HostGameState["phase"];
  players: Map<string, Player>;
  socketToPlayer: Map<string, string>;
  pendingRounds: RoundConfig[];
  rounds: RoundState[];
  currentRoundIndex: number;
  beat: BeatState;
  announcement: string;
  recentWordGuesses: WordGuessEntry[];
  beatTimer: NodeJS.Timeout | null;
  pendingWordGuesses: Map<string, { playerId: string; word: string }>;
  createdAt: number;
  updatedAt: number;
}

export class GameManager {
  private rooms = new Map<string, InternalRoom>();

  constructor(private io: Server) {
    setInterval(() => this.pruneRooms(), 60 * 60 * 1000);
  }

  registerHandlers(socket: Socket) {
    socket.on("host:create-room", (callback) => {
      const code = this.createUniqueCode();
      const hostToken = uuidv4();
      const room: InternalRoom = {
        code,
        hostSocketId: socket.id,
        hostToken,
        phase: "lobby",
        players: new Map(),
        socketToPlayer: new Map(),
        pendingRounds: [],
        rounds: [],
        currentRoundIndex: -1,
        beat: { number: 0, active: false, durationMs: BEAT_DURATION_MS, endsAt: null },
        announcement: "Waiting for players to join…",
        recentWordGuesses: [],
        beatTimer: null,
        pendingWordGuesses: new Map(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.rooms.set(code, room);
      socket.join(code);
      callback({ code, hostToken });
      this.broadcast(code);
    });

    socket.on("host:rejoin", ({ code, hostToken }, callback) => {
      const room = this.getRoom(code);
      if (!room || room.hostToken !== hostToken) {
        callback({ ok: false, error: "Invalid host credentials." });
        return;
      }
      room.hostSocketId = socket.id;
      socket.join(code);
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("player:join", ({ code, displayName }, callback) => {
      const room = this.getRoom(code);
      if (!room) {
        callback({ ok: false, error: "Room not found." });
        return;
      }
      if (room.phase === "ended") {
        callback({ ok: false, error: "This game has ended." });
        return;
      }

      const trimmedName = displayName.trim().slice(0, 24);
      if (!trimmedName) {
        callback({ ok: false, error: "Display name is required." });
        return;
      }

      const existingPlayerId = room.socketToPlayer.get(socket.id);
      if (existingPlayerId) {
        const player = room.players.get(existingPlayerId)!;
        player.connected = true;
        callback({ ok: true, playerId: player.id, displayName: player.displayName });
        this.broadcast(code);
        return;
      }

      const playerId = uuidv4();
      const player: Player = {
        id: playerId,
        displayName: trimmedName,
        connected: true,
      };
      room.players.set(playerId, player);
      room.socketToPlayer.set(socket.id, playerId);
      socket.join(code);
      room.updatedAt = Date.now();
      callback({ ok: true, playerId, displayName: trimmedName });
      this.broadcast(code);
    });

    socket.on("player:rejoin", ({ code, playerId }, callback) => {
      const room = this.getRoom(code);
      if (!room) {
        callback({ ok: false, error: "Room not found." });
        return;
      }
      const player = room.players.get(playerId);
      if (!player) {
        callback({ ok: false, error: "Player not found." });
        return;
      }

      room.socketToPlayer.set(socket.id, playerId);
      player.connected = true;
      socket.join(code);
      room.updatedAt = Date.now();
      callback({ ok: true, playerId, displayName: player.displayName });
      this.broadcast(code);
    });

    socket.on("display:join", ({ code }, callback) => {
      const room = this.getRoom(code);
      if (!room) {
        callback({ ok: false, error: "Room not found." });
        return;
      }
      socket.join(code);
      callback({ ok: true });
      socket.emit("game:state", this.toPublicState(room));
    });

    socket.on("host:add-round", ({ code, hostToken, round }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      try {
        const hidden = fullyHideLyrics(round.template, round.answers);
        const parsed = attachAnswers(parseLyricTemplate(hidden.template), hidden.answers);
        if (parsed.answers.some((answer) => !answer)) {
          callback({ ok: false, error: "Every blank needs an answer." });
          return;
        }
        room.pendingRounds.push({
          title: round.title.trim(),
          artist: round.artist.trim(),
          template: parsed.template,
          answers: parsed.answers,
        });
        room.updatedAt = Date.now();
        callback({ ok: true });
        this.broadcast(code);
      } catch (error) {
        callback({
          ok: false,
          error: error instanceof Error ? error.message : "Invalid round data.",
        });
      }
    });

    socket.on("host:remove-round", ({ code, hostToken, index }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      room.pendingRounds.splice(index, 1);
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:set-announcement", ({ code, hostToken, message }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      room.announcement = message.trim().slice(0, 160) || " ";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-game", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      if (room.pendingRounds.length === 0) {
        callback({ ok: false, error: "Add at least one song round first." });
        return;
      }
      room.rounds = room.pendingRounds.map((round) => this.buildRoundState(round));
      room.currentRoundIndex = 0;
      room.phase = "round-setup";
      room.announcement = "Round 1 — guess the words!";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-word-phase", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room || room.currentRoundIndex < 0) {
        callback({ ok: false, error: "No active round." });
        return;
      }
      room.phase = "word-guess";
      room.beat = { number: 0, active: false, durationMs: BEAT_DURATION_MS, endsAt: null };
      room.recentWordGuesses = [];
      room.pendingWordGuesses.clear();
      room.announcement = "Word guessing begins — wait for the beat!";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-beat", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room || room.phase !== "word-guess") {
        callback({ ok: false, error: "Word phase is not active." });
        return;
      }
      this.startBeat(room);
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:end-beat", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room || room.phase !== "word-guess") {
        callback({ ok: false, error: "Word phase is not active." });
        return;
      }
      this.resolveBeat(room);
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-song-phase", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room || room.currentRoundIndex < 0) {
        callback({ ok: false, error: "No active round." });
        return;
      }
      this.clearBeatTimer(room);
      room.phase = "song-guess";
      room.beat = { number: room.beat.number, active: false, durationMs: BEAT_DURATION_MS, endsAt: null };
      room.announcement = "Name that song!";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:next-round", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      if (room.currentRoundIndex >= room.rounds.length - 1) {
        room.phase = "ended";
        room.announcement = "Thanks for playing Lyric Victory!";
      } else {
        room.currentRoundIndex += 1;
        room.phase = "round-setup";
        const round = room.rounds[room.currentRoundIndex];
        room.announcement = `Round ${room.currentRoundIndex + 1} — guess the words!`;
        room.recentWordGuesses = [];
      }
      this.clearBeatTimer(room);
      room.beat = { number: 0, active: false, durationMs: BEAT_DURATION_MS, endsAt: null };
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:end-game", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      room.phase = "ended";
      room.announcement = "Game ended by host.";
      this.clearBeatTimer(room);
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("player:guess-word", ({ code, playerId, word }, callback) => {
      const room = this.getRoom(code);
      if (!room || room.phase !== "word-guess" || !room.beat.active) {
        callback({ ok: false, error: "Beat is not active." });
        return;
      }
      const player = room.players.get(playerId);
      if (!player) {
        callback({ ok: false, error: "Player not found." });
        return;
      }
      const normalizedWord = word.trim().toLowerCase();
      if (!normalizedWord) {
        callback({ ok: false, error: "Enter a word." });
        return;
      }
      room.pendingWordGuesses.set(playerId, { playerId, word: normalizedWord });
      callback({ ok: true, queued: true });
    });

    socket.on("player:guess-song", ({ code, playerId, title }, callback) => {
      const room = this.getRoom(code);
      if (!room || room.phase !== "song-guess" || room.currentRoundIndex < 0) {
        callback({ ok: false, error: "Song guessing is not active." });
        return;
      }
      const player = room.players.get(playerId);
      if (!player) {
        callback({ ok: false, error: "Player not found." });
        return;
      }
      const round = room.rounds[room.currentRoundIndex];
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        callback({ ok: false, error: "Enter a song title." });
        return;
      }

      const accepted = titlesMatch(normalizedTitle, round.title);
      const entry: SongGuessEntry = {
        playerId,
        playerName: player.displayName,
        title: normalizedTitle,
        accepted,
        submittedAt: Date.now(),
      };

      const existingIndex = round.songGuesses.findIndex((guess) => guess.playerId === playerId);
      if (existingIndex >= 0) {
        round.songGuesses[existingIndex] = entry;
      } else {
        round.songGuesses.push(entry);
      }

      room.updatedAt = Date.now();
      callback({ ok: true, accepted });
      this.broadcast(code);
    });

    socket.on("disconnect", () => {
      for (const room of this.rooms.values()) {
        if (room.hostSocketId === socket.id) {
          room.hostSocketId = null;
        }
        const playerId = room.socketToPlayer.get(socket.id);
        if (playerId) {
          const player = room.players.get(playerId);
          if (player) {
            player.connected = false;
          }
          room.socketToPlayer.delete(socket.id);
        }
        this.broadcast(room.code);
      }
    });
  }

  private startBeat(room: InternalRoom) {
    this.clearBeatTimer(room);
    room.beat.number += 1;
    room.beat.active = true;
    room.beat.endsAt = Date.now() + room.beat.durationMs;
    room.announcement = `Beat ${room.beat.number} — submit your word guesses!`;
    room.pendingWordGuesses.clear();
    room.updatedAt = Date.now();

    room.beatTimer = setTimeout(() => {
      this.resolveBeat(room);
      this.broadcast(room.code);
    }, room.beat.durationMs);
  }

  private resolveBeat(room: InternalRoom) {
    if (!room.beat.active && room.pendingWordGuesses.size === 0) {
      return;
    }

    this.clearBeatTimer(room);
    room.beat.active = false;
    room.beat.endsAt = null;

    const round = room.rounds[room.currentRoundIndex];
    if (!round) return;

    const answerMap = new Map<number, string>();
    round.tokens.forEach((token) => {
      if (token.type === "blank") {
        answerMap.set(token.index, round.answers[token.index]?.toLowerCase() ?? "");
      }
    });

    for (const [playerId, submission] of room.pendingWordGuesses.entries()) {
      const player = room.players.get(playerId);
      if (!player) continue;

      for (const [blankIndex, answer] of answerMap.entries()) {
        if (round.revealedBlankIndices.includes(blankIndex)) continue;
        if (submission.word !== answer) continue;

        if (!round.revealedBlankIndices.includes(blankIndex)) {
          round.revealedBlankIndices.push(blankIndex);
        }

        room.recentWordGuesses.unshift({
          playerId,
          playerName: player.displayName,
          word: submission.word,
          blankIndex,
          beatNumber: room.beat.number,
          accepted: true,
        });
      }
    }

    room.recentWordGuesses = room.recentWordGuesses.slice(0, 12);
    room.pendingWordGuesses.clear();
    room.announcement = `Beat ${room.beat.number} closed — check the board!`;
    room.updatedAt = Date.now();
  }

  private clearBeatTimer(room: InternalRoom) {
    if (room.beatTimer) {
      clearTimeout(room.beatTimer);
      room.beatTimer = null;
    }
  }

  private buildRoundState(round: RoundConfig): RoundState {
    const parsed = attachAnswers(parseLyricTemplate(round.template), round.answers);
    return {
      title: round.title,
      artist: round.artist,
      template: parsed.template,
      tokens: parsed.tokens,
      lines: parsed.lines,
      answers: parsed.answers,
      revealedBlankIndices: [],
      songGuesses: [],
    };
  }

  private createUniqueCode(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = generateRoomCode();
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    return generateRoomCode(8);
  }

  private getRoom(codeInput: string): InternalRoom | undefined {
    const code = normalizeRoomCode(codeInput);
    return this.rooms.get(code);
  }

  private requireHost(codeInput: string, hostToken: string, socketId: string) {
    const room = this.getRoom(codeInput);
    if (!room || room.hostToken !== hostToken || room.hostSocketId !== socketId) {
      return undefined;
    }
    return room;
  }

  private broadcast(code: string) {
    const room = this.getRoom(code);
    if (!room) return;
    this.io.to(code).emit("game:state", this.toPublicState(room));
    if (room.hostSocketId) {
      this.io.to(room.hostSocketId).emit("game:host-state", this.toHostState(room));
    }
  }

  private toPublicState(room: InternalRoom): PublicGameState {
    const currentRound =
      room.currentRoundIndex >= 0 ? this.toPublicRound(room.rounds[room.currentRoundIndex]) : null;

    return {
      code: room.code,
      phase: room.phase,
      players: Array.from(room.players.values()),
      announcement: room.announcement,
      currentRound,
      currentRoundIndex: room.currentRoundIndex,
      totalRounds: room.rounds.length,
      beat: { ...room.beat },
      recentWordGuesses: room.recentWordGuesses,
      roundHistory: [],
    };
  }

  private toHostState(room: InternalRoom): HostGameState {
    const currentRound =
      room.currentRoundIndex >= 0 ? room.rounds[room.currentRoundIndex] : null;
    const publicState = this.toPublicState(room);

    return {
      ...publicState,
      currentRound: currentRound
        ? {
            ...this.toPublicRound(currentRound),
            title: currentRound.title,
            artist: currentRound.artist,
          }
        : null,
      roundHistory: room.rounds.map(({ title, artist }) => ({ title, artist })),
      roundDraft: null,
      pendingRounds: room.pendingRounds,
      answerKey: currentRound?.answers ?? [],
    };
  }

  private toPublicRound(round: RoundState): PublicRoundState {
    return {
      title: "",
      artist: "",
      lines: round.lines.map((line) => ({
        tokens: line.map((token) => {
          if (token.type === "text") {
            return { type: "text" as const, value: token.value };
          }
          const revealed = round.revealedBlankIndices.includes(token.index);
          return {
            type: "blank" as const,
            index: token.index,
            length: token.length,
            revealed,
            answer: revealed ? round.answers[token.index] : undefined,
          };
        }),
      })),
      songGuesses: round.songGuesses,
    };
  }

  private pruneRooms() {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this.rooms.entries()) {
      if (room.updatedAt < cutoff) {
        this.clearBeatTimer(room);
        this.rooms.delete(code);
      }
    }
  }
}

export function normalizeSongTitleForClient(value: string): string {
  return normalizeSongTitle(value);
}
