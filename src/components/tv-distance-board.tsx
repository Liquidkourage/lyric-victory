"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildLayoutParams,
  buildLyricSections,
  distributeSectionsToColumns,
  isPunctuationToken,
  pickBestDistanceLayout,
  summarizeSheetColumns,
  toDebugInfo,
  type DistanceLayoutDebugInfo,
  type DistanceLayoutMeasurement,
  type DistanceLayoutParams,
  type LyricSheetColumn,
} from "@/lib/tv-distance-layout";
import type { PublicLine, PublicToken } from "@/lib/types";

function DistanceHiddenChip({ length }: { length: number }) {
  return (
    <span className="tv-distance-hidden" aria-label={`${length} letter blank`}>
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

function DistancePunctuation({ value }: { value: string }) {
  return (
    <span className="tv-distance-punct" aria-hidden>
      {value}
    </span>
  );
}

function renderLaneToken(token: PublicToken, key: string) {
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
    return <DistanceHiddenChip key={key} length={token.length} />;
  }

  if (isPunctuationToken(token)) {
    return <DistancePunctuation key={key} value={token.value} />;
  }

  return (
    <span key={key} className="tv-distance-text">
      {token.value}
    </span>
  );
}

function applyLayoutStyles(
  sheet: HTMLElement,
  params: DistanceLayoutParams,
  viewportHeight: number,
  viewportWidth: number,
) {
  sheet.style.setProperty("--tvd-font", `${params.revealedFontSize}px`);
  sheet.style.setProperty("--tvd-chip-font", `${params.chipFontSize}px`);
  sheet.style.setProperty("--tvd-chip-height", `${params.chipHeight}px`);
  sheet.style.setProperty("--tvd-chip-min", `${params.chipMinWidth}px`);
  sheet.style.setProperty("--tvd-word-gap", `${params.wordGap}px`);
  sheet.style.setProperty("--tvd-line-gap", `${params.lineGap}px`);
  sheet.style.setProperty("--tvd-stanza-gap", `${params.stanzaGap}px`);
  sheet.style.setProperty("--tvd-column-gap", `${params.columnGap}px`);
  sheet.style.width = `${viewportWidth}px`;
  sheet.style.height = `${viewportHeight}px`;
  sheet.style.maxHeight = `${viewportHeight}px`;
}

function measureLaneStats(sheet: HTMLElement, lineHeightPx: number) {
  const lanes = sheet.querySelectorAll<HTMLElement>(".tv-distance-lane");
  const tokenCounts: number[] = [];
  let wrappedLaneCount = 0;

  for (const lane of lanes) {
    let units = 0;
    for (const child of lane.children) {
      if (child.classList.contains("tv-distance-punct")) continue;
      units += 1;
    }
    if (units > 0) tokenCounts.push(units);

    if (lane.getBoundingClientRect().height > lineHeightPx * 1.35) {
      wrappedLaneCount += 1;
    }
  }

  const total = tokenCounts.reduce((sum, count) => sum + count, 0);
  return {
    wrappedLaneCount,
    avgTokensPerLine: tokenCounts.length > 0 ? total / tokenCounts.length : 0,
    maxTokensPerLine: tokenCounts.length > 0 ? Math.max(...tokenCounts) : 0,
    lineCount: tokenCounts.length,
  };
}

function measureLayout(
  sheet: HTMLElement,
  params: DistanceLayoutParams,
  columns: LyricSheetColumn[],
  viewportHeight: number,
  viewportWidth: number,
): DistanceLayoutMeasurement {
  applyLayoutStyles(sheet, params, viewportHeight, viewportWidth);

  const contentScrollHeight = sheet.scrollHeight;
  const contentScrollWidth = sheet.scrollWidth;
  const overflowY = Math.max(0, contentScrollHeight - viewportHeight);
  const overflowX = Math.max(0, contentScrollWidth - viewportWidth);
  const laneStats = measureLaneStats(sheet, params.revealedFontSize * 1.12);
  const sheetSummary = summarizeSheetColumns(columns);

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
    lineCount: laneStats.lineCount || sheetSummary.lineCount,
    sectionCount: sheetSummary.sectionCount,
    wrappedLaneCount: laneStats.wrappedLaneCount,
    avgTokensPerLine: laneStats.avgTokensPerLine || sheetSummary.avgTokensPerLine,
    maxTokensPerLine: laneStats.maxTokensPerLine || sheetSummary.maxTokensPerLine,
  };
}

