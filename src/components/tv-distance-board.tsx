"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildDistanceFlowTokens,
  buildLayoutParams,
  isPunctuationToken,
  isRenderableToken,
  pickBestDistanceLayout,
  toDebugInfo,
  type DistanceLayoutDebugInfo,
  type DistanceLayoutMeasurement,
  type DistanceLayoutParams,
} from "@/lib/tv-distance-layout";
import type { PublicLine, PublicToken } from "@/lib/types";

function DistanceHiddenChip({ length, dense }: { length: number; dense: boolean }) {
  return (
    <span
      className={`tv-distance-hidden${dense ? " tv-distance-hidden--dense" : ""}`}
      aria-label={`${length} letter blank`}
    >
      {length}
    </span>
  );
}

function DistanceRevealedWord({
  text,
  auto,
  playerReveal,
}: {
  text: string;
  auto: boolean;
  playerReveal: boolean;
}) {
  if (auto) {
    return (
      <span className="tv-distance-auto" aria-label="Pre-revealed word">
        {text}
      </span>
    );
  }

  return (
    <span
      className={`tv-distance-revealed${playerReveal ? " tv-distance-revealed--pop" : ""}`}
      aria-label="Revealed word"
    >
      {text}
    </span>
  );
}

function DistancePunctuation({ value, dense }: { value: string; dense: boolean }) {
  return (
    <span
      className={`tv-distance-punct${dense ? " tv-distance-punct--dense" : ""}`}
      aria-hidden
    >
      {value}
    </span>
  );
}

function renderFlowToken(token: PublicToken, key: string, dense: boolean) {
  if (token.type === "blank") {
    if (token.revealed && token.answer) {
      return (
        <DistanceRevealedWord
          key={key}
          text={token.answer}
          auto={Boolean(token.autoRevealed)}
          playerReveal={!token.autoRevealed}
        />
      );
    }
    return <DistanceHiddenChip key={key} length={token.length} dense={dense} />;
  }

  if (isPunctuationToken(token)) {
    return <DistancePunctuation key={key} value={token.value} dense={dense} />;
  }

  return (
    <span key={key} className="tv-distance-text">
      {token.value}
    </span>
  );
}

function applyLayoutStyles(
  flow: HTMLElement,
  params: DistanceLayoutParams,
  viewportHeight: number,
  viewportWidth: number,
) {
  flow.style.setProperty("--tvd-font", `${params.revealedFontSize}px`);
  flow.style.setProperty("--tvd-chip-font", `${params.chipFontSize}px`);
  flow.style.setProperty("--tvd-chip-height", `${params.chipHeight}px`);
  flow.style.setProperty("--tvd-word-gap", `${params.wordGap}px`);
  flow.style.setProperty("--tvd-row-gap", `${params.rowGap}px`);
  flow.style.setProperty("--tvd-column-gap", `${params.columnGap}px`);
  flow.style.columnGap = `${params.columnGap}px`;
  flow.style.columnCount = String(params.columnCount);
  flow.style.width = `${viewportWidth}px`;
  flow.style.height = `${viewportHeight}px`;
  flow.style.maxHeight = `${viewportHeight}px`;
  flow.dataset.dense = params.dense ? "true" : "false";
}

function measureContentExtent(flow: HTMLElement, viewportWidth: number) {
  const flowRect = flow.getBoundingClientRect();
  let contentRight = 0;
  let contentBottom = 0;

  for (const child of flow.children) {
    const rect = child.getBoundingClientRect();
    contentRight = Math.max(contentRight, rect.right - flowRect.left);
    contentBottom = Math.max(contentBottom, rect.bottom - flowRect.top);
  }

  return {
    contentScrollHeight: Math.max(flow.scrollHeight, contentBottom),
    contentScrollWidth: Math.min(Math.max(flow.scrollWidth, contentRight), viewportWidth),
  };
}

