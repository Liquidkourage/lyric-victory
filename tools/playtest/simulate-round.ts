import { readFileSync } from "node:fs";
import { join } from "node:path";
import { io, type Socket } from "socket.io-client";
import {
  BRING_ME_TO_LIFE,
  BRING_ME_TO_LIFE_GUESSES,
} from "./bring-me-to-life-lyrics";
import { plainLyricsToTemplate } from "../../src/lib/lyrics";
import { getBlankProgress } from "../../src/lib/round-progress";
import type { PublicGameState } from "../../src/lib/types";

const LOCAL_PORT = Number(process.env.PORT ?? 3000);

const PLAYERS = ["Alex", "Jordan", "Sam"] as const;

function loadPlaytestEnvFile() {
  try {
    const envPath = join(process.cwd(), ".env.playtest");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local config file.
  }
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    /^[\w.-]+\.(railway\.app|up\.railway\.app)(\/|$)/i.test(trimmed)
  );
}

function readCliUrl(): string | null {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === "--url" || arg === "-u") && args[index + 1]) {
      return args[index + 1];
    }
    if (arg.startsWith("--url=")) {
      return arg.slice("--url=".length);
    }
    if (arg.startsWith("--remote=") && arg.length > "--remote=".length) {
      return arg.slice("--remote=".length);
    }
  }

  for (const arg of args) {
    if (arg === "--remote" || arg === "--help" || arg === "-h" || arg.startsWith("-")) {
      continue;
    }
    if (looksLikeUrl(arg)) {
      return arg;
    }
  }

  return null;
}

function resolveBaseUrl(requireRemote: boolean): string {
  loadPlaytestEnvFile();

  const cliUrl = readCliUrl();
  if (cliUrl) return normalizeBaseUrl(cliUrl);

  if (process.env.PLAYTEST_URL) {
    return normalizeBaseUrl(process.env.PLAYTEST_URL);
  }

  if (requireRemote) {
    console.error("Remote playtest needs your Railway public URL.\n");
    console.error("Option A — one-off:");
    console.error("  npm run playtest:remote -- https://your-app.up.railway.app");
    console.error("  npm run playtest:remote -- --url https://your-app.up.railway.app\n");
    console.error("Option B — save it locally (gitignored):");
    console.error("  copy .env.playtest.example .env.playtest");
    console.error("  # edit PLAYTEST_URL, then run: npm run playtest:remote\n");
    console.error("Option C — env var:");
    console.error("  $env:PLAYTEST_URL=\"https://your-app.up.railway.app\"; npm run playtest:remote");
    process.exit(1);
  }

  return `http://localhost:${LOCAL_PORT}`;
}

function printUsage() {
  console.log(`Lyric Victory round playtest

Usage:
  npm run playtest:round
  npm run playtest:remote -- https://your-app.up.railway.app
  npm run playtest:remote -- --url https://your-app.up.railway.app

Options:
  --url, -u   Target server (local dev or Railway public URL)
  <url>       Bare URL also works (Windows/npm often drops --url)
  --remote    Require a remote URL (via flag, PLAYTEST_URL, or .env.playtest)
  --help, -h  Show this help

The script creates a room, joins three fake players, runs a scripted round,
and prints the display URL to open on a TV or browser.
`);
}

async function assertServerReachable(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status}) for ${baseUrl}`);
  }
  const body = (await response.json()) as { ok?: boolean; service?: string };
  if (!body.ok || body.service !== "lyric-victory") {
    throw new Error(`Unexpected health response from ${baseUrl}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stamp() {
  return new Date().toLocaleTimeString(undefined, { hour12: false });
}

function log(section: string, message: string) {
  console.log(`[${stamp()}] ${section.padEnd(10)} ${message}`);
}

function emit<T>(socket: Socket, event: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: T) => resolve(response));
  });
}

function connectSocket(baseUrl: string): Promise<Socket> {
  const socket = io(baseUrl, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function attachStateTracker(socket: Socket) {
  let latest: PublicGameState | null = null;
  socket.on("game:state", (state: PublicGameState) => {
    latest = state;
  });
  return {
    getLatest: () => latest,
  };
}

function waitForState(
  socket: Socket,
  predicate: (state: PublicGameState) => boolean,
  timeoutMs = 10_000,
  getLatest?: () => PublicGameState | null,
): Promise<PublicGameState> {
  const existing = getLatest?.();
  if (existing && predicate(existing)) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("game:state", onState);
      reject(new Error("Timed out waiting for game state"));
    }, timeoutMs);

    function onState(state: PublicGameState) {
      if (predicate(state)) {
        clearTimeout(timer);
        socket.off("game:state", onState);
        resolve(state);
      }
    }

    socket.on("game:state", onState);
  });
}

async function resyncDisplayState(socket: Socket, code: string) {
  const joined = await emit<{ ok: boolean; error?: string }>(socket, "display:join", { code });
  if (!joined.ok) {
    throw new Error(joined.error ?? "Display re-sync failed.");
  }
}

