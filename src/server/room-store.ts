import fs from "fs";
import path from "path";
import Redis from "ioredis";
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
const REDIS_KEY = "lyric-victory:rooms:v1";

let resolvedStorePath: string | null = null;
let lastSaveAt: number | null = null;
let lastSaveError: string | null = null;
let redisClient: Redis | null = null;
let redisReady = false;
let storeBackend: "redis" | "file" = "file";

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!redisClient) {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 2,
    });
    redisClient.on("error", (error) => {
      console.error("[rooms] Redis error:", error.message);
      redisReady = false;
    });
    redisClient.on("connect", () => {
      redisReady = true;
      console.log("[rooms] Redis connected");
    });
  }
  return redisClient;
}

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

function parseSnapshot(raw: string): PersistedRoom[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed as PersistedRoom[];
}

function loadRoomSnapshotFromFile(): PersistedRoom[] {
  const storePath = getRoomStorePath();
  try {
    if (!fs.existsSync(storePath)) return [];
    return parseSnapshot(fs.readFileSync(storePath, "utf8"));
  } catch (error) {
    console.error(`Failed to load room snapshot from ${storePath}:`, error);
    return [];
  }
}

function saveRoomSnapshotToFile(rooms: PersistedRoom[]): void {
  const storePath = getRoomStorePath();
  const directory = path.dirname(storePath);
  fs.mkdirSync(directory, { recursive: true });

  const tempPath = `${storePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(rooms), "utf8");
  fs.renameSync(tempPath, storePath);
}

/** Load rooms from Redis (if configured) with file fallback. */
export async function loadRoomSnapshot(): Promise<PersistedRoom[]> {
  const fileRooms = loadRoomSnapshotFromFile();
  const redis = getRedis();

  if (!redis) {
    storeBackend = "file";
    console.log(`[rooms] loaded ${fileRooms.length} room(s) from ${getRoomStorePath()}`);
    return fileRooms;
  }

  try {
    const raw = await redis.get(REDIS_KEY);
    if (raw) {
      const redisRooms = parseSnapshot(raw);
      if (redisRooms.length > 0) {
        storeBackend = "redis";
        console.log(`[rooms] loaded ${redisRooms.length} room(s) from Redis`);
        return redisRooms;
      }
    }

    if (fileRooms.length > 0) {
      await redis.set(REDIS_KEY, JSON.stringify(fileRooms));
      storeBackend = "redis";
      console.log(`[rooms] migrated ${fileRooms.length} room(s) from file to Redis`);
      return fileRooms;
    }

    storeBackend = "redis";
    return [];
  } catch (error) {
    console.error("[rooms] Redis load failed, falling back to file:", error);
    storeBackend = "file";
    return fileRooms;
  }
}

/** Persist to file immediately and Redis when available. */
export async function saveRoomSnapshot(rooms: PersistedRoom[]): Promise<void> {
  try {
    saveRoomSnapshotToFile(rooms);
    lastSaveAt = Date.now();
    lastSaveError = null;
  } catch (error) {
    lastSaveError = error instanceof Error ? error.message : String(error);
    console.error(`Failed to save room snapshot to file:`, error);
  }

  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(REDIS_KEY, JSON.stringify(rooms));
    storeBackend = "redis";
    lastSaveAt = Date.now();
    lastSaveError = null;
  } catch (error) {
    lastSaveError = error instanceof Error ? error.message : String(error);
    console.error("[rooms] Redis save failed:", error);
  }
}

export function getRoomStoreStatus() {
  const storePath = getRoomStorePath();
  let fileExists = false;
  let fileRoomCount = 0;

  try {
    if (fs.existsSync(storePath)) {
      fileExists = true;
      fileRoomCount = loadRoomSnapshotFromFile().length;
    }
  } catch {
    // ignore
  }

  return {
    backend: storeBackend,
    redisConfigured: Boolean(process.env.REDIS_URL?.trim()),
    redisReady,
    storePath,
    fileExists,
    fileRoomCount,
    lastSaveAt,
    lastSaveError,
    persistenceHint:
      storeBackend === "redis"
        ? "Rooms survive deploys via Redis."
        : "Add Railway Redis (REDIS_URL) or a volume at /data so rooms survive deploys.",
  };
}
