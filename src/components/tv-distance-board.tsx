"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildDistanceSections,
  buildLayoutParams,
  isPunctuationToken,
  isRenderableToken,
  searchDistanceLayout,
  type DistanceLayoutParams,
  type DistanceSection,
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

function DistanceSectionBlock({
  section,
  sectionIndex,
  dense,
}: {
  section: DistanceSection;
  sectionIndex: number;
  dense: boolean;
}) {
  const tokens = section.tokens.filter(isRenderableToken);

  return (
    <div className="tv-distance-section" data-tv-distance-section>
      {section.label ? (
        <div className="tv-distance-section-label" aria-hidden>
          {section.label}
        </div>
      ) : null}
      <div className="tv-distance-section-words">
        {tokens.map((token, index) => renderFlowToken(token, `${sectionIndex}-${index}`, dense))}
      </div>
    </div>
  );
}

function applyLayoutStyles(element: HTMLElement, params: DistanceLayoutParams, maxHeight: number) {
  element.style.setProperty("--tvd-font", `${params.revealedFontSize}px`);
  element.style.setProperty("--tvd-chip-font", `${params.chipFontSize}px`);
  element.style.setProperty("--tvd-chip-height", `${params.chipHeight}px`);
  element.style.setProperty("--tvd-word-gap", `${params.wordGap}px`);
  element.style.setProperty("--tvd-section-gap", `${params.sectionGap}px`);
  element.style.setProperty("--tvd-column-gap", `${params.columnGap}px`);
  element.style.columnGap = `${params.columnGap}px`;
  element.style.columnCount = String(params.columnCount);
  element.style.maxHeight = `${maxHeight}px`;
  element.dataset.dense = params.dense ? "true" : "false";
}

function contentFits(flow: HTMLElement, maxHeight: number): boolean {
  return flow.scrollHeight <= maxHeight + 1 && flow.scrollWidth <= flow.clientWidth + 1;
}

export function DistanceLyricBoard({ lines }: { lines: PublicLine[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => buildDistanceSections(lines), [lines]);
  const [layout, setLayout] = useState<DistanceLayoutParams>(() =>
    buildLayoutParams(36, 3, false),
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const flow = flowRef.current;
    if (!container || !flow || sections.length === 0) return;

    const runLayout = () => {
      const maxHeight = container.clientHeight;
      const maxWidth = container.clientWidth;
      if (maxHeight <= 0 || maxWidth <= 0) return;

      flow.style.width = `${maxWidth}px`;

      const fits = (params: DistanceLayoutParams) => {
        applyLayoutStyles(flow, params, maxHeight);
        return contentFits(flow, maxHeight);
      };

      const best = searchDistanceLayout(fits);

      flushSync(() => {
        setLayout(best);
      });

      applyLayoutStyles(flow, best, maxHeight);
    };

    runLayout();
    const observer = new ResizeObserver(runLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [lines, sections.length]);

  if (sections.length === 0) {
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
            "--tvd-section-gap": `${layout.sectionGap}px`,
            "--tvd-column-gap": `${layout.columnGap}px`,
            columnCount: layout.columnCount,
          } as React.CSSProperties
        }
      >
        {sections.map((section, index) => (
          <DistanceSectionBlock
            key={`${section.label ?? "part"}-${index}`}
            section={section}
            sectionIndex={index}
            dense={layout.dense}
          />
        ))}
      </div>
    </div>
  );
}
