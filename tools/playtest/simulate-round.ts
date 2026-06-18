import { readFileSync } from "node:fs";
import { join } from "node:path";
import { io, type Socket } from "socket.io-client";
import {
  BRING_ME_TO_LIFE,
  BRING_ME_TO_LIFE_GUESSES,
} from "./bring-me-to-life-lyrics";
import { plainLyricsToTemplate } from "../../src/lib/lyrics";
import { normalizeRoomCode } from "../../src/lib/room-code";
import { getBlankProgress } from "../../src/lib/round-progress";
import type { PublicGameState } from "../../src/lib/types";

const LOCAL_PORT = Number(process.env.PORT ?? 3000);
const DEFAULT_PRESET_WAIT_MS = 15_000;

interface PlaytestCliOptions {
  remote: boolean;
  url: string | null;
  code: string | null;
  waitMs: number;
}

function parsePlaytestArgs(): PlaytestCliOptions {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
  const positional: string[] = [];
  let remote = false;
  let url: string | null = null;
  let code: string | null = null;
  let waitSeconds: number | null = null;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]!;

    if (arg === "--remote") {
      remote = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      continue;
    }
    if (arg.startsWith("--remote=")) {
      remote = true;
      url = arg.slice("--remote=".length);
      continue;
    }
    if ((arg === "--url" || arg === "-u") && rawArgs[index + 1]) {
      url = rawArgs[index + 1]!;
      index += 1;
      continue;
    }
    if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
      continue;
    }
    if ((arg === "--code" || arg === "-c") && rawArgs[index + 1]) {
      code = normalizeRoomCode(rawArgs[index + 1]!);
      index += 1;
      continue;
    }
    if (arg.startsWith("--code=")) {
      code = normalizeRoomCode(arg.slice("--code=".length));
      continue;
    }
    if ((arg === "--wait" || arg === "-w") && rawArgs[index + 1]) {
      waitSeconds = Number(rawArgs[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--wait=")) {
      waitSeconds = Number(arg.slice("--wait=".length));
      continue;
    }
    if (/^--wait(\d+)$/i.test(arg)) {
      waitSeconds = Number(arg.replace(/^--wait/i, ""));
      continue;
    }

    positional.push(arg);
  }

  if (!url) {
    const urlIndex = positional.findIndex((arg) => looksLikeUrl(arg));
    if (urlIndex >= 0) {
      url = positional[urlIndex]!;
      positional.splice(urlIndex, 1);
    }
  }

  for (const arg of positional) {
    if (/^\d+$/.test(arg)) {
      if (waitSeconds === null || Number.isNaN(waitSeconds)) {
        waitSeconds = Number(arg);
      }
      continue;
    }

    if (/^[A-Z0-9]{4,12}$/i.test(arg) && !looksLikeUrl(arg) && !code) {
      code = normalizeRoomCode(arg);
    }
  }

  return {
    remote,
    url,
    code,
    waitMs: resolveWaitMs(waitSeconds, Boolean(code), remote),
  };
}

function resolveWaitMs(waitSeconds: number | null, hasPresetCode: boolean, remote: boolean): number {
  if (waitSeconds !== null && Number.isFinite(waitSeconds) && waitSeconds >= 0) {
    return Math.round(waitSeconds * 1000);
  }

  if (process.env.PLAYTEST_WAIT_MS) {
    const fromEnv = Number(process.env.PLAYTEST_WAIT_MS);
    if (Number.isFinite(fromEnv) && fromEnv >= 0) {
      return Math.round(fromEnv);
    }
  }

  if (hasPresetCode || remote) {
    return DEFAULT_PRESET_WAIT_MS;
  }

  return 0;
}

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

function readRequestedRoomCode(): string | null {
  if (process.env.PLAYTEST_CODE) {
    return normalizeRoomCode(process.env.PLAYTEST_CODE);
  }

  return null;
}

function resolveBaseUrl(requireRemote: boolean, cliUrl: string | null): string {
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
  --url, -u     Target server (local dev or Railway public URL)
  --code, -c    Preset room code (open /display/CODE before the round starts)
  --wait, -w    Seconds to wait after the room is created (default 15 for playtest:remote)
  --wait=15     Same, Windows-safe form
  <url>         Bare URL also works (Windows/npm often drops --url)
  TVTEST 15     Bare code + seconds also work when flags are stripped
  --remote      Require a remote URL (via flag, PLAYTEST_URL, or .env.playtest)
  --help, -h    Show this help

Preset display example:
  npm run playtest:remote -- https://your-app.up.railway.app TVTEST 15
  npm run playtest:remote -- https://your-app.up.railway.app --wait=15 --code=TVTEST

Or save PLAYTEST_CODE and PLAYTEST_WAIT_MS in .env.playtest.

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

async function waitWithCountdown(totalMs: number) {
  if (totalMs <= 0) return;

  const totalSeconds = Math.max(1, Math.round(totalMs / 1000));
  log("SETUP", `Waiting ${totalSeconds}s — open the display now`);

  for (let remaining = totalSeconds; remaining > 0; remaining -= 1) {
    if (remaining < totalSeconds) {
      log("SETUP", `Starting in ${remaining}s…`);
    }
    await sleep(1000);
  }
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

function createHostRoom(
  socket: Socket,
  requestedCode: string | null,
): Promise<{ code: string; hostToken: string }> {
  return new Promise((resolve, reject) => {
    const onResponse = (response: { code?: string; hostToken?: string; error?: string }) => {
      if (!response?.code || !response?.hostToken) {
        reject(new Error(response?.error ?? "Failed to create room."));
        return;
      }
      resolve({ code: response.code, hostToken: response.hostToken });
    };

    if (requestedCode) {
      socket.emit("host:create-room", { requestedCode }, onResponse);
    } else {
      socket.emit("host:create-room", onResponse);
    }
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

  loadPlaytestEnvFile();
  const cli = parsePlaytestArgs();
  const requestedCode = cli.code ?? readRequestedRoomCode();
  const presetWaitMs = cli.waitMs;
  const baseUrl = resolveBaseUrl(cli.remote, cli.url);

  log("TARGET", baseUrl);
  if (presetWaitMs > 0) {
    log("SETUP", `Display pause: ${Math.round(presetWaitMs / 1000)}s`);
  }

  if (requestedCode) {
    log("DISPLAY", `Preset room ${requestedCode}`);
    log("DISPLAY", `${baseUrl}/display/${requestedCode}`);
  }

  await assertServerReachable(baseUrl);
  log("TARGET", "Health check ok");

  const hostSocket = await connectSocket(baseUrl);
  const displaySocket = await connectSocket(baseUrl);

  log("SETUP", requestedCode ? `Creating room ${requestedCode}…` : "Creating room…");
  const { code, hostToken } = await createHostRoom(hostSocket, requestedCode);

  const displayUrl = `${baseUrl}/display/${code}`;
  log("SETUP", `Room ${code} ready`);

  if (presetWaitMs > 0) {
    await waitWithCountdown(presetWaitMs);
  } else if (!requestedCode) {
    log("DISPLAY", `Open ${displayUrl}`);
  }

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
