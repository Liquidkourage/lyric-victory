"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  buildLayoutParams,
  buildLyricSections,
  computeColumnWidth,
  distributeSectionsToColumns,
  isPunctuationToken,
  packTokensIntoRows,
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

function LyricLineBlock({
  tokens,
  columnWidthPx,
  params,
}: {
  tokens: PublicToken[];
  columnWidthPx: number;
  params: DistanceLayoutParams;
}) {
  const pack = packTokensIntoRows(tokens, columnWidthPx, params);
  const wordGap = params.wordGap * pack.wordGapScale;

  return (
    <div
      className={`tv-distance-lane${pack.wrapped ? " tv-distance-lane--wrapped" : ""}`}
      style={
        {
          "--tvd-line-font-scale": pack.fontScale,
          "--tvd-line-word-gap": `${wordGap}px`,
          width: pack.widthBoostPx > 0 ? `calc(100% + ${pack.widthBoostPx}px)` : undefined,
          marginLeft: pack.widthBoostPx > 0 ? `${-pack.widthBoostPx / 2}px` : undefined,
          marginRight: pack.widthBoostPx > 0 ? `${-pack.widthBoostPx / 2}px` : undefined,
        } as React.CSSProperties
      }
    >
      {pack.rows.map((rowTokens, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className={`tv-distance-line-row${rowIndex > 0 ? " tv-distance-line-row--cont" : ""}`}
        >
          {rowTokens.map((token, tokenIndex) =>
            renderLaneToken(token, `row-${rowIndex}-t-${tokenIndex}`),
          )}
        </div>
      ))}
    </div>
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
  sheet.style.setProperty("--tvd-cont-gap", `${params.continuationGap}px`);
  sheet.style.setProperty("--tvd-line-gap", `${params.lineGap}px`);
  sheet.style.setProperty("--tvd-stanza-gap", `${params.stanzaGap}px`);
  sheet.style.setProperty("--tvd-column-gap", `${params.columnGap}px`);
  sheet.style.setProperty("--tvd-columns", String(params.columnCount));
  sheet.style.width = `${viewportWidth}px`;
  sheet.style.height = `${viewportHeight}px`;
  sheet.style.maxHeight = `${viewportHeight}px`;
}

function measureLaneStats(sheet: HTMLElement) {
  const lanes = sheet.querySelectorAll<HTMLElement>(".tv-distance-lane");
  const tokenCounts: number[] = [];
  let wrappedLaneCount = 0;
  let orphanWrapCount = 0;

  for (const lane of lanes) {
    const rows = lane.querySelectorAll<HTMLElement>(".tv-distance-line-row");
    let units = 0;

    for (const row of rows) {
      for (const child of row.children) {
        if (child.classList.contains("tv-distance-punct")) continue;
        units += 1;
      }
    }

    if (units > 0) tokenCounts.push(units);

    if (rows.length > 1) {
      wrappedLaneCount += 1;
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        let lastRowUnits = 0;
        for (const child of lastRow.children) {
          if (child.classList.contains("tv-distance-punct")) continue;
          lastRowUnits += 1;
        }
        if (lastRowUnits <= 3) orphanWrapCount += 1;
      }
    }
  }

  const total = tokenCounts.reduce((sum, count) => sum + count, 0);
  return {
    wrappedLaneCount,
    orphanWrapCount,
    avgTokensPerLine: tokenCounts.length > 0 ? total / tokenCounts.length : 0,
    maxTokensPerLine: tokenCounts.length > 0 ? Math.max(...tokenCounts) : 0,
    lineCount: tokenCounts.length,
  };
}

