import { io, type Socket } from "socket.io-client";
import { plainLyricsToTemplate } from "../../src/lib/lyrics";
import { getBlankProgress } from "../../src/lib/round-progress";
import type { PublicGameState } from "../../src/lib/types";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYTEST_URL ?? `http://localhost:${PORT}`;

const SAMPLE_LYRICS = `Is this the real life
Is this just fantasy
Caught in a landslide
No escape from reality
Open your eyes
Look up to the skies and see`;

type GuessScript = {
  player: string;
  word: string;
  pauseMs: number;
  note?: string;
};

const PLAYERS = ["Alex", "Jordan", "Sam"] as const;

const GUESS_SCRIPT: GuessScript[] = [
  { player: "Alex", word: "real", pauseMs: 1500 },
  { player: "Jordan", word: "fantasy", pauseMs: 1200 },
  { player: "Sam", word: "moon", pauseMs: 1000, note: "wrong guess" },
  { player: "Sam", word: "escape", pauseMs: 800 },
  { player: "Jordan", word: "landslide", pauseMs: 8500 },
  { player: "Alex", word: "reality", pauseMs: 9000 },
  { player: "Sam", word: "eyes", pauseMs: 11000 },
  { player: "Jordan", word: "open", pauseMs: 1000 },
  { player: "Alex", word: "skies", pauseMs: 11000 },
  { player: "Jordan", word: "see", pauseMs: 1000 },
];

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

function connectSocket(): Promise<Socket> {
  const socket = io(BASE_URL, { transports: ["websocket"], autoConnect: true });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function waitForState(
  socket: Socket,
  predicate: (state: PublicGameState) => boolean,
  timeoutMs = 3000,
): Promise<PublicGameState> {
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
  const hostSocket = await connectSocket();
  const displaySocket = await connectSocket();

  log("SETUP", "Creating room…");
  const { code, hostToken } = await new Promise<{ code: string; hostToken: string }>((resolve) => {
    hostSocket.emit("host:create-room", (response: { code: string; hostToken: string }) => resolve(response));
  });

  const displayUrl = `${BASE_URL}/display/${code}`;
  log("SETUP", `Room ${code} ready`);
  log("DISPLAY", `Open ${displayUrl}`);

  await emit(displaySocket, "display:join", { code });

  const round = plainLyricsToTemplate(SAMPLE_LYRICS);
  await emit(hostSocket, "host:add-round", {
    code,
    hostToken,
    round: {
      title: "Bohemian Rhapsody",
      artist: "Queen",
      template: round.template,
      answers: round.answers,
    },
  });
  log("HOST", `Added "Bohemian Rhapsody" — ${round.answers.length} blanks`);

  const playerSockets = new Map<string, { socket: Socket; playerId: string }>();
  for (const name of PLAYERS) {
    const socket = await connectSocket();
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

  let currentState = await waitForState(displaySocket, (s) => s.phase === "word-guess" && Boolean(s.currentRound));
  log("BOARD", `${currentState.currentRoundIndex + 1} · ${getBlankProgress(currentState.currentRound!.lines).hiddenBlanks} words still hidden`);

  await sleep(800);

  for (const step of GUESS_SCRIPT) {
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
        2000,
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

  const final = await waitForState(displaySocket, (s) => Boolean(s.players.length), 1000).catch(() => currentState);
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
