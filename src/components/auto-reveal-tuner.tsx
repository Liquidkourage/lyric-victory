"use client";

import { useEffect, useMemo, useState } from "react";
import { CORPUS_STEMS_BY_RANK } from "@/lib/corpus-stems";
import {
  createEmptyTuningState,
  exportAutoRevealList,
  getAutoRevealWordsFromDecisions,
  getDecisionCounts,
  saveTuningState,
  type AutoRevealDecision,
  type AutoRevealTuningState,
} from "@/lib/auto-reveal-tuning";
import { buildPreviewLines } from "@/lib/round-preview";
import type { RoundConfig } from "@/lib/types";
import { LyricBoard, PrimaryButton, SecondaryButton } from "@/components/game-ui";

const DEFAULT_WALK_LIMIT = 500;

type AutoRevealTunerProps = {
  pendingRounds: RoundConfig[];
  roomAutoRevealWords: string[] | null;
  tuningActive: boolean;
  onStartPreview: (roundIndex: number, resetWords?: boolean) => Promise<{ ok: boolean; error?: string }>;
  onStopPreview: () => Promise<{ ok: boolean; error?: string }>;
  onApply: (words: string[]) => Promise<{ ok: boolean; error?: string }>;
};

export function AutoRevealTuner({
  pendingRounds,
  roomAutoRevealWords,
  tuningActive,
  onStartPreview,
  onStopPreview,
  onApply,
}: AutoRevealTunerProps) {
  const [tuning, setTuning] = useState<AutoRevealTuningState>(createEmptyTuningState);
  const [previewRoundIndex, setPreviewRoundIndex] = useState(0);
  const [walkLimit, setWalkLimit] = useState(DEFAULT_WALK_LIMIT);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

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

  const pushWordsToRoom = async (words: string[]) => {
    const result = await onApply(words);
    if (!result.ok) {
      setStatus(result.error ?? "Could not update the TV board.");
    }
    return result.ok;
  };

  const startSession = async () => {
    if (!previewRound) {
      setStatus("Queue a song first, then start a tuning session.");
      return;
    }

    setBusy(true);
    setStatus(null);
    setTuning(createEmptyTuningState());
    const previewResult = await onStartPreview(previewRoundIndex, true);
    setBusy(false);

    if (!previewResult.ok) {
      setStatus(previewResult.error ?? "Could not start TV preview.");
      return;
    }

    setSessionActive(true);
    setStatus("TV preview live — all words hidden. Mark each corpus word to build the list.");
  };

  const stopSession = async () => {
    setBusy(true);
    const result = await onStopPreview();
    setBusy(false);
    setSessionActive(false);
    setStatus(result.ok ? "TV preview stopped." : result.error ?? "Could not stop TV preview.");
  };

  const decide = async (decision: AutoRevealDecision) => {
    if (!currentStem || !sessionActive) return;

    const nextDecisions = { ...tuning.decisions, [currentStem.stem]: decision };
    const nextWords = [...getAutoRevealWordsFromDecisions(nextDecisions)];

    setTuning((previous) => ({
      decisions: nextDecisions,
      cursorRank: Math.min(previous.cursorRank + 1, walkLimit, CORPUS_STEMS_BY_RANK.length),
    }));

    setBusy(true);
    await pushWordsToRoom(nextWords);
    setBusy(false);
  };

  const goBack = () => {
    setTuning((previous) => ({
      ...previous,
      cursorRank: Math.max(1, previous.cursorRank - 1),
    }));
  };

  const changePreviewRound = async (index: number) => {
    setPreviewRoundIndex(index);
    if (!sessionActive) return;

    setBusy(true);
    await onStartPreview(index, false);
    setBusy(false);
  };

  const copyExport = async () => {
    const exported = exportAutoRevealList(tuning.decisions);
    await navigator.clipboard.writeText(exported.typescript);
    setStatus(`Copied ${exported.autoReveal.length} auto-reveal words as TypeScript.`);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#c4b5a0]">
        Start a session with every word hidden on the TV board, then walk the corpus from rank #1.
        Each choice updates the public display immediately.
      </p>

      <div className="flex flex-wrap gap-2">
        {!sessionActive ? (
          <PrimaryButton onClick={startSession} disabled={busy || !previewRound}>
            Start session (all hidden)
          </PrimaryButton>
        ) : (
          <SecondaryButton onClick={stopSession} disabled={busy}>
            Stop TV preview
          </SecondaryButton>
        )}
        <SecondaryButton onClick={copyExport} disabled={autoRevealWords.size === 0}>
          Copy as TypeScript
        </SecondaryButton>
      </div>

      {tuningActive ? (
        <p className="text-xs font-semibold uppercase tracking-widest text-ink">
          TV preview active · {roomAutoRevealWords?.length ?? 0} auto-reveal words on board
        </p>
      ) : null}

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
          <PrimaryButton onClick={() => decide("reveal")} disabled={!currentStem || !sessionActive || busy}>
            Auto-reveal
          </PrimaryButton>
          <SecondaryButton onClick={() => decide("playable")} disabled={!currentStem || !sessionActive || busy}>
            Keep playable
          </SecondaryButton>
          <SecondaryButton onClick={goBack} disabled={tuning.cursorRank <= 1 || !sessionActive}>
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
              disabled={!sessionActive}
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl bg-surface-muted px-4 py-4 ring-1 ring-ink/15">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#f4ede3]">Host preview</p>
          {pendingRounds.length > 0 ? (
            <select
              value={previewRoundIndex}
              onChange={(event) => void changePreviewRound(Number(event.target.value))}
              className="input-dark rounded-xl px-3 py-1.5 text-sm"
              disabled={pendingRounds.length <= 1}
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
          <p className="text-sm text-[#8a7d6b]">Queue a song, then start a session to mirror it on the TV.</p>
        )}
      </div>

      {status ? <p className="text-sm text-[#c4b5a0]">{status}</p> : null}
    </div>
  );
}
