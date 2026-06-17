import fs from "fs";
import path from "path";
import type { HostGameState, Player, RoundConfig, RoundState, WordGuessEntry } from "../lib/types";

export interface PersistedRoom {
  code: string;
  hostToken: string;
  phase: HostGameState["phase"];
  players: Player[];
  pendingRounds: RoundConfig[];
  rounds: RoundState[];
  currentRoundIndex: number;
  announcement: string;
  recentWordGuesses: WordGuessEntry[];
  wordCooldowns: [string, number][];
  autoRevealWords: string[] | null;
  autoRevealTuningActive: boolean;
  tuningPreviewRoundIndex: number;
  tuningPreviewRound: RoundState | null;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_STORE_PATH = path.join(process.cwd(), ".data", "rooms.json");

function getStorePath(): string {
  return process.env.ROOM_STORE_PATH?.trim() || DEFAULT_STORE_PATH;
}

export function loadRoomSnapshot(): PersistedRoom[] {
  const storePath = getStorePath();
  try {
    if (!fs.existsSync(storePath)) return [];
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PersistedRoom[];
  } catch (error) {
    console.error("Failed to load room snapshot:", error);
    return [];
  }
}

export function saveRoomSnapshot(rooms: PersistedRoom[]): void {
  const storePath = getStorePath();
  try {
    const directory = path.dirname(storePath);
    fs.mkdirSync(directory, { recursive: true });

    const tempPath = `${storePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(rooms), "utf8");
    fs.renameSync(tempPath, storePath);
  } catch (error) {
    console.error(`Failed to save room snapshot to ${storePath}:`, error);
  }
}
