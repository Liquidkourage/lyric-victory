"use client";

import { useEffect, useMemo, useState } from "react";
import { CORPUS_STEMS_BY_RANK } from "@/lib/corpus-stems";
import {
  createEmptyTuningState,
  exportAutoRevealList,
  getAutoRevealWordsFromDecisions,
  getDecisionCounts,
  loadTuningState,
  saveTuningState,
  type AutoRevealDecision,
  type AutoRevealTuningState,
} from "@/lib/auto-reveal-tuning";
import { INCREDIBLY_COMMON_WORDS } from "@/lib/common-words";
import { buildPreviewLines } from "@/lib/round-preview";
import type { RoundConfig } from "@/lib/types";
import { LyricBoard, PrimaryButton, SecondaryButton } from "@/components/game-ui";

const DEFAULT_WALK_LIMIT = 500;

type AutoRevealTunerProps = {
  pendingRounds: RoundConfig[];
  roomAutoRevealWords: string[] | null;
  onApply: (words: string[]) => Promise<{ ok: boolean; error?: string }>;
  onClear: () => Promise<{ ok: boolean; error?: string }>;
};

export function AutoRevealTuner({
  pendingRounds,
  roomAutoRevealWords,
  onApply,
  onClear,
}: AutoRevealTunerProps) {
  const [tuning, setTuning] = useState<AutoRevealTuningState>(createEmptyTuningState);
  const [previewRoundIndex, setPreviewRoundIndex] = useState(0);
  const [walkLimit, setWalkLimit] = useState(DEFAULT_WALK_LIMIT);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTuning(loadTuningState());
  }, []);

  useEffect(() => {
    saveTuningState(tuning);
  }, [tuning]);

  const currentStem = CORPUS_STEMS_BY_RANK[tuning.cursorRank - 1] ?? null;
  const currentDecision = currentStem ? tuning.decisions[currentStem.stem] : undefined;
  const autoRevealWords = useMemo(
    () => getAutoRevealWordsFromDecisions(tuning.decisions),
    [tuning.decisions],
  );
  const counts = useMemo(() => getDecisionCounts(tuning.decisions), [tuning.decisions]);

  const previewRound = pendingRounds[previewRoundIndex] ?? pendingRounds[0] ?? null;
  const previewLines = useMemo(
    () => (previewRound ? buildPreviewLines(previewRound, autoRevealWords) : []),
    [previewRound, autoRevealWords],
  );

  const decide = (decision: AutoRevealDecision) => {
    if (!currentStem) return;

    setTuning((previous) => ({
      decisions: { ...previous.decisions, [currentStem.stem]: decision },
      cursorRank: Math.min(previous.cursorRank + 1, walkLimit, CORPUS_STEMS_BY_RANK.length),
    }));
  };

  const goBack = () => {
    setTuning((previous) => ({
      ...previous,
      cursorRank: Math.max(1, previous.cursorRank - 1),
    }));
  };

  const resetWalk = () => {
    setTuning(createEmptyTuningState());
    setStatus(null);
  };

  const seedFromBuiltIn = () => {
    const decisions: Record<string, AutoRevealDecision> = {};
    for (const word of INCREDIBLY_COMMON_WORDS) {
      decisions[word] = "reveal";
    }
    setTuning({ decisions, cursorRank: 1 });
    setStatus("Loaded current built-in auto-reveal list as a starting point.");
  };

  const copyExport = async () => {
    const exported = exportAutoRevealList(tuning.decisions);
    await navigator.clipboard.writeText(exported.typescript);
    setStatus(`Copied ${exported.autoReveal.length} auto-reveal words as TypeScript.`);
  };

  const applyToRoom = async () => {
    setBusy(true);
    setStatus(null);
    const result = await onApply([...autoRevealWords]);
    setBusy(false);
    setStatus(result.ok ? `Applied ${autoRevealWords.size} auto-reveal words to this room.` : result.error ?? "Apply failed.");
  };

  const clearRoomOverride = async () => {
    setBusy(true);
    setStatus(null);
    const result = await onClear();
    setBusy(false);
    setStatus(result.ok ? "Room reverted to built-in auto-reveal rules." : result.error ?? "Clear failed.");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#c4b5a0]">
        Walk the lyric corpus from rank #1. Mark each word as auto-reveal or playable. Your choices
        build the list and update the preview below.
      </p>

      <div className="rounded-2xl bg-[#17120b] px-4 py-4 ring-1 ring-ink/20">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink">
            Rank {tuning.cursorRank} of {Math.min(walkLimit, CORPUS_STEMS_BY_RANK.length)}
          </p>
          <p className="text-xs text-[#8a7d6b]">
            {counts.reveal} reveal · {counts.playable} playable
          </p>
        </div>

        {currentStem ? (
          <div className="mb-4">
            <p className="font-display text-4xl font-bold text-[#f4ede3]">{currentStem.stem}</p>
            <p className="mt-1 text-sm text-[#8a7d6b]">
              corpus rank #{currentStem.rank}
              {currentDecision ? ` · marked ${currentDecision}` : " · not decided yet"}
            </p>
          </div>
        ) : (
          <p className="mb-4 text-sm text-[#c4b5a0]">Walk complete for the current limit.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => decide("reveal")} disabled={!currentStem}>
            Auto-reveal
          </PrimaryButton>
          <SecondaryButton onClick={() => decide("playable")} disabled={!currentStem}>
            Keep playable
          </SecondaryButton>
          <SecondaryButton onClick={goBack} disabled={tuning.cursorRank <= 1}>
            Back
          </SecondaryButton>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#8a7d6b]">
          <label className="flex items-center gap-2">
            Walk limit
            <input
              type="number"
              min={10}
              max={CORPUS_STEMS_BY_RANK.length}
              value={walkLimit}
              onChange={(event) => setWalkLimit(Math.max(10, Number(event.target.value) || DEFAULT_WALK_LIMIT))}
              className="input-dark w-24 rounded-xl px-3 py-1.5 text-sm"
            />
          </label>
          <SecondaryButton onClick={seedFromBuiltIn}>Seed from built-in</SecondaryButton>
          <SecondaryButton onClick={resetWalk}>Reset walk</SecondaryButton>
        </div>
      </div>

      <div className="rounded-2xl bg-surface-muted px-4 py-4 ring-1 ring-ink/15">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#f4ede3]">Lyric preview</p>
          {pendingRounds.length > 1 ? (
            <select
              value={previewRoundIndex}
              onChange={(event) => setPreviewRoundIndex(Number(event.target.value))}
              className="input-dark rounded-xl px-3 py-1.5 text-sm"
            >
              {pendingRounds.map((round, index) => (
                <option key={`${round.title}-${index}`} value={index}>
                  {round.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {previewRound ? (
          <>
            <p className="mb-3 text-sm text-[#8a7d6b]">
              {previewRound.title} · {previewRound.artist}
            </p>
            <div className="max-h-80 overflow-y-auto rounded-xl bg-[#17120b] p-4 ring-1 ring-ink/10">
              <LyricBoard lines={previewLines} size="sm" />
            </div>
          </>
        ) : (
          <p className="text-sm text-[#8a7d6b]">Queue a song to preview how reveals look on real lyrics.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={applyToRoom} disabled={busy || autoRevealWords.size === 0}>
          Apply to room
        </PrimaryButton>
        <SecondaryButton onClick={clearRoomOverride} disabled={busy || !roomAutoRevealWords}>
          Use built-in rules
        </SecondaryButton>
        <SecondaryButton onClick={copyExport} disabled={autoRevealWords.size === 0}>
          Copy as TypeScript
        </SecondaryButton>
      </div>

      {roomAutoRevealWords ? (
        <p className="text-xs text-ink">
          Room override active: {roomAutoRevealWords.length} auto-reveal words.
        </p>
      ) : (
        <p className="text-xs text-[#8a7d6b]">Room is using built-in auto-reveal rules.</p>
      )}

      {status ? <p className="text-sm text-[#c4b5a0]">{status}</p> : null}
    </div>
  );
}
