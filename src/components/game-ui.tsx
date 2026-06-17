"use client";

import { useEffect, useLayoutEffect, useRef, useState, Fragment } from "react";
import { flushSync } from "react-dom";
import { getBlankProgress } from "@/lib/round-progress";
import {
  distributeLinesToColumns,
  getColumnCountCandidates,
  getRowGapRemForColumn,
  getVisibleLyricLines,
  sanitizeLineTokensForTv,
} from "@/lib/tv-board-layout";
import type { PublicLine, PublicToken } from "@/lib/types";

const LINE_BREAK_MARKER = "/";

export interface DisplayRowSegment {
  type: "line" | "slash";
  tokens?: PublicToken[];
}

export interface DisplayRow {
  segments: DisplayRowSegment[];
}

const TV = {
  tileHeightRem: 6,
  charWidthRem: 1.1,
  tilePaddingRem: 1.15,
  markWidthRem: 2,
  markGapRem: 0.5,
  segmentGapRem: 0.85,
  rowGapRem: 1.2,
  columnGapRem: 0.35,
  columnDividerRem: 2.2,
  edgePaddingRem: 0.75,
  absMinScale: 0.14,
  maxScale: 1.25,
  verticalFitRatio: 0.98,
  tileGapRatio: 0.32,
};

function getSingleTileWidthRem(): number {
  return Math.max(TV.tileHeightRem, TV.tilePaddingRem * 2 + TV.charWidthRem);
}

function getTvTileGap(): string {
  const gapRem = getSingleTileWidthRem() * TV.tileGapRatio;
  return `calc(${gapRem}rem * var(--tv-scale, 1))`;
}

function getTvBlankFontSize(): string {
  return `calc(${TV.tileHeightRem * 0.68}rem * var(--tv-scale, 1))`;
}

function getTvEdgePadding(): string {
  return `calc(${TV.edgePaddingRem}rem * var(--tv-scale, 1))`;
}

function estimateBlankWidthRem(length: number): number {
  return Math.max(TV.tileHeightRem, TV.tilePaddingRem * 2 + length * TV.charWidthRem);
}

function estimateTokenWidthRem(token: PublicToken): number {
  if (token.type === "blank") {
    if (token.revealed && token.answer && token.autoRevealed) {
      return token.answer.length * 0.72;
    }
    return estimateBlankWidthRem(token.revealed && token.answer ? token.answer.length : token.length);
  }

  if (token.value === LINE_BREAK_MARKER || token.value.trim() === "") {
    return 0;
  }

  if (isPunctuationOnly(token.value)) {
    return TV.markWidthRem;
  }

  return token.value.length * 0.95;
}

function estimateLineWidthRem(tokens: PublicToken[]): number {
  const visibleTokens = sanitizeLineTokensForTv(tokens);
  const tokenGapRem = getSingleTileWidthRem() * TV.tileGapRatio;

  return visibleTokens.reduce((total, token, index) => {
    return total + estimateTokenWidthRem(token) + (index > 0 ? tokenGapRem : 0);
  }, 0);
}

function normalizeRowSegments(segments: DisplayRowSegment[]): DisplayRowSegment[] {
  const normalized: DisplayRowSegment[] = [];

  for (const segment of filterTrailingSlash(segments)) {
    if (segment.type === "slash") {
      const previous = normalized[normalized.length - 1];
      if (!previous || previous.type === "slash") continue;
      normalized.push(segment);
      continue;
    }

    const tokens = sanitizeLineTokensForTv(segment.tokens ?? []);
    if (tokens.length === 0) continue;

    const previous = normalized[normalized.length - 1];
    if (previous?.type === "slash") {
      normalized.push({ type: "line", tokens });
      continue;
    }

    normalized.push({ type: "line", tokens });
  }

  return filterTrailingSlash(normalized);
}

function linesToDisplayRows(lines: PublicLine[]): DisplayRow[] {
  return getVisibleLyricLines(lines).map((line) => ({
    segments: [{ type: "line" as const, tokens: line.tokens }],
  }));
}

