"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildDistanceFlowTokens,
  buildLayoutParams,
  isPunctuationToken,
  isRenderableToken,
  pickBestDistanceLayout,
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

function applyLayoutStyles(element: HTMLElement, params: DistanceLayoutParams, maxHeight: number) {
  element.style.setProperty("--tvd-font", `${params.revealedFontSize}px`);
  element.style.setProperty("--tvd-chip-font", `${params.chipFontSize}px`);
  element.style.setProperty("--tvd-chip-height", `${params.chipHeight}px`);
  element.style.setProperty("--tvd-word-gap", `${params.wordGap}px`);
  element.style.setProperty("--tvd-column-gap", `${params.columnGap}px`);
  element.style.columnGap = `${params.columnGap}px`;
  element.style.columnCount = String(params.columnCount);
  element.style.maxHeight = `${maxHeight}px`;
  element.dataset.dense = params.dense ? "true" : "false";
}

function measureContentBounds(flow: HTMLElement, maxWidth: number, maxHeight: number) {
  const containerRect = flow.getBoundingClientRect();
  let contentWidth = 0;
  let contentHeight = 0;

  for (const child of flow.children) {
    const rect = child.getBoundingClientRect();
    contentWidth = Math.max(contentWidth, rect.right - containerRect.left);
    contentHeight = Math.max(contentHeight, rect.bottom - containerRect.top);
  }

  return {
    contentWidth: Math.min(contentWidth, maxWidth),
    contentHeight: Math.min(contentHeight, maxHeight),
  };
}

function measureLayout(
  flow: HTMLElement,
  params: DistanceLayoutParams,
  maxHeight: number,
  maxWidth: number,
): DistanceLayoutMeasurement {
  applyLayoutStyles(flow, params, maxHeight);

  const overflowY = Math.max(0, flow.scrollHeight - maxHeight);
  const overflowX = Math.max(0, flow.scrollWidth - maxWidth);
  const { contentWidth, contentHeight } = measureContentBounds(flow, maxWidth, maxHeight);

  return {
    params,
    overflowX,
    overflowY,
    usedHeightRatio: maxHeight > 0 ? contentHeight / maxHeight : 0,
    usedWidthRatio: maxWidth > 0 ? contentWidth / maxWidth : 0,
    revealedFontSize: params.revealedFontSize,
  };
}

export function DistanceLyricBoard({ lines }: { lines: PublicLine[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => buildDistanceFlowTokens(lines).filter(isRenderableToken), [lines]);
  const [layout, setLayout] = useState<DistanceLayoutParams>(() =>
    buildLayoutParams(36, 3, false),
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const flow = flowRef.current;
    if (!container || !flow || tokens.length === 0) return;

    const runLayout = () => {
      const maxHeight = container.clientHeight;
      const maxWidth = container.clientWidth;
      if (maxHeight <= 0 || maxWidth <= 0) return;

      flow.style.width = `${maxWidth}px`;

      const best = pickBestDistanceLayout((params) => measureLayout(flow, params, maxHeight, maxWidth));

      flushSync(() => {
        setLayout(best);
      });

      applyLayoutStyles(flow, best, maxHeight);
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
    <div ref={containerRef} className="tv-distance-board min-h-0 w-full flex-1 overflow-hidden">
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
