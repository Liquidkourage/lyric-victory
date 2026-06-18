import fs from "fs";
import path from "path";
import { Pool } from "pg";
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
let storeBackend: "postgres" | "file" = "file";
let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

function getPool(): Pool | null {
  const url = getDatabaseUrl();
  if (!url) return null;

  if (!pool) {
    const useSsl =
      process.env.PGSSL_DISABLE !== "true" &&
      !url.includes("localhost") &&
      !url.includes("127.0.0.1");

    pool = new Pool({
      connectionString: url,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    pool.on("error", (error) => {
      console.error("[rooms] Postgres pool error:", error.message);
    });
  }

  return pool;
}

async function ensureSchema(): Promise<void> {
  const db = getPool();
  if (!db) return;

  if (!schemaReady) {
    schemaReady = db
      .query(`
        CREATE TABLE IF NOT EXISTS game_rooms (
          code TEXT PRIMARY KEY,
          state JSONB NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `)
      .then(() => undefined);
  }

  await schemaReady;
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

async function loadFromPostgres(): Promise<PersistedRoom[]> {
  const db = getPool();
  if (!db) return [];

  await ensureSchema();
  const result = await db.query<{ state: PersistedRoom }>(
    "SELECT state FROM game_rooms ORDER BY updated_at ASC",
  );
  return result.rows.map((row) => row.state);
}

async function saveToPostgres(rooms: PersistedRoom[]): Promise<void> {
  const db = getPool();
  if (!db) return;

  await ensureSchema();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (rooms.length === 0) {
      await client.query("DELETE FROM game_rooms");
    } else {
      const codes = rooms.map((room) => room.code);
      await client.query("DELETE FROM game_rooms WHERE NOT (code = ANY($1::text[]))", [codes]);

      for (const room of rooms) {
        await client.query(
          `INSERT INTO game_rooms (code, state, updated_at)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (code) DO UPDATE
           SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
          [room.code, JSON.stringify(room), room.updatedAt],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Load rooms from Postgres when configured, otherwise from local file. */
export async function loadRoomSnapshot(): Promise<PersistedRoom[]> {
  const fileRooms = loadRoomSnapshotFromFile();
  const db = getPool();

  if (!db) {
    storeBackend = "file";
    console.log(`[rooms] loaded ${fileRooms.length} room(s) from ${getRoomStorePath()}`);
    return fileRooms;
  }

  try {
    let postgresRooms = await loadFromPostgres();

    if (postgresRooms.length === 0 && fileRooms.length > 0) {
      await saveToPostgres(fileRooms);
      postgresRooms = fileRooms;
      console.log(`[rooms] migrated ${fileRooms.length} room(s) from file to Postgres`);
    }

    storeBackend = "postgres";
    console.log(`[rooms] loaded ${postgresRooms.length} room(s) from Postgres`);
    return postgresRooms;
  } catch (error) {
    console.error("[rooms] Postgres load failed, falling back to file:", error);
    storeBackend = "file";
    return fileRooms;
  }
}

/** Persist to Postgres when configured, always mirror to local file as backup. */
export async function saveRoomSnapshot(rooms: PersistedRoom[]): Promise<void> {
  try {
    saveRoomSnapshotToFile(rooms);
    lastSaveAt = Date.now();
    lastSaveError = null;
  } catch (error) {
    lastSaveError = error instanceof Error ? error.message : String(error);
    console.error("Failed to save room snapshot to file:", error);
  }

  const db = getPool();
  if (!db) return;

  try {
    await saveToPostgres(rooms);
    storeBackend = "postgres";
    lastSaveAt = Date.now();
    lastSaveError = null;
  } catch (error) {
    lastSaveError = error instanceof Error ? error.message : String(error);
    console.error("[rooms] Postgres save failed:", error);
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
    postgresConfigured: Boolean(getDatabaseUrl()),
    storePath,
    fileExists,
    fileRoomCount,
    lastSaveAt,
    lastSaveError,
    persistenceHint:
      storeBackend === "postgres"
        ? "Rooms survive deploys via Postgres."
        : "Add Railway Postgres (DATABASE_URL) so rooms survive deploys.",
  };
}