/** Pack lyric lines into display rows, never exceeding maxLinesPerRow lyric lines per row. */
export function packLinesGreedy(lines: PublicLine[], maxLinesPerRow: number): DisplayRow[] {
  if (lines.length === 0) return [];

  const rows: DisplayRow[] = [];
  let segments: DisplayRowSegment[] = [];
  let linesInRow = 0;

  for (const line of lines) {
    if (linesInRow > 0 && linesInRow >= maxLinesPerRow) {
      rows.push({ segments: normalizeRowSegments(segments) });
      segments = [];
      linesInRow = 0;
    }

    const tokens = sanitizeLineTokensForTv(line.tokens);
    if (tokens.length === 0) continue;

    if (linesInRow > 0) {
      segments.push({ type: "slash" });
    }

    segments.push({ type: "line", tokens });
    linesInRow += 1;
  }

  if (segments.length > 0) {
    rows.push({ segments: normalizeRowSegments(segments) });
  }

  return rows;
}

function packLinesBalanced(lines: PublicLine[], maxLinesPerRow: number): DisplayRow[] {
  const visibleLines = lines
    .map((line) => ({ ...line, tokens: sanitizeLineTokensForTv(line.tokens) }))
    .filter((line) => line.tokens.length > 0);

  if (visibleLines.length === 0) return [];

  const rowCount = Math.ceil(visibleLines.length / maxLinesPerRow);
  const tokenGapRem = getSingleTileWidthRem() / 4;
  const lineWidths = visibleLines.map((line) => estimateLineWidthRem(line.tokens));
  const separatorWidth = TV.markWidthRem + tokenGapRem * 2;
  const totalWidth =
    lineWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, visibleLines.length - rowCount) * separatorWidth;
  const targetWidth = totalWidth / rowCount;
  const widthsByRange = new Map<string, number>();
  const memo = new Map<string, { cost: number; groups: number[] }>();

  const getRangeWidth = (start: number, end: number) => {
    const key = `${start}-${end}`;
    const cached = widthsByRange.get(key);
    if (cached !== undefined) return cached;

    const width =
      lineWidths.slice(start, end).reduce((sum, lineWidth) => sum + lineWidth, 0) +
      Math.max(0, end - start - 1) * separatorWidth;
    widthsByRange.set(key, width);
    return width;
  };

  const solve = (lineIndex: number, remainingRows: number): { cost: number; groups: number[] } => {
    const key = `${lineIndex}-${remainingRows}`;
    const cached = memo.get(key);
    if (cached) return cached;

    if (remainingRows === 0) {
      return lineIndex === visibleLines.length
        ? { cost: 0, groups: [] }
        : { cost: Number.POSITIVE_INFINITY, groups: [] };
    }

    let best = { cost: Number.POSITIVE_INFINITY, groups: [] as number[] };
    const remainingLines = visibleLines.length - lineIndex;
    const minLinesThisRow = Math.max(1, remainingLines - (remainingRows - 1) * maxLinesPerRow);
    const maxLinesThisRow = Math.min(maxLinesPerRow, remainingLines - (remainingRows - 1));

    for (let count = minLinesThisRow; count <= maxLinesThisRow; count += 1) {
      const width = getRangeWidth(lineIndex, lineIndex + count);
      const next = solve(lineIndex + count, remainingRows - 1);
      const cost = (width - targetWidth) ** 2 + next.cost;

      if (cost < best.cost) {
        best = { cost, groups: [count, ...next.groups] };
      }
    }

    memo.set(key, best);
    return best;
  };

  const groups = solve(0, rowCount).groups;
  const rows: DisplayRow[] = [];
  let lineIndex = 0;

  for (const groupSize of groups) {
    const segments: DisplayRowSegment[] = [];

    for (let index = 0; index < groupSize; index += 1) {
      if (index > 0) segments.push({ type: "slash" });
      segments.push({ type: "line", tokens: visibleLines[lineIndex].tokens });
      lineIndex += 1;
    }

    rows.push({ segments: normalizeRowSegments(segments) });
  }

  return rows;
}

function filterTrailingSlash(segments: DisplayRowSegment[]): DisplayRowSegment[] {
  return segments.filter(
    (segment, index) => !(segment.type === "slash" && index === segments.length - 1),
  );
}