function LayoutDebugOverlay({ debug }: { debug: DistanceLayoutDebugInfo }) {
  return (
    <div className="tv-distance-debug pointer-events-none absolute right-2 top-2 z-20 font-mono text-xs leading-relaxed text-[#fde047]">
      <div>columns: {debug.columns}</div>
      <div>revealedFontSize: {debug.revealedFontSize}px</div>
      <div>lines: {debug.lineCount}</div>
      <div>sections: {debug.sectionCount}</div>
      <div>wrappedLanes: {debug.wrappedLaneCount}</div>
      <div>avgTokensPerLine: {debug.avgTokensPerLine.toFixed(1)}</div>
      <div>maxTokensPerLine: {debug.maxTokensPerLine}</div>
      <div>usedHeightRatio: {debug.usedHeightRatio.toFixed(3)}</div>
      <div>usedWidthRatio: {debug.usedWidthRatio.toFixed(3)}</div>
      <div>overflowX: {Math.round(debug.overflowX)}</div>
      <div>overflowY: {Math.round(debug.overflowY)}</div>
    </div>
  );
}

function LyricSheet({
  columns,
  globalLaneOffset = 0,
}: {
  columns: LyricSheetColumn[];
  globalLaneOffset?: number;
}) {
  let laneIndex = globalLaneOffset;

  return (
    <>
      {columns.map((column, columnIndex) => (
        <div key={`col-${columnIndex}`} className="tv-distance-column">
          {column.sections.map((section, sectionIndex) => (
            <div key={`sec-${columnIndex}-${sectionIndex}`} className="tv-distance-section">
              {section.label ? (
                <p className="tv-distance-section-label">{section.label}</p>
              ) : null}
              {section.stanzas.map((stanza, stanzaIndex) => (
                <div key={`stanza-${columnIndex}-${sectionIndex}-${stanzaIndex}`} className="tv-distance-stanza">
                  {stanza.lines.map((line, lineIndex) => {
                    const laneKey = `lane-${laneIndex}`;
                    const alt = laneIndex % 2 === 1;
                    laneIndex += 1;
                    return (
                      <div
                        key={laneKey}
                        className={`tv-distance-lane${alt ? " tv-distance-lane--alt" : ""}`}
                      >
                        {line.tokens.map((token, tokenIndex) =>
                          renderLaneToken(token, `${laneKey}-t-${tokenIndex}`),
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<DistanceLayoutParams>(() => buildLayoutParams(36, 3));
  const [columns, setColumns] = useState<LyricSheetColumn[]>(() =>
    distributeSectionsToColumns(buildLyricSections(lines), 3),
  );
  const [debugInfo, setDebugInfo] = useState<DistanceLayoutDebugInfo | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const sheet = sheetRef.current;
    if (!container || !sheet) return;

    const runLayout = () => {
      const viewportHeight = container.clientHeight;
      const viewportWidth = container.clientWidth;
      if (viewportHeight <= 0 || viewportWidth <= 0) return;

      let measuringColumn = -1;

      const result = pickBestDistanceLayout(lines, (params, nextColumns) => {
        if (params.columnCount !== measuringColumn) {
          measuringColumn = params.columnCount;
          flushSync(() => {
            setColumns(nextColumns);
          });
        }

        return measureLayout(sheet, params, nextColumns, viewportHeight, viewportWidth);
      });

      flushSync(() => {
        setColumns(result.columns);
        setLayout(result.params);
        setDebugInfo(toDebugInfo(result.measurement));
      });

      applyLayoutStyles(sheet, result.params, viewportHeight, viewportWidth);
    };

    runLayout();
    const observer = new ResizeObserver(runLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [lines]);

  if (columns.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="tv-distance-board relative min-h-0 w-full flex-1 overflow-hidden">
      {showDebug && debugInfo ? <LayoutDebugOverlay debug={debugInfo} /> : null}
      <div
        ref={sheetRef}
        className="tv-distance-sheet"
        style={
          {
            "--tvd-font": `${layout.revealedFontSize}px`,
            "--tvd-chip-font": `${layout.chipFontSize}px`,
            "--tvd-chip-height": `${layout.chipHeight}px`,
            "--tvd-chip-min": `${layout.chipMinWidth}px`,
            "--tvd-word-gap": `${layout.wordGap}px`,
            "--tvd-line-gap": `${layout.lineGap}px`,
            "--tvd-stanza-gap": `${layout.stanzaGap}px`,
            "--tvd-column-gap": `${layout.columnGap}px`,
          } as React.CSSProperties
        }
      >
        <LyricSheet columns={columns} />
      </div>
    </div>
  );
}
