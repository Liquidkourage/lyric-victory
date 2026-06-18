import type { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import {
  attachAnswers,
  fullyHideLyrics,
  normalizeSongTitle,
  normalizeWordGuess,
  parseLyricTemplate,
  titlesMatch,
} from "../lib/lyrics";
import { INCREDIBLY_COMMON_WORDS } from "../lib/common-words";
import { FREE_FOR_ALL_MS, WORD_GUESS_COOLDOWN_MS } from "../lib/game-constants";
import { generateRoomCode, normalizeRoomCode } from "../lib/room-code";
import { getWordGuessPointValues } from "../lib/lyric-scoring";
import type {
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
import { loadRoomSnapshot, saveRoomSnapshot, getRoomStoreStatus, type PersistedRoom } from "./room-store";

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
  announcement: string;
  recentWordGuesses: WordGuessEntry[];
  roundTimer: NodeJS.Timeout | null;
  wordCooldowns: Map<string, number>;
  autoRevealWords: Set<string> | null;
  autoRevealTuningActive: boolean;
  tuningPreviewRoundIndex: number;
  tuningPreviewRound: RoundState | null;
  createdAt: number;
  updatedAt: number;
}

export class GameManager {
  private rooms = new Map<string, InternalRoom>();
  private persistTimer: NodeJS.Timeout | null = null;

  private constructor(private io: Server) {}

  static async create(io: Server): Promise<GameManager> {
    const manager = new GameManager(io);
    const snapshots = await loadRoomSnapshot();
    for (const room of snapshots.map((snapshot) => manager.hydrateRoom(snapshot))) {
      manager.rooms.set(room.code, room);
      manager.restoreRoomTimers(room);
    }

    if (manager.rooms.size === 0) {
      const status = getRoomStoreStatus();
      if (!status.redisConfigured) {
        console.warn(
          "[rooms] No rooms loaded. Add Railway Redis (REDIS_URL) so rooms survive deploys and refresh.",
        );
      }
    }

    return manager;
  }

  getStatus() {
    return {
      activeRooms: this.rooms.size,
      roomCodes: [...this.rooms.keys()],
      ...getRoomStoreStatus(),
    };
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
        announcement: "Waiting for players to join…",
        recentWordGuesses: [],
        roundTimer: null,
        wordCooldowns: new Map(),
        autoRevealWords: null,
        autoRevealTuningActive: false,
        tuningPreviewRoundIndex: -1,
        tuningPreviewRound: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.rooms.set(code, room);
      socket.join(code);
      callback({ code, hostToken });
      this.broadcast(code);
      this.flushPersist();
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
      socket.emit("game:host-state", this.toHostState(room));
      socket.emit("game:state", this.toPublicState(room));
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
        score: 0,
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
      const room = this.requireHost(code, hostToken, socket);
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
      const room = this.requireHost(code, hostToken, socket);
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
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      room.announcement = message.trim().slice(0, 160) || " ";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:set-auto-reveal-words", ({ code, hostToken, words }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }

      if (!Array.isArray(words)) {
        callback({ ok: false, error: "Invalid auto-reveal word list." });
        return;
      }

      const normalized = words
        .map((word) => normalizeWordGuess(String(word)))
        .filter(Boolean);

      room.autoRevealWords = new Set(normalized);
      if (room.autoRevealTuningActive) {
        this.rebuildTuningPreviewRound(room);
      } else {
        this.applyAutoRevealWords(room);
      }
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-auto-reveal-preview", ({ code, hostToken, roundIndex, resetWords = true }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      if (room.phase !== "lobby") {
        callback({ ok: false, error: "Tuning preview is only available before the game starts." });
        return;
      }

      const index = Number(roundIndex);
      if (!Number.isInteger(index) || index < 0 || !room.pendingRounds[index]) {
        callback({ ok: false, error: "Choose a queued song to preview." });
        return;
      }

      room.autoRevealTuningActive = true;
      room.tuningPreviewRoundIndex = index;
      if (resetWords) {
        room.autoRevealWords = new Set();
      } else if (room.autoRevealWords === null) {
        room.autoRevealWords = new Set();
      }
      this.rebuildTuningPreviewRound(room);
      room.announcement = "Auto-reveal tuning — all words hidden";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:stop-auto-reveal-preview", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }

      room.autoRevealTuningActive = false;
      room.tuningPreviewRoundIndex = -1;
      room.tuningPreviewRound = null;
      room.announcement = "Waiting for players to join…";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:clear-auto-reveal-words", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }

      room.autoRevealWords = null;
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-game", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      if (room.pendingRounds.length === 0) {
        callback({ ok: false, error: "Add at least one song round first." });
        return;
      }
      room.autoRevealTuningActive = false;
      room.tuningPreviewRoundIndex = -1;
      room.tuningPreviewRound = null;
      room.rounds = room.pendingRounds.map((round) => this.buildRoundState(round, this.getAutoRevealWords(room)));
      room.players.forEach((player) => {
        player.score = 0;
      });
      room.currentRoundIndex = 0;
      room.phase = "round-setup";
      room.announcement = "Round 1 — guess the words!";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-word-phase", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room || room.currentRoundIndex < 0) {
        callback({ ok: false, error: "No active round." });
        return;
      }
      this.clearRoundTimer(room);
      room.phase = "word-guess";
      room.recentWordGuesses = [];
      room.wordCooldowns.clear();
      room.announcement = "Guess words now. Name the song any time.";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:start-song-phase", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room || room.currentRoundIndex < 0) {
        callback({ ok: false, error: "No active round." });
        return;
      }
      this.clearRoundTimer(room);
      room.phase = "song-guess";
      room.announcement = "Final title chance. Players who have not solved it get one guess.";
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:next-round", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
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
      this.clearRoundTimer(room);
      room.wordCooldowns.clear();
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:end-game", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      room.phase = "ended";
      room.announcement = "Game ended by host.";
      this.clearRoundTimer(room);
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:close-room", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket);
      if (!room) {
        callback({ ok: false, error: "Unauthorized or room not found." });
        return;
      }
      this.clearRoundTimer(room);
      this.rooms.delete(room.code);
      socket.leave(room.code);
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.flushPersist();
    });

    socket.on("player:guess-word", ({ code, playerId, word }, callback) => {
      const room = this.getRoom(code);
      if (!room || !["word-guess", "between-rounds"].includes(room.phase) || room.currentRoundIndex < 0) {
        callback({ ok: false, error: "Word guessing is not active." });
        return;
      }
      const player = room.players.get(playerId);
      if (!player) {
        callback({ ok: false, error: "Player not found." });
        return;
      }
      const normalizedWord = normalizeWordGuess(word);
      if (!normalizedWord) {
        callback({ ok: false, error: "Enter a word." });
        return;
      }

      const now = Date.now();
      const cooldownUntil = room.wordCooldowns.get(playerId) ?? 0;
      if (cooldownUntil > now) {
        callback({
          ok: false,
          error: `Hold up ${Math.ceil((cooldownUntil - now) / 1000)}s before another word.`,
          cooldownUntil,
        });
        return;
      }

      const result = this.applyWordGuess(room, player, normalizedWord, now);
      const nextCooldownUntil = result.accepted && result.points > 0 ? now + WORD_GUESS_COOLDOWN_MS : null;

      if (nextCooldownUntil) {
        room.wordCooldowns.set(playerId, nextCooldownUntil);
      }

      room.updatedAt = now;
      callback({
        ok: true,
        accepted: result.accepted,
        points: result.points,
        count: result.count,
        cooldownUntil: nextCooldownUntil,
      });
      this.broadcast(code);
    });

    socket.on("player:guess-song", ({ code, playerId, title }, callback) => {
      const room = this.getRoom(code);
      if (!room || !["word-guess", "between-rounds", "song-guess"].includes(room.phase) || room.currentRoundIndex < 0) {
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
      if (round.songGuesses.some((guess) => guess.playerId === playerId && guess.accepted)) {
        callback({ ok: false, error: "You already named this song." });
        return;
      }
      if (room.phase === "song-guess" && round.finalTitleAttempts.includes(playerId)) {
        callback({ ok: false, error: "Final title chance already used." });
        return;
      }

      const now = Date.now();
      const accepted = titlesMatch(normalizedTitle, round.title);
      const rank = accepted ? round.songGuesses.filter((guess) => guess.accepted).length + 1 : undefined;
      const points = accepted ? this.getSongGuessPoints(rank!, room.phase === "song-guess") : 0;
      if (accepted) {
        player.score += points;
      }
      if (room.phase === "song-guess") {
        round.finalTitleAttempts.push(playerId);
      }

      const entry: SongGuessEntry = {
        playerId,
        playerName: player.displayName,
        title: normalizedTitle,
        accepted,
        submittedAt: now,
        points,
        rank,
      };

      round.songGuesses.push(entry);

      if (accepted && !round.songSolvedAt && room.phase === "word-guess") {
        this.startFreeForAll(room, now);
      }

      room.updatedAt = now;
      callback({ ok: true, accepted, points, rank });
      this.broadcast(code);
    });

    socket.on("disconnect", () => {
      for (const room of this.rooms.values()) {
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

  private applyWordGuess(room: InternalRoom, player: Player, word: string, submittedAt: number) {
    const round = room.rounds[room.currentRoundIndex];
    if (!round) return { accepted: false, points: 0, count: 0 };

    const matchingBlankIndexes = round.tokens
      .filter((token) => token.type === "blank")
      .map((token) => token.index)
      .filter((index) => !round.revealedBlankIndices.includes(index))
      .filter((index) => normalizeWordGuess(round.answers[index] ?? "") === word);

    if (matchingBlankIndexes.length === 0) {
      room.recentWordGuesses.unshift({
        playerId: player.id,
        playerName: player.displayName,
        word,
        blankIndex: -1,
        accepted: false,
        points: 0,
        submittedAt,
      });
      room.recentWordGuesses = room.recentWordGuesses.slice(0, 12);
      return { accepted: false, points: 0, count: 0 };
    }

    const allMatchingBlankIndexes = round.tokens
      .filter((token) => token.type === "blank")
      .map((token) => token.index)
      .filter((index) => normalizeWordGuess(round.answers[index] ?? "") === word);
    const pointValues = getWordGuessPointValues(word, allMatchingBlankIndexes.length, this.getAutoRevealWords(room));
    let totalPoints = 0;

    matchingBlankIndexes.forEach((blankIndex) => {
      const occurrenceIndex = allMatchingBlankIndexes.indexOf(blankIndex);
      const points = pointValues[occurrenceIndex] ?? pointValues[0] ?? 0;
      totalPoints += points;
      round.revealedBlankIndices.push(blankIndex);
      room.recentWordGuesses.unshift({
        playerId: player.id,
        playerName: player.displayName,
        word,
        blankIndex,
        accepted: true,
        points,
        submittedAt,
      });
    });

    player.score += totalPoints;
    room.recentWordGuesses = room.recentWordGuesses.slice(0, 12);
    room.announcement =
      totalPoints > 0
        ? `${player.displayName} found ${word.toUpperCase()} for ${totalPoints} points!`
        : `${player.displayName} found ${word.toUpperCase()}.`;
    return { accepted: true, points: totalPoints, count: matchingBlankIndexes.length };
  }


  private getSongGuessPoints(rank: number, isFinalChance: boolean) {
    if (isFinalChance) return 75;
    if (rank === 1) return 500;
    if (rank === 2) return 350;
    if (rank === 3) return 250;
    return Math.max(100, 250 - (rank - 3) * 25);
  }

  private startFreeForAll(room: InternalRoom, now: number) {
    const round = room.rounds[room.currentRoundIndex];
    if (!round) return;

    this.clearRoundTimer(room);
    room.phase = "between-rounds";
    round.songSolvedAt = now;
    round.freeForAllEndsAt = now + FREE_FOR_ALL_MS;
    room.announcement = "Song named! Open word rush for 60 seconds.";

    room.roundTimer = setTimeout(() => {
      room.phase = "song-guess";
      round.freeForAllEndsAt = null;
      room.announcement = "Final title chance. Players who have not solved it get one guess.";
      room.updatedAt = Date.now();
      this.broadcast(room.code);
    }, FREE_FOR_ALL_MS);
  }

  private clearRoundTimer(room: InternalRoom) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
  }

  private rebuildTuningPreviewRound(room: InternalRoom) {
    const config = room.pendingRounds[room.tuningPreviewRoundIndex];
    if (!config) {
      room.tuningPreviewRound = null;
      return;
    }

    room.tuningPreviewRound = this.buildRoundState(config, this.getAutoRevealWords(room));
  }

  private getDisplayRound(room: InternalRoom) {
    if (room.autoRevealTuningActive && room.tuningPreviewRound) {
      return room.tuningPreviewRound;
    }

    if (room.currentRoundIndex >= 0) {
      return room.rounds[room.currentRoundIndex] ?? null;
    }

    return null;
  }

  private getDisplayRoundIndex(room: InternalRoom) {
    if (room.autoRevealTuningActive) {
      return room.tuningPreviewRoundIndex;
    }

    return room.currentRoundIndex;
  }

  private getDisplayTotalRounds(room: InternalRoom) {
    if (room.autoRevealTuningActive) {
      return room.pendingRounds.length;
    }

    return room.rounds.length;
  }

  private getAutoRevealWords(room: InternalRoom) {
    return room.autoRevealWords ?? INCREDIBLY_COMMON_WORDS;
  }

  private getAutoRevealedBlankIndices(template: string, answers: string[], autoRevealWords: Set<string>) {
    const parsed = attachAnswers(parseLyricTemplate(template), answers);
    return parsed.tokens
      .filter((token) => token.type === "blank")
      .map((token) => token.index)
      .filter((index) => autoRevealWords.has(normalizeWordGuess(parsed.answers[index] ?? "")));
  }

  private applyAutoRevealWords(room: InternalRoom) {
    const autoRevealWords = this.getAutoRevealWords(room);

    for (const round of room.rounds) {
      const autoIndices = this.getAutoRevealedBlankIndices(round.template, round.answers, autoRevealWords);
      round.autoRevealedBlankIndices = autoIndices;
      round.revealedBlankIndices = [...new Set([...round.revealedBlankIndices, ...autoIndices])];
    }
  }

  private buildRoundState(round: RoundConfig, autoRevealWords: Set<string>): RoundState {
    const parsed = attachAnswers(parseLyricTemplate(round.template), round.answers);
    const preRevealedBlankIndices = parsed.tokens
      .filter((token) => token.type === "blank")
      .map((token) => token.index)
      .filter((index) => autoRevealWords.has(normalizeWordGuess(parsed.answers[index] ?? "")));

    return {
      title: round.title,
      artist: round.artist,
      template: parsed.template,
      tokens: parsed.tokens,
      lines: parsed.lines,
      answers: parsed.answers,
      revealedBlankIndices: preRevealedBlankIndices,
      autoRevealedBlankIndices: preRevealedBlankIndices,
      songGuesses: [],
      songSolvedAt: null,
      freeForAllEndsAt: null,
      finalTitleAttempts: [],
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

  private requireHost(codeInput: string, hostToken: string, socket: Socket) {
    const room = this.getRoom(codeInput);
    if (!room || room.hostToken !== hostToken) {
      return undefined;
    }
    room.hostSocketId = socket.id;
    socket.join(room.code);
    return room;
  }

  private broadcast(code: string) {
    const room = this.getRoom(code);
    if (!room) return;
    this.io.to(code).emit("game:state", this.toPublicState(room));
    if (room.hostSocketId) {
      this.io.to(room.hostSocketId).emit("game:host-state", this.toHostState(room));
    }
    this.schedulePersist();
  }

  private toPublicState(room: InternalRoom): PublicGameState {
    const roundState = this.getDisplayRound(room);
    const currentRound = roundState
      ? {
          ...this.toPublicRound(roundState),
          title: roundState.title,
          artist: roundState.artist,
        }
      : null;

    return {
      code: room.code,
      phase: room.phase,
      players: Array.from(room.players.values()),
      announcement: room.announcement,
      currentRound,
      currentRoundIndex: this.getDisplayRoundIndex(room),
      totalRounds: this.getDisplayTotalRounds(room),
      phaseEndsAt: this.getPhaseEndsAt(room),
      recentWordGuesses: room.recentWordGuesses,
      roundHistory: [],
    };
  }

  private toHostState(room: InternalRoom): HostGameState {
    const roundState = this.getDisplayRound(room);
    const publicState = this.toPublicState(room);

    return {
      ...publicState,
      currentRound: roundState
        ? {
            ...this.toPublicRound(roundState),
            title: roundState.title,
            artist: roundState.artist,
          }
        : null,
      roundHistory: room.rounds.map(({ title, artist }) => ({ title, artist })),
      roundDraft: null,
      pendingRounds: room.pendingRounds,
      answerKey: roundState?.answers ?? [],
      autoRevealWords: room.autoRevealWords !== null ? [...room.autoRevealWords] : null,
      autoRevealTuningActive: room.autoRevealTuningActive,
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
            autoRevealed: round.autoRevealedBlankIndices.includes(token.index),
          };
        }),
      })),
      songGuesses: round.songGuesses,
    };
  }

  private getPhaseEndsAt(room: InternalRoom) {
    const round = room.currentRoundIndex >= 0 ? room.rounds[room.currentRoundIndex] : null;
    if (room.phase === "between-rounds") return round?.freeForAllEndsAt ?? null;
    return null;
  }

  private serializeRoom(room: InternalRoom): PersistedRoom {
    return {
      code: room.code,
      hostToken: room.hostToken,
      phase: room.phase,
      players: Array.from(room.players.values()),
      pendingRounds: room.pendingRounds,
      rounds: room.rounds,
      currentRoundIndex: room.currentRoundIndex,
      announcement: room.announcement,
      recentWordGuesses: room.recentWordGuesses,
      wordCooldowns: [...room.wordCooldowns.entries()],
      autoRevealWords: room.autoRevealWords !== null ? [...room.autoRevealWords] : null,
      autoRevealTuningActive: room.autoRevealTuningActive,
      tuningPreviewRoundIndex: room.tuningPreviewRoundIndex,
      tuningPreviewRound: room.tuningPreviewRound,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  private hydrateRoom(snapshot: PersistedRoom): InternalRoom {
    return {
      code: snapshot.code,
      hostSocketId: null,
      hostToken: snapshot.hostToken,
      phase: snapshot.phase,
      players: new Map(
        snapshot.players.map((player) => [player.id, { ...player, connected: false }]),
      ),
      socketToPlayer: new Map(),
      pendingRounds: snapshot.pendingRounds,
      rounds: snapshot.rounds,
      currentRoundIndex: snapshot.currentRoundIndex,
      announcement: snapshot.announcement,
      recentWordGuesses: snapshot.recentWordGuesses,
      roundTimer: null,
      wordCooldowns: new Map(snapshot.wordCooldowns),
      autoRevealWords:
        snapshot.autoRevealWords !== null ? new Set(snapshot.autoRevealWords) : null,
      autoRevealTuningActive: snapshot.autoRevealTuningActive,
      tuningPreviewRoundIndex: snapshot.tuningPreviewRoundIndex,
      tuningPreviewRound: snapshot.tuningPreviewRound,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    };
  }

  private restoreRoomTimers(room: InternalRoom) {
    if (room.phase !== "between-rounds" || room.currentRoundIndex < 0) return;

    const round = room.rounds[room.currentRoundIndex];
    if (!round?.freeForAllEndsAt) return;

    const remaining = round.freeForAllEndsAt - Date.now();
    if (remaining <= 0) {
      room.phase = "song-guess";
      round.freeForAllEndsAt = null;
      room.announcement = "Final title chance. Players who have not solved it get one guess.";
      return;
    }

    this.clearRoundTimer(room);
    room.roundTimer = setTimeout(() => {
      room.phase = "song-guess";
      round.freeForAllEndsAt = null;
      room.announcement = "Final title chance. Players who have not solved it get one guess.";
      room.updatedAt = Date.now();
      this.broadcast(room.code);
    }, remaining);
  }

  private schedulePersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPersist();
    }, 400);
  }

  flushPersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    return saveRoomSnapshot([...this.rooms.values()].map((room) => this.serializeRoom(room)));
  }
}

export function normalizeSongTitleForClient(value: string): string {
  return normalizeSongTitle(value);
}
