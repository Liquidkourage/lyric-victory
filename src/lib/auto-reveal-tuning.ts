export type AutoRevealDecision = "reveal" | "playable";

export type AutoRevealTuningState = {
  decisions: Record<string, AutoRevealDecision>;
  cursorRank: number;
};

const STORAGE_KEY = "lv-auto-reveal-tuning";

export function createEmptyTuningState(): AutoRevealTuningState {
  return { decisions: {}, cursorRank: 1 };
}

export function loadTuningState(): AutoRevealTuningState {
  if (typeof window === "undefined") {
    return createEmptyTuningState();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyTuningState();
    const parsed = JSON.parse(raw) as AutoRevealTuningState;
    if (!parsed || typeof parsed !== "object" || !parsed.decisions) {
      return createEmptyTuningState();
    }
    return {
      decisions: parsed.decisions,
      cursorRank: Number.isFinite(parsed.cursorRank) && parsed.cursorRank >= 1 ? parsed.cursorRank : 1,
    };
  } catch {
    return createEmptyTuningState();
  }
}

export function saveTuningState(state: AutoRevealTuningState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getAutoRevealWordsFromDecisions(decisions: Record<string, AutoRevealDecision>) {
  return new Set(
    Object.entries(decisions)
      .filter(([, decision]) => decision === "reveal")
      .map(([stem]) => stem),
  );
}

export function getDecisionCounts(decisions: Record<string, AutoRevealDecision>) {
  let reveal = 0;
  let playable = 0;

  for (const decision of Object.values(decisions)) {
    if (decision === "reveal") reveal += 1;
    if (decision === "playable") playable += 1;
  }

  return { reveal, playable, decided: reveal + playable };
}

export function exportAutoRevealList(decisions: Record<string, AutoRevealDecision>) {
  const autoReveal = Object.entries(decisions)
    .filter(([, decision]) => decision === "reveal")
    .map(([stem]) => stem)
    .sort();

  return {
    autoReveal,
    json: JSON.stringify({ autoReveal }, null, 2),
    typescript: `export const AUTO_REVEAL_WORDS = new Set([\n${autoReveal.map((word) => `  "${word}",`).join("\n")}\n]);\n`,
  };
}
