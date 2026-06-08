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
const WORD_GUESS_COOLDOWN_MS = 2_500;
const FREE_FOR_ALL_MS = 60_000;

const COMMON_WORD_WEIGHTS = new Map<string, number>(
  [
    ["the", 0.35],
    ["be", 0.35],
    ["to", 0.35],
    ["of", 0.35],
    ["and", 0.35],
    ["a", 0.35],
    ["in", 0.35],
    ["that", 0.4],
    ["have", 0.4],
    ["i", 0.4],
    ["it", 0.4],
    ["for", 0.45],
    ["not", 0.45],
    ["on", 0.45],
    ["with", 0.45],
    ["he", 0.45],
    ["as", 0.45],
    ["you", 0.45],
    ["do", 0.45],
    ["at", 0.45],
    ["this", 0.5],
    ["but", 0.5],
    ["his", 0.5],
    ["by", 0.5],
    ["from", 0.5],
    ["they", 0.55],
    ["we", 0.55],
    ["say", 0.55],
    ["her", 0.55],
    ["she", 0.55],
    ["or", 0.55],
    ["an", 0.55],
    ["will", 0.55],
    ["my", 0.55],
    ["one", 0.6],
    ["all", 0.6],
    ["would", 0.6],
    ["there", 0.6],
    ["their", 0.6],
    ["what", 0.65],
    ["so", 0.65],
    ["up", 0.65],
    ["out", 0.65],
    ["if", 0.65],
    ["about", 0.7],
    ["who", 0.7],
    ["get", 0.7],
    ["which", 0.7],
    ["go", 0.7],
    ["me", 0.7],
    ["when", 0.75],
    ["make", 0.75],
    ["can", 0.75],
    ["like", 0.75],
    ["time", 0.75],
    ["no", 0.75],
    ["just", 0.8],
    ["him", 0.8],
    ["know", 0.8],
    ["take", 0.8],
    ["people", 0.85],
    ["into", 0.85],
    ["year", 0.85],
    ["your", 0.85],
    ["good", 0.9],
    ["some", 0.9],
    ["could", 0.9],
    ["them", 0.9],
    ["see", 0.9],
    ["other", 0.95],
    ["than", 0.95],
    ["then", 0.95],
    ["now", 0.95],
    ["look", 0.95],
    ["only", 1],
    ["come", 1],
    ["its", 1],
    ["over", 1],
    ["think", 1],
    ["also", 1],
    ["back", 1],
    ["after", 1.05],
    ["use", 1.05],
    ["two", 1.05],
    ["how", 1.05],
    ["our", 1.05],
    ["work", 1.1],
    ["first", 1.1],
    ["well", 1.1],
    ["way", 1.1],
    ["even", 1.1],
  ] as const,
);

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
  roundTimer: NodeJS.Timeout | null;
  pendingWordGuesses: Map<string, { playerId: string; word: string }>;
  wordCooldowns: Map<string, number>;
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
        roundTimer: null,
        pendingWordGuesses: new Map(),
        wordCooldowns: new Map(),
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
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room || room.currentRoundIndex < 0) {
        callback({ ok: false, error: "No active round." });
        return;
      }
      this.clearBeatTimer(room);
      this.clearRoundTimer(room);
      room.phase = "word-guess";
      room.beat = { number: 0, active: false, durationMs: BEAT_DURATION_MS, endsAt: null };
      room.recentWordGuesses = [];
      room.pendingWordGuesses.clear();
      room.wordCooldowns.clear();
      room.announcement = "Guess words now. Name the song any time.";
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
      room.announcement = "Word guessing is always live.";
      callback({ ok: true });
      this.broadcast(code);
    });

    socket.on("host:end-beat", ({ code, hostToken }, callback) => {
      const room = this.requireHost(code, hostToken, socket.id);
      if (!room || room.phase !== "word-guess") {
        callback({ ok: false, error: "Word phase is not active." });
        return;
      }
      room.announcement = "Word guesses resolve as soon as they arrive.";
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
      this.clearRoundTimer(room);
      room.phase = "song-guess";
      room.beat = { number: room.beat.number, active: false, durationMs: BEAT_DURATION_MS, endsAt: null };
      room.announcement = "Final title chance. Players who have not solved it get one guess.";
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
      this.clearRoundTimer(room);
      room.wordCooldowns.clear();
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
      this.clearRoundTimer(room);
      room.updatedAt = Date.now();
      callback({ ok: true });
      this.broadcast(code);
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
      if (room.phase === "word-guess" && cooldownUntil > now) {
        callback({
          ok: false,
          error: `Hold up ${Math.ceil((cooldownUntil - now) / 1000)}s before another word.`,
        });
        return;
      }

      if (room.phase === "word-guess") {
        room.wordCooldowns.set(playerId, now + WORD_GUESS_COOLDOWN_MS);
      }

      const result = this.applyWordGuess(room, player, normalizedWord, now);
      room.updatedAt = now;
      callback({ ok: true, accepted: result.accepted, points: result.points, count: result.count });
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
        beatNumber: 0,
        accepted: false,
        points: 0,
        submittedAt,
      });
      room.recentWordGuesses = room.recentWordGuesses.slice(0, 12);
      return { accepted: false, points: 0, count: 0 };
    }

    const totalAppearances = round.answers.filter((answer) => normalizeWordGuess(answer) === word).length;
    let totalPoints = 0;

    matchingBlankIndexes.forEach((blankIndex) => {
      const points = this.getWordGuessPoints(word, totalAppearances);
      totalPoints += points;
      round.revealedBlankIndices.push(blankIndex);
      room.recentWordGuesses.unshift({
        playerId: player.id,
        playerName: player.displayName,
        word,
        blankIndex,
        beatNumber: 0,
        accepted: true,
        points,
        submittedAt,
      });
    });

    player.score += totalPoints;
    room.recentWordGuesses = room.recentWordGuesses.slice(0, 12);
    room.announcement = `${player.displayName} found ${word.toUpperCase()} for ${totalPoints} points!`;
    return { accepted: true, points: totalPoints, count: matchingBlankIndexes.length };
  }

  private getWordGuessPoints(word: string, totalAppearances: number) {
    const frequencyWeight = COMMON_WORD_WEIGHTS.get(word) ?? Math.min(1.9, 1.05 + word.length * 0.08);
    const lengthWeight = Math.max(0.8, Math.min(1.6, word.length / 5));
    const repeatedWordDiscount = Math.sqrt(Math.max(1, totalAppearances));
    return Math.max(10, Math.round((36 * frequencyWeight * lengthWeight) / repeatedWordDiscount));
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

    this.clearBeatTimer(room);
    this.clearRoundTimer(room);
    room.phase = "between-rounds";
    room.beat = { number: room.beat.number, active: true, durationMs: FREE_FOR_ALL_MS, endsAt: now + FREE_FOR_ALL_MS };
    room.wordCooldowns.clear();
    round.songSolvedAt = now;
    round.freeForAllEndsAt = now + FREE_FOR_ALL_MS;
    room.announcement = "Song named! Open word rush for 60 seconds.";

    room.roundTimer = setTimeout(() => {
      room.phase = "song-guess";
      room.beat = { number: room.beat.number, active: false, durationMs: BEAT_DURATION_MS, endsAt: null };
      room.announcement = "Final title chance. Players who have not solved it get one guess.";
      room.updatedAt = Date.now();
      this.broadcast(room.code);
    }, FREE_FOR_ALL_MS);
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

  private clearRoundTimer(room: InternalRoom) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
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
      phaseEndsAt: this.getPhaseEndsAt(room),
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

  private getPhaseEndsAt(room: InternalRoom) {
    const round = room.currentRoundIndex >= 0 ? room.rounds[room.currentRoundIndex] : null;
    if (room.phase === "between-rounds") return round?.freeForAllEndsAt ?? null;
    return null;
  }

  private pruneRooms() {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of this.rooms.entries()) {
      if (room.updatedAt < cutoff) {
        this.clearBeatTimer(room);
        this.clearRoundTimer(room);
        this.rooms.delete(code);
      }
    }
  }
}

export function normalizeSongTitleForClient(value: string): string {
  return normalizeSongTitle(value);
}