function isPunctuationOnly(value: string): boolean {
  return value.length > 0 && !/[a-zA-Z]/.test(value);
}

function getTvMarkStyle(value: string): React.CSSProperties {
  const opticalShift =
    value === "(" || value === "[" || value === "{"
      ? "0.06em"
      : value === ")" || value === "]" || value === "}"
        ? "-0.06em"
        : "0";

  return {
    fontSize: `calc(${TV.tileHeightRem}rem * var(--tv-scale, 1))`,
    minWidth: `calc(${TV.markWidthRem}rem * var(--tv-scale, 1))`,
    transform: `translateX(${opticalShift})`,
  };
}

function TvBreakMark({ value, label }: { value: string; label: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center self-center px-0.5 font-bold leading-none text-white/55"
      style={getTvMarkStyle(value)}
      aria-label={label}
    >
      {value}
    </span>
  );
}

function TvPunctuation({ value }: { value: string }) {
  return <TvBreakMark value={value} label="Punctuation" />;
}

function TvRevealedWord({ value }: { value: string }) {
  const style = getBlankStyle(value.length, "tv");

  return (
    <span
      key={value}
      style={style}
      className="tv-revealed-word inline-flex shrink-0 items-center justify-center self-center rounded-lg border-[3px] border-[#1a1612] bg-[#fde047] px-[calc(0.75rem*var(--tv-scale,1))] font-black uppercase leading-none tracking-wide text-[#0a0907]"
      aria-label="Revealed word"
    >
      {value.toUpperCase()}
    </span>
  );
}

function TvAutoRevealedWord({ value }: { value: string }) {
  return (
    <span
      className="tv-auto-revealed-word inline-flex shrink-0 items-center self-center whitespace-pre rounded-md px-[calc(0.35rem*var(--tv-scale,1))] font-semibold text-[#c4b5a0]"
      style={{
        fontSize: getTvBlankFontSize(),
        lineHeight: `calc(${TV.tileHeightRem}rem * var(--tv-scale, 1))`,
        height: `calc(${TV.tileHeightRem}rem * var(--tv-scale, 1))`,
      }}
      aria-label="Pre-revealed word"
    >
      {value}
    </span>
  );
}

function TvPunctuationUnit({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center"
      style={{ gap: `calc(${TV.markGapRem}rem * var(--tv-scale, 1))` }}
    >
      {children}
    </span>
  );
}

function buildTvTokenItems(tokens: PublicToken[], keyPrefix: string): React.ReactNode[] {
  const items: React.ReactNode[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === "text") {
      if (token.value === LINE_BREAK_MARKER) {
        continue;
      }

      if (isPunctuationOnly(token.value)) {
        const next = tokens[index + 1];
        if (next?.type === "blank") {
          items.push(
            <TvPunctuationUnit key={`${keyPrefix}-${index}-unit`}>
              <TvPunctuation value={token.value} />
              <BlankTile token={next} size="tv" />
            </TvPunctuationUnit>,
          );
          index += 1;
          continue;
        }

        items.push(<TvPunctuation key={`${keyPrefix}-${index}-punct`} value={token.value} />);
        continue;
      }

      items.push(renderToken(token, index, "tv"));
      continue;
    }

    const next = tokens[index + 1];
    if (next?.type === "text" && isPunctuationOnly(next.value)) {
      items.push(
        <TvPunctuationUnit key={`${keyPrefix}-${index}-unit`}>
          <BlankTile token={token} size="tv" />
          <TvPunctuation value={next.value} />
        </TvPunctuationUnit>,
      );
      index += 1;
      continue;
    }

    items.push(<BlankTile key={`${keyPrefix}-${index}-blank`} token={token} size="tv" />);
  }

  return items;
}

function collectTvRowItems(row: DisplayRow): React.ReactNode[] {
  const items: React.ReactNode[] = [];

  row.segments.forEach((segment, segmentIndex) => {
    if (segment.type === "slash") {
      items.push(<LineBreakSlash key={`slash-${segmentIndex}`} size="tv" />);
      return;
    }

    items.push(...buildTvTokenItems(segment.tokens ?? [], `line-${segmentIndex}`));
  });

  return items;
}