function measureLayout(
  flow: HTMLElement,
  params: DistanceLayoutParams,
  viewportHeight: number,
  viewportWidth: number,
): DistanceLayoutMeasurement {
  applyLayoutStyles(flow, params, viewportHeight, viewportWidth);

  const { contentScrollHeight, contentScrollWidth } = measureContentExtent(flow, viewportWidth);
  const overflowY = Math.max(0, contentScrollHeight - viewportHeight);
  const overflowX = Math.max(0, contentScrollWidth - viewportWidth);

  return {
    params,
    overflowX,
    overflowY,
    usedHeightRatio: viewportHeight > 0 ? Math.min(1, contentScrollHeight / viewportHeight) : 0,
    usedWidthRatio: viewportWidth > 0 ? Math.min(1, contentScrollWidth / viewportWidth) : 0,
    revealedFontSize: params.revealedFontSize,
    contentScrollHeight,
    contentScrollWidth,
    viewportHeight,
    viewportWidth,
  };
}

function LayoutDebugOverlay({ debug }: { debug: DistanceLayoutDebugInfo }) {
  return (
    <div className="tv-distance-debug pointer-events-none absolute right-2 top-2 z-20 font-mono text-xs leading-relaxed text-[#fde047]">
      <div>columns: {debug.columns}</div>
      <div>revealedFontSize: {debug.revealedFontSize}px</div>
      <div>content scrollHeight: {Math.round(debug.contentScrollHeight)}</div>
      <div>viewport height: {Math.round(debug.viewportHeight)}</div>
      <div>usedHeightRatio: {debug.usedHeightRatio.toFixed(3)}</div>
      <div>content scrollWidth: {Math.round(debug.contentScrollWidth)}</div>
      <div>viewport width: {Math.round(debug.viewportWidth)}</div>
      <div>usedWidthRatio: {debug.usedWidthRatio.toFixed(3)}</div>
      <div>overflowX: {Math.round(debug.overflowX)}</div>
      <div>overflowY: {Math.round(debug.overflowY)}</div>
    </div>
  );
}

export function DistanceLyricBoard({
  lines,
  showDebug = false,
}: {
  lines: PublicLine[];
  showDebug?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => buildDistanceFlowTokens(lines).filter(isRenderableToken), [lines]);
  const [layout, setLayout] = useState<DistanceLayoutParams>(() =>
    buildLayoutParams(36, 3, false),
  );
  const [debugInfo, setDebugInfo] = useState<DistanceLayoutDebugInfo | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const flow = flowRef.current;
    if (!container || !flow || tokens.length === 0) return;

    const runLayout = () => {
      const viewportHeight = container.clientHeight;
      const viewportWidth = container.clientWidth;
      if (viewportHeight <= 0 || viewportWidth <= 0) return;

      const { params: best, measurement } = pickBestDistanceLayout((params) =>
        measureLayout(flow, params, viewportHeight, viewportWidth),
      );

      flushSync(() => {
        setLayout(best);
        setDebugInfo(toDebugInfo(measurement));
      });

      applyLayoutStyles(flow, best, viewportHeight, viewportWidth);
    };

    runLayout();
    const observer = new ResizeObserver(runLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [lines, tokens.length]);

  if (tokens.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="tv-distance-board relative min-h-0 w-full flex-1 overflow-hidden">
      {showDebug && debugInfo ? <LayoutDebugOverlay debug={debugInfo} /> : null}
      <div
        ref={flowRef}
        className="tv-distance-flow"
        data-dense={layout.dense ? "true" : "false"}
        style={
          {
            "--tvd-font": `${layout.revealedFontSize}px`,
            "--tvd-chip-font": `${layout.chipFontSize}px`,
            "--tvd-chip-height": `${layout.chipHeight}px`,
            "--tvd-word-gap": `${layout.wordGap}px`,
            "--tvd-row-gap": `${layout.rowGap}px`,
            "--tvd-column-gap": `${layout.columnGap}px`,
            columnCount: layout.columnCount,
          } as React.CSSProperties
        }
      >
        {tokens.map((token, index) => renderFlowToken(token, `t-${index}`, layout.dense))}
      </div>
    </div>
  );
}
