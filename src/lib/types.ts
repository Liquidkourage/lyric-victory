export type GamePhase =
  | "lobby"
  | "round-setup"
  | "word-guess"
  | "song-guess"
  | "between-rounds"
  | "ended";

export interface Player {
  id: string;
  displayName: string;
  connected: boolean;
}

export interface BlankToken {
  type: "blank";
  index: number;
  length: number;
}

export interface TextToken {
  type: "text";
  value: string;
}

export type LyricToken = BlankToken | TextToken;

export interface ParsedLyric {
  template: string;
  tokens: LyricToken[];
  answers: string[];
  lines: LyricToken[][];
}

export interface RoundConfig {
  title: string;
  artist: string;
  template: string;
  answers: string[];
}

export interface RoundState {
  title: string;
  artist: string;
  template: string;
  tokens: LyricToken[];
  lines: LyricToken[][];
  answers: string[];
  revealedBlankIndices: number[];
  songGuesses: SongGuessEntry[];
}

export interface BeatState {
  number: number;
  active: boolean;
  durationMs: number;
  endsAt: number | null;
}

export interface WordGuessEntry {
  playerId: string;
  playerName: string;
  word: string;
  blankIndex: number;
  beatNumber: number;
  accepted: boolean;
}

export interface SongGuessEntry {
  playerId: string;
  playerName: string;
  title: string;
  accepted: boolean;
  submittedAt: number;
}

export interface PublicGameState {
  code: string;
  phase: GamePhase;
  players: Player[];
  announcement: string;
  currentRound: PublicRoundState | null;
  currentRoundIndex: number;
  totalRounds: number;
  beat: BeatState;
  recentWordGuesses: WordGuessEntry[];
  roundHistory: { title: string; artist: string }[];
}

export interface PublicRoundState {
  title: string;
  artist: string;
  lines: PublicLine[];
  songGuesses: SongGuessEntry[];
}

export interface PublicLine {
  tokens: PublicToken[];
}

export type PublicToken =
  | { type: "text"; value: string }
  | { type: "blank"; index: number; length: number; revealed: boolean; answer?: string };

export interface HostGameState extends PublicGameState {
  roundDraft: RoundConfig | null;
  pendingRounds: RoundConfig[];
  answerKey: string[];
}

export interface SongSearchResult {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number | null;
}