function columnsFitWidth(content: HTMLDivElement): boolean {
  const columnElements = content.querySelectorAll<HTMLElement>("[data-tv-column]");
  let fits = true;

  columnElements.forEach((column) => {
    const availableWidth = column.clientWidth;
    column.querySelectorAll<HTMLElement>("[data-tv-row-inner]").forEach((row) => {
      if (row.scrollWidth > availableWidth + 1) fits = false;
    });
  });

  return fits;
}

function measureScaleForColumns(
  content: HTMLDivElement,
  maxRowsPerColumn: number,
  containerWidth: number,
  containerHeight: number,
  rowGapRem: number,
  columnCount: number,
): { scale: number; fits: boolean } {
  const rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  const scaleFloor = TV.absMinScale;
  let lo = scaleFloor;
  let hi = TV.maxScale;
  let best = scaleFloor;

  const fitsAtScale = (scale: number) => {
    content.style.setProperty("--tv-scale", String(scale));

    const rowGapTotalPx = Math.max(0, maxRowsPerColumn - 1) * rowGapRem * scale * rootRem;
    const rowBandHeight = (containerHeight - rowGapTotalPx) / Math.max(maxRowsPerColumn, 1);
    const tileHeightPx = TV.tileHeightRem * scale * rootRem;
    const horizontalChrome =
      TV.edgePaddingRem * scale * rootRem * 2 +
      Math.max(0, columnCount - 1) * TV.columnDividerRem * scale * rootRem;

    if (containerWidth <= horizontalChrome) return false;
    if (tileHeightPx > rowBandHeight * TV.verticalFitRatio) return false;
    return columnsFitWidth(content);
  };

  for (let attempt = 0; attempt < 22; attempt += 1) {
    const mid = (lo + hi) / 2;
    if (fitsAtScale(mid)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  content.style.setProperty("--tv-scale", String(best));
  return { scale: best, fits: fitsAtScale(best) };
}

function TvLyricRow({ row }: { row: DisplayRow }) {
  const tileGap = getTvTileGap();
  const items = collectTvRowItems(row);

  return (
    <div
      data-tv-row
      className="flex min-h-0 w-full flex-1 items-center justify-start"
    >
      <div
        data-tv-row-inner
        className="flex max-w-full flex-nowrap items-center justify-start overflow-visible"
        style={{ gap: tileGap }}
      >
        {items}
      </div>
    </div>
  );
}

function TvLyricColumn({ lines }: { lines: PublicLine[] }) {
  const rowGap = `calc(var(--tv-row-gap, ${TV.rowGapRem}rem) * var(--tv-scale, 1))`;

  return (
    <div
      data-tv-column
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden"
      style={{ gap: rowGap }}
    >
      {lines.map((line, lineIndex) => (
        <TvLyricRow
          key={lineIndex}
          row={{ segments: [{ type: "line", tokens: line.tokens }] }}
        />
      ))}
    </div>
  );
}

function getBlankStyle(length: number, size: "sm" | "md" | "lg" | "display" | "tv") {
  const heightRem = { sm: 2, md: 2.5, lg: 3.5, display: 3, tv: TV.tileHeightRem }[size];
  const charWidthRem = { sm: 0.45, md: 0.55, lg: 0.85, display: 0.7, tv: TV.charWidthRem }[size];
  const paddingRem = { sm: 0.5, md: 0.75, lg: 1, display: 0.85, tv: TV.tilePaddingRem }[size];
  const minWidthRem = Math.max(heightRem, paddingRem * 2 + length * charWidthRem);

  if (size === "tv") {
    return {
      height: `calc(${heightRem}rem * var(--tv-scale, 1))`,
      minWidth: `calc(${minWidthRem}rem * var(--tv-scale, 1))`,
      fontSize: getTvBlankFontSize(),
    };
  }

  return {
    height: `${heightRem}rem`,
    minWidth: `${minWidthRem}rem`,
  };
}

function getBlankClasses(size: "sm" | "md" | "lg" | "display" | "tv") {
  return {
    sm: "px-1 text-sm",
    md: "px-2 text-base",
    lg: "px-3 text-2xl",
    display: "px-2 text-2xl",
    tv: "px-[calc(0.75rem*var(--tv-scale,1))] font-black",
  }[size];
}

function LineBreakSlash({ size }: { size: "sm" | "md" | "lg" | "display" | "tv" }) {
  if (size === "tv") {
    return <TvBreakMark value="/" label="Line break" />;
  }

  if (size === "display") {
    return (
      <span
        className="mx-2 inline-flex h-12 min-w-10 shrink-0 items-center justify-center self-center rounded-xl bg-gradient-to-b from-amber-700 to-amber-500 text-3xl font-black leading-none text-[#1a1612] shadow-md ring-2 ring-ink/40"
        aria-label="Line break"
      >
        /
      </span>
    );
  }

  return (
    <span className="px-1 text-base font-semibold text-ink/70" aria-label="Line break">
      /
    </span>
  );
}

function renderToken(
  token: PublicToken,
  tokenIndex: number,
  size: "sm" | "md" | "lg" | "display" | "tv",
) {
  if (token.type === "text") {
    if (token.value === LINE_BREAK_MARKER) {
      return <LineBreakSlash key={tokenIndex} size={size} />;
    }

    return (
      <span
        key={tokenIndex}
        className={
          size === "tv"
            ? "whitespace-pre font-semibold text-white"
            : "whitespace-pre text-[#c4b5a0]"
        }
        style={
          size === "tv"
            ? { fontSize: `calc(1.875rem * var(--tv-scale, 1))` }
            : undefined
        }
      >
        {token.value}
      </span>
    );
  }

  return <BlankTile key={tokenIndex} token={token} size={size} />;
}

function BlankTile({
  token,
  size = "md",
}: {
  token: Extract<PublicToken, { type: "blank" }>;
  size?: "sm" | "md" | "lg" | "display" | "tv";
}) {
  const charCount = token.revealed && token.answer ? token.answer.length : token.length;
  const style = getBlankStyle(charCount, size);
  const className = getBlankClasses(size);

  if (token.revealed && token.answer) {
    if (size === "tv") {
      if (token.autoRevealed) {
        return <TvAutoRevealedWord value={token.answer} />;
      }
      return <TvRevealedWord value={token.answer} />;
    }

    return (
      <span
        style={style}
        className={`inline-flex items-center justify-center rounded-md bg-surface-muted font-semibold uppercase tracking-wide text-success ring-0 ${className}`}
      >
        {token.answer}
      </span>
    );
  }

  return (
    <span
      style={style}
      className={
        size === "tv"
          ? `tv-hidden-blank inline-flex items-center justify-center rounded-lg border-2 border-[#d4a853]/80 font-black tabular-nums text-[#fde047] ${className}`
          : `inline-flex items-center justify-center rounded-md bg-surface-muted font-bold tabular-nums text-ink-bright ring-2 ring-ink/30 ${className}`
      }
      aria-label={`${token.length} letter blank`}
    >
      {token.length}
    </span>
  );
}

export function HostRoundSummary({ lines }: { lines: PublicLine[] }) {
  const lineCount = lines.length;
  const blankCount = lines.reduce(
    (total, line) => total + line.tokens.filter((token) => token.type === "blank").length,
    0,
  );

  return (
    <div className="rounded-2xl bg-surface-muted px-4 py-4 ring-1 ring-ink/15">
      <p className="text-base font-semibold text-[#f4ede3]">
        {lineCount} lyric lines · {blankCount} hidden words
      </p>
      <p className="mt-2 text-sm text-[#c4b5a0]">
        The full puzzle board lives on the TV display. Use this console to run rounds and push
        announcements.
      </p>
    </div>
  );
}

export function LyricBoard({
  lines,
  size = "md",
}: {
  lines: PublicLine[];
  size?: "sm" | "md" | "lg" | "display";
}) {
  const textSize = {
    sm: "text-sm leading-8",
    md: "text-base leading-10",
    lg: "text-3xl leading-[3.5rem]",
    display: "text-xl leading-[3.25rem]",
  }[size];

  const gapClass = size === "display" ? "gap-x-2 gap-y-2" : "gap-x-2 gap-y-2";
  const lineGap = size === "display" ? "flex w-full flex-col justify-between gap-2" : "space-y-3";

  return (
    <div className={`${lineGap} ${textSize}`}>
      {lines.map((line, lineIndex) => (
        <div
          key={lineIndex}
          className={`inline-flex max-w-full shrink-0 flex-nowrap items-center ${gapClass} ${size === "display" ? "justify-center" : ""}`}
        >
          {line.tokens.map((token, tokenIndex) => renderToken(token, tokenIndex, size))}
        </div>
      ))}
    </div>
  );
}

export function ScaledLyricBoard({ lines }: { lines: PublicLine[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{
    columns: PublicLine[][];
    scale: number;
    rowGapRem: number;
    columnCount: number;
  }>(() => ({
    columns: [getVisibleLyricLines(lines)],
    scale: 1,
    rowGapRem: TV.rowGapRem,
    columnCount: 1,
  }));

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const visibleLines = getVisibleLyricLines(lines);
    if (visibleLines.length === 0) {
      setLayout({ columns: [], scale: 1, rowGapRem: TV.rowGapRem, columnCount: 1 });
      return;
    }

    const runLayout = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (containerWidth <= 0 || containerHeight <= 0) return;

      let best = {
        columns: distributeLinesToColumns(visibleLines, 1),
        scale: TV.absMinScale,
        rowGapRem: TV.rowGapRem,
        columnCount: 1,
        fits: false,
      };

      for (const columnCount of getColumnCountCandidates(visibleLines.length)) {
        const columns = distributeLinesToColumns(visibleLines, columnCount);
        const maxRowsPerColumn = Math.max(...columns.map((column) => column.length));
        const rowGapRem = getRowGapRemForColumn(visibleLines.length, columnCount, TV.rowGapRem);

        flushSync(() => {
          setLayout({ columns, scale: 1, rowGapRem, columnCount });
        });

        const { scale, fits } = measureScaleForColumns(
          content,
          maxRowsPerColumn,
          containerWidth,
          containerHeight,
          rowGapRem,
          columns.length,
        );

        if (scale > best.scale || (scale === best.scale && columnCount > best.columnCount)) {
          best = { columns, scale, rowGapRem, columnCount, fits };
        }
      }

      flushSync(() => {
        setLayout({
          columns: best.columns,
          scale: best.scale,
          rowGapRem: best.rowGapRem,
          columnCount: best.columnCount,
        });
      });
    };

    runLayout();

    const observer = new ResizeObserver(runLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [lines]);

  const edgePadding = getTvEdgePadding();

  return (
    <div ref={containerRef} className="min-h-0 w-full flex-1 overflow-hidden">
      <div
        ref={contentRef}
        className="flex h-full w-full flex-row items-stretch overflow-hidden"
        style={
          {
            "--tv-scale": layout.scale,
            "--tv-row-gap": `${layout.rowGapRem}rem`,
            paddingLeft: edgePadding,
            paddingRight: edgePadding,
          } as React.CSSProperties
        }
      >
        {layout.columns.map((columnLines, columnIndex) => (
          <Fragment key={columnIndex}>
            {columnIndex > 0 ? <div className="tv-board-column-divider" aria-hidden /> : null}
            <TvLyricColumn lines={columnLines} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function PhaseCountdown({
  label,
  active,
  endsAt,
  durationMs,
  compact = false,
  variant = "default",
}: {
  label: string;
  active: boolean;
  endsAt: number | null;
  durationMs: number;
  compact?: boolean;
  variant?: "default" | "tv";
}) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    if (!active || !endsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [active, endsAt]);

  if (!active || !endsAt) {
    return null;
  }

  const remaining = Math.max(0, endsAt - now);
  const seconds = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(100, (remaining / durationMs) * 100));

  const isTv = variant === "tv";

  return (
    <div className={`rounded-xl bg-gradient-to-r from-accent to-accent-deep ${isTv ? "p-[3px]" : "p-[2px]"}`}>
      <div
        className={`rounded-[10px] bg-surface-elevated ${
          isTv ? "px-4 py-4" : compact ? "px-3 py-2" : "px-5 py-4"
        }`}
      >
        <div
          className={`mb-2 flex items-center justify-between font-bold text-accent ${
            isTv ? "text-2xl" : compact ? "text-xs" : "text-sm"
          }`}
        >
          <span>{label}</span>
          <span className={isTv ? "font-display text-5xl font-black text-white" : undefined}>{seconds}s</span>
        </div>
        <div
          className={`overflow-hidden rounded-full bg-[#1a1612] ${
            isTv ? "h-6" : compact ? "h-2" : "h-3"
          }`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-ink to-ink-bright transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function DisplayPuzzleProgress({
  lines,
  compact = false,
  variant = "default",
}: {
  lines: PublicLine[];
  compact?: boolean;
  variant?: "default" | "tv";
}) {
  const { totalBlanks, revealedBlanks, hiddenBlanks } = getBlankProgress(lines);
  const progress = totalBlanks > 0 ? Math.round((revealedBlanks / totalBlanks) * 100) : 0;
  const isTv = variant === "tv";

  return (
    <div className={isTv ? "space-y-3" : compact ? "space-y-2" : "space-y-3"}>
      <div
        className={`flex items-end justify-between font-bold text-white ${
          isTv ? "text-2xl" : compact ? "text-xs" : "text-sm"
        }`}
      >
        <span>{revealedBlanks} revealed</span>
        <span className={isTv ? "text-white/75" : "text-white/60"}>{hiddenBlanks} hidden</span>
      </div>
      <div
        className={`overflow-hidden rounded-full bg-[#1a1612] ${
          isTv ? "h-6" : compact ? "h-2" : "h-3"
        }`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#fde047] to-[#f59e0b] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p
        className={`font-semibold text-white/80 ${
          isTv ? "text-xl" : compact ? "text-xs" : "text-sm"
        }`}
      >
        {totalBlanks > 0 ? `${progress}% of words revealed` : "No blanks in this round"}
      </p>
    </div>
  );
}

export function PhaseBadge({ phase }: { phase: string }) {
  const labels: Record<string, string> = {
    lobby: "Lobby",
    "round-setup": "Round Setup",
    "word-guess": "Word Guessing",
    "song-guess": "Name That Song",
    "between-rounds": "Open Rush",
    ended: "Game Over",
  };

  return (
    <span className="inline-flex items-center rounded-full bg-ink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink ring-1 ring-ink/25">
      {labels[phase] ?? phase}
    </span>
  );
}

export function RoomCodeBadge({ code, compact = false }: { code: string; compact?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl bg-surface-elevated shadow-sm ring-1 ring-ink/25 ${
        compact ? "px-3 py-1.5" : "rounded-2xl px-4 py-2"
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8a7d6b]">Room</span>
      <span
        className={`font-mono font-bold tracking-[0.15em] text-ink ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        {code}
      </span>
    </div>
  );
}

export function MusicBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,168,83,0.12),transparent_42%),radial-gradient(circle_at_top_right,rgba(91,164,184,0.1),transparent_38%),radial-gradient(circle_at_bottom,rgba(126,184,146,0.06),transparent_45%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-56 w-56 rounded-full bg-amber-700/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl bg-surface/90 p-5 shadow-sm ring-1 ring-ink/20 backdrop-blur ${className}`}>
      {title ? <h2 className="mb-4 text-lg font-semibold text-[#f4ede3]">{title}</h2> : null}
      {children}
    </section>
  );
}

export function CollapsiblePanel({
  title,
  children,
  defaultOpen = true,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`overflow-hidden rounded-3xl bg-surface/90 shadow-sm ring-1 ring-ink/20 backdrop-blur ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <h2 className="text-lg font-semibold text-[#f4ede3]">{title}</h2>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/10 text-lg font-bold text-ink ring-1 ring-ink/25">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div className="border-t border-ink/15 px-5 pb-5 pt-4">{children}</div> : null}
    </section>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl bg-gradient-to-r from-amber-800 via-ink to-amber-600 px-5 py-3 text-sm font-semibold text-[#1a1612] shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl bg-surface-elevated px-5 py-3 text-sm font-semibold text-ink ring-1 ring-ink/30 transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