function measureContentExtent(sheet: HTMLElement, viewportWidth: number) {
  const sheetRect = sheet.getBoundingClientRect();
  let contentRight = 0;
  let contentBottom = 0;

  for (const column of sheet.querySelectorAll<HTMLElement>(".tv-distance-column")) {
    const rect = column.getBoundingClientRect();
    contentRight = Math.max(contentRight, rect.right - sheetRect.left);
    contentBottom = Math.max(contentBottom, rect.bottom - sheetRect.top);
  }

  return {
    contentScrollHeight: Math.max(sheet.scrollHeight, contentBottom),
    contentScrollWidth: Math.min(Math.max(sheet.scrollWidth, contentRight), viewportWidth),
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

  const { contentScrollHeight, contentScrollWidth } = measureContentExtent(sheet, viewportWidth);
  const overflowY = Math.max(0, contentScrollHeight - viewportHeight);
  const overflowX = Math.max(0, contentScrollWidth - viewportWidth);
  const laneStats = measureLaneStats(sheet);
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
    orphanWrapCount: laneStats.orphanWrapCount,
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
      <div>wrappedLanes: {debug.wrappedLaneCount}</div>
      <div>orphanWraps: {debug.orphanWrapCount}</div>
      <div>usedHeightRatio: {debug.usedHeightRatio.toFixed(3)}</div>
      <div>usedWidthRatio: {debug.usedWidthRatio.toFixed(3)}</div>
      <div>overflowX: {Math.round(debug.overflowX)}</div>
      <div>overflowY: {Math.round(debug.overflowY)}</div>
    </div>
  );
}

function LyricSheet({
  columns,
  columnCount,
  columnWidthPx,
  params,
}: {
  columns: LyricSheetColumn[];
  columnCount: number;
  columnWidthPx: number;
  params: DistanceLayoutParams;
}) {
  return (
    <>
      {Array.from({ length: columnCount }, (_, columnIndex) => {
        const column = columns[columnIndex] ?? { sections: [] };
        return (
          <div key={`col-${columnIndex}`} className="tv-distance-column">
            {column.sections.map((section, sectionIndex) => (
              <div key={`sec-${columnIndex}-${sectionIndex}`} className="tv-distance-section">
                {section.label ? (
                  <p className="tv-distance-section-label">{section.label}</p>
                ) : null}
                {section.stanzas.map((stanza, stanzaIndex) => (
                  <div
                    key={`stanza-${columnIndex}-${sectionIndex}-${stanzaIndex}`}
                    className="tv-distance-stanza"
                  >
                    {stanza.lines.map((line, lineIndex) => (
                      <LyricLineBlock
                        key={`line-${columnIndex}-${sectionIndex}-${stanzaIndex}-${lineIndex}`}
                        tokens={line.tokens}
                        columnWidthPx={columnWidthPx}
                        params={params}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
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
  const [columnWidthPx, setColumnWidthPx] = useState(640);
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
      let measuringFont = -1;

      const result = pickBestDistanceLayout(lines, (params, nextColumns) => {
        const nextColumnWidth = computeColumnWidth(viewportWidth, params);
        const layoutChanged =
          params.columnCount !== measuringColumn || params.revealedFontSize !== measuringFont;

        if (layoutChanged) {
          measuringColumn = params.columnCount;
          measuringFont = params.revealedFontSize;
          flushSync(() => {
            setColumns(nextColumns);
            setLayout(params);
            setColumnWidthPx(nextColumnWidth);
          });
        }

        return measureLayout(sheet, params, nextColumns, viewportHeight, viewportWidth);
      });

      const finalColumnWidth = computeColumnWidth(viewportWidth, result.params);

      flushSync(() => {
        setColumns(result.columns);
        setLayout(result.params);
        setColumnWidthPx(finalColumnWidth);
        setDebugInfo(toDebugInfo(result.measurement));
      });

      applyLayoutStyles(sheet, result.params, viewportHeight, viewportWidth);
    };

    runLayout();
    const observer = new ResizeObserver(runLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [lines]);

  if (columns.length === 0 && layout.columnCount === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="tv-distance-board relative min-h-0 w-full flex-1 overflow-hidden">
      {showDebug && debugInfo ? <LayoutDebugOverlay debug={debugInfo} /> : null}
      <div ref={sheetRef} className="tv-distance-sheet">
        <LyricSheet
          columns={columns}
          columnCount={layout.columnCount}
          columnWidthPx={columnWidthPx}
          params={layout}
        />
      </div>
    </div>
  );
}
