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

const LOCAL_STORE_PATH = path.join(process.cwd(), ".data", "rooms.json");

let resolvedStorePath: string | null = null;
let lastSaveAt: number | null = null;
let lastSaveError: string | null = null;

function canWriteDirectory(directory: string): boolean {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, `.lv-write-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/** Prefer ROOM_STORE_PATH, then /data on Railway volumes, then local .data fallback. */
export function getRoomStorePath(): string {
  if (resolvedStorePath) return resolvedStorePath;

  const configured = process.env.ROOM_STORE_PATH?.trim();
  const candidates = [configured, "/data/rooms.json", LOCAL_STORE_PATH].filter(
    (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
  );

  for (const candidate of candidates) {
    if (canWriteDirectory(path.dirname(candidate))) {
      resolvedStorePath = candidate;
      return candidate;
    }
  }

  resolvedStorePath = LOCAL_STORE_PATH;
  return resolvedStorePath;
}

export function getRoomStoreStatus() {
  const storePath = getRoomStorePath();
  let fileExists = false;
  let roomCount = 0;

  try {
    if (fs.existsSync(storePath)) {
      fileExists = true;
      const raw = fs.readFileSync(storePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) roomCount = parsed.length;
    }
  } catch {
    // ignore read errors in status probe
  }

  return {
    storePath,
    fileExists,
    fileRoomCount: roomCount,
    lastSaveAt,
    lastSaveError,
    needsRailwayVolume: storePath.startsWith("/data/"),
  };
}

export function loadRoomSnapshot(): PersistedRoom[] {
  const storePath = getRoomStorePath();
  try {
    if (!fs.existsSync(storePath)) return [];
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PersistedRoom[];
  } catch (error) {
    console.error(`Failed to load room snapshot from ${storePath}:`, error);
    return [];
  }
}

export function saveRoomSnapshot(rooms: PersistedRoom[]): void {
  const storePath = getRoomStorePath();
  try {
    const directory = path.dirname(storePath);
    fs.mkdirSync(directory, { recursive: true });

    const tempPath = `${storePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(rooms), "utf8");
    fs.renameSync(tempPath, storePath);
    lastSaveAt = Date.now();
    lastSaveError = null;
  } catch (error) {
    lastSaveError = error instanceof Error ? error.message : String(error);
    console.error(`Failed to save room snapshot to ${storePath}:`, error);
  }
}