function describeDisplay(state: PublicGameState) {
  const progress = getBlankProgress(state.currentRound!.lines);
  const percent =
    progress.totalBlanks > 0
      ? Math.round((progress.revealedBlanks / progress.totalBlanks) * 100)
      : 0;

  const leader = [...state.players].sort((a, b) => b.score - a.score).find((p) => p.score > 0);
  const latest = state.recentWordGuesses[0];

  const hud = `HUD  Round ${state.currentRoundIndex + 1} · ${progress.revealedBlanks} revealed · ${progress.hiddenBlanks} hidden · ${percent}%`;
  const leaderLine = leader ? `     Leader: ${leader.displayName} — ${leader.score}` : "     Leader: —";
  const scoreLine =
    latest?.accepted && (latest.points ?? 0) > 0
      ? `     Score pop: ${latest.playerName} → ${latest.word} +${latest.points}`
      : latest
        ? `     Ticker: ${latest.playerName} → ${latest.word}${latest.accepted ? "" : " ✗"}`
        : "     Score pop: —";

  return `${hud}\n${leaderLine}\n${scoreLine}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const requireRemote = args.includes("--remote");
  const baseUrl = resolveBaseUrl(requireRemote);

  log("TARGET", baseUrl);
  await assertServerReachable(baseUrl);
  log("TARGET", "Health check ok");

  const hostSocket = await connectSocket(baseUrl);
  const displaySocket = await connectSocket(baseUrl);

  log("SETUP", "Creating room…");
  const { code, hostToken } = await new Promise<{ code: string; hostToken: string }>((resolve) => {
    hostSocket.emit("host:create-room", (response: { code: string; hostToken: string }) => resolve(response));
  });

  const displayUrl = `${baseUrl}/display/${code}`;
  log("SETUP", `Room ${code} ready`);
  log("DISPLAY", `Open ${displayUrl}`);

  const displayState = attachStateTracker(displaySocket);
  const joinedDisplay = await emit<{ ok: boolean; error?: string }>(displaySocket, "display:join", { code });
  if (!joinedDisplay.ok) {
    throw new Error(joinedDisplay.error ?? "Display failed to join room.");
  }

  const round = plainLyricsToTemplate(BRING_ME_TO_LIFE);
  await emit(hostSocket, "host:add-round", {
    code,
    hostToken,
    round: {
      title: "Bring Me to Life",
      artist: "Evanescence",
      template: round.template,
      answers: round.answers,
    },
  });
  log("HOST", `Added "Bring Me to Life" — ${round.answers.length} blanks`);

  const playerSockets = new Map<string, { socket: Socket; playerId: string }>();
  for (const name of PLAYERS) {
    const socket = await connectSocket(baseUrl);
    const joined = await emit<{ ok: boolean; playerId?: string; error?: string }>(socket, "player:join", {
      code,
      displayName: name,
    });
    if (!joined.ok || !joined.playerId) {
      throw new Error(joined.error ?? `Failed to join ${name}`);
    }
    playerSockets.set(name, { socket, playerId: joined.playerId });
    log("LOBBY", `${name} joined`);
  }

  await emit(hostSocket, "host:start-game", { code, hostToken });
  await emit(hostSocket, "host:start-word-phase", { code, hostToken });
  log("HOST", "Word phase live — lyric board on display");

  let currentState = await waitForState(
    displaySocket,
    (s) => s.phase === "word-guess" && Boolean(s.currentRound),
    10_000,
    displayState.getLatest,
  ).catch(async () => {
    log("DISPLAY", "Re-syncing display state…");
    await resyncDisplayState(displaySocket, code);
    return waitForState(
      displaySocket,
      (s) => s.phase === "word-guess" && Boolean(s.currentRound),
      10_000,
      displayState.getLatest,
    );
  });
  log("BOARD", `${currentState.currentRoundIndex + 1} · ${getBlankProgress(currentState.currentRound!.lines).hiddenBlanks} words still hidden`);

  await sleep(800);

  for (const step of BRING_ME_TO_LIFE_GUESSES) {
    await sleep(step.pauseMs);
    const player = playerSockets.get(step.player);
    if (!player) continue;

    const beforeCount = getBlankProgress(currentState.currentRound!.lines).revealedBlanks;

    const result = await emit<{
      ok: boolean;
      accepted?: boolean;
      points?: number;
      count?: number;
      error?: string;
    }>(player.socket, "player:guess-word", { code, playerId: player.playerId, word: step.word });

    if (!result.ok) {
      log("GUESS", `${step.player} → "${step.word}" BLOCKED (${result.error ?? "unknown"})`);
      continue;
    }

    const outcome =
      result.accepted && (result.points ?? 0) > 0
        ? `✓ +${result.points}${(result.count ?? 0) > 1 ? ` (×${result.count})` : ""}`
        : result.accepted
          ? "✓ (0 pts)"
          : "✗ miss";

    log("GUESS", `${step.player} → "${step.word}" ${outcome}${step.note ? ` — ${step.note}` : ""}`);

    try {
      const state = await waitForState(
        displaySocket,
        (s) =>
          s.recentWordGuesses[0]?.playerName === step.player &&
          s.recentWordGuesses[0]?.word === step.word.toLowerCase(),
        5000,
        displayState.getLatest,
      );
      currentState = state;
      log("DISPLAY", describeDisplay(state));

      const afterCount = getBlankProgress(state.currentRound!.lines).revealedBlanks;
      if (result.accepted && afterCount > beforeCount) {
        log("BOARD", `"${step.word}" revealed on lyric sheet`);
      }
    } catch {
      log("DISPLAY", "(state update lagged — check display in browser)");
    }
  }

  const final = await waitForState(
    displaySocket,
    (s) => Boolean(s.players.length),
    2000,
    displayState.getLatest,
  ).catch(() => currentState);
  const winner = [...final.players].sort((a, b) => b.score - a.score)[0];
  log("FINISH", `Standings: ${final.players.map((p) => `${p.displayName} ${p.score}`).join(" · ")}`);
  log("FINISH", `Leader: ${winner.displayName} (${winner.score} pts)`);
  log("DISPLAY", displayUrl);

  hostSocket.disconnect();
  displaySocket.disconnect();
  for (const { socket } of playerSockets.values()) socket.disconnect();
}

main().catch((error) => {
  console.error("Playtest simulation failed:", error);
  process.exit(1);
});
