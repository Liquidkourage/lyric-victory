"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  tileHeightRem: 5.5,
  charWidthRem: 1.15,
  tilePaddingRem: 1.25,
  tileGapRem: 0.6,
  segmentGapRem: 0.85,
  rowGapRem: 1.1,
  minScale: 0.38,
  maxScale: 1.2,
};

function getMaxLinesPerRowCandidates(lineCount: number): number[] {
  if (lineCount <= 8) return [1];
  return [6, 5, 4, 3].filter((count) => count <= lineCount);
}

/** Pack lyric lines into display rows, never exceeding maxLinesPerRow lyric lines per row. */
export function packLinesGreedy(lines: PublicLine[], maxLinesPerRow: number): DisplayRow[] {
  if (lines.length === 0) return [];

  const rows: DisplayRow[] = [];
  let segments: DisplayRowSegment[] = [];
  let linesInRow = 0;

  for (const line of lines) {
    if (linesInRow > 0 && linesInRow >= maxLinesPerRow) {
      rows.push({ segments: filterTrailingSlash(segments) });
      segments = [];
      linesInRow = 0;
    }

    if (linesInRow > 0) {
      segments.push({ type: "slash" });
    }

    segments.push({ type: "line", tokens: line.tokens });
    linesInRow += 1;
  }

  if (segments.length > 0) {
    rows.push({ segments: filterTrailingSlash(segments) });
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

function TvPunctuation({ value }: { value: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center font-black leading-none text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.35)]"
      style={{ fontSize: `calc(2.75rem * var(--tv-scale, 1))` }}
    >
      {value}
    </span>
  );
}

function TvLineTokens({ tokens }: { tokens: PublicToken[] }) {
  const tileGap = `calc(${TV.tileGapRem}rem * var(--tv-scale, 1))`;
  const nodes: React.ReactNode[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === "text") {
      if (token.value === LINE_BREAK_MARKER) {
        nodes.push(<LineBreakSlash key={`slash-${index}`} size="tv" />);
        continue;
      }

      if (isPunctuationOnly(token.value)) {
        const next = tokens[index + 1];
        if (next?.type === "blank") {
          nodes.push(
            <span key={`unit-${index}`} className="inline-flex shrink-0 items-center">
              <TvPunctuation value={token.value} />
              <BlankTile token={next} size="tv" />
            </span>,
          );
          index += 1;
          continue;
        }

        nodes.push(<TvPunctuation key={`punct-${index}`} value={token.value} />);
        continue;
      }

      nodes.push(renderToken(token, index, "tv"));
      continue;
    }

    const next = tokens[index + 1];
    if (next?.type === "text" && isPunctuationOnly(next.value)) {
      nodes.push(
        <span key={`unit-${index}`} className="inline-flex shrink-0 items-center">
          <BlankTile token={token} size="tv" />
          <span className="-ml-[calc(0.15rem*var(--tv-scale,1))]">
            <TvPunctuation value={next.value} />
          </span>
        </span>,
      );
      index += 1;
      continue;
    }

    nodes.push(<BlankTile key={`blank-${index}`} token={token} size="tv" />);
  }

  return (
    <span className="inline-flex shrink-0 flex-nowrap items-center" style={{ gap: tileGap }}>
      {nodes}
    </span>
  );
}

function measureScaleForRows(
  content: HTMLDivElement,
  rows: DisplayRow[],
  containerWidth: number,
  containerHeight: number,
): { scale: number; fits: boolean } {
  const rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let lo = TV.minScale;
  let hi = TV.maxScale;
  let best = TV.minScale;

  const rowBandHeightAtScale = (scale: number) => {
    const rowGapTotalPx = Math.max(0, rows.length - 1) * TV.rowGapRem * scale * rootRem;
    return (containerHeight - rowGapTotalPx) / Math.max(rows.length, 1);
  };

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const mid = (lo + hi) / 2;
    content.style.setProperty("--tv-scale", String(mid));

    const tileHeightPx = TV.tileHeightRem * mid * rootRem;
    const rowBandHeight = rowBandHeightAtScale(mid);
    const rowElements = content.querySelectorAll<HTMLElement>("[data-tv-row-inner]");
    let fits = tileHeightPx <= rowBandHeight * 0.88;

    rowElements.forEach((row) => {
      if (row.scrollWidth > containerWidth) fits = false;
    });

    if (fits) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  content.style.setProperty("--tv-scale", String(best));

  const tileHeightPx = TV.tileHeightRem * best * rootRem;
  const rowBandHeight = rowBandHeightAtScale(best);
  const rowElements = content.querySelectorAll<HTMLElement>("[data-tv-row-inner]");
  let fits = tileHeightPx <= rowBandHeight * 0.88;
  rowElements.forEach((row) => {
    if (row.scrollWidth > containerWidth) fits = false;
  });

  return { scale: best, fits };
}

function TvLyricRow({ row }: { row: DisplayRow }) {
  const segmentGap = `calc(${TV.segmentGapRem}rem * var(--tv-scale, 1))`;

  return (
    <div data-tv-row className="flex min-h-0 w-full flex-1 items-center py-[calc(0.15rem*var(--tv-scale,1))]">
      <div
        data-tv-row-inner
        className="flex w-full min-w-0 flex-nowrap items-center justify-start"
        style={{ gap: segmentGap }}
      >
        {row.segments.map((segment, segmentIndex) => {
          if (segment.type === "slash") {
            return <LineBreakSlash key={`slash-${segmentIndex}`} size="tv" />;
          }

          return (
            <TvLineTokens key={`line-${segmentIndex}`} tokens={segment.tokens ?? []} />
          );
        })}
      </div>
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
      fontSize: `calc(3rem * var(--tv-scale, 1))`,
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
    return (
      <span
        className="inline-flex shrink-0 items-center self-center px-0.5 font-black leading-none text-[#fbbf24] drop-shadow-[0_0_16px_rgba(251,191,36,0.55)]"
        style={{ fontSize: `calc(${TV.tileHeightRem}rem * var(--tv-scale, 1))` }}
        aria-label="Line break"
      >
        /
      </span>
    );
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
    return (
      <span
        style={style}
        className={
          size === "tv"
            ? `inline-flex items-center justify-center rounded-xl bg-[#16a34a] font-black uppercase tracking-wide text-white shadow-[0_0_20px_rgba(22,163,74,0.5)] ring-[3px] ring-white ${className}`
            : `inline-flex items-center justify-center rounded-md bg-success/15 font-semibold uppercase tracking-wide text-success ring-2 ring-success/35 ${className}`
        }
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
          ? `inline-flex items-center justify-center rounded-xl bg-[#fde047] font-black tabular-nums text-[#1a1612] shadow-[0_0_24px_rgba(253,224,71,0.35)] ring-[3px] ring-white ${className}`
          : `inline-flex items-center justify-center rounded-md bg-surface-muted font-bold tabular-nums text-ink-bright ring-2 ring-ink/30 ${className}`
      }
      aria-label={`${token.length} letter blank`}
    >
      {token.length}
    </span>
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
  const [layout, setLayout] = useState<{ rows: DisplayRow[]; scale: number }>(() => ({
    rows: packLinesGreedy(lines, 3),
    scale: 1,
  }));

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content || lines.length === 0) return;

    const runLayout = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (containerWidth <= 0 || containerHeight <= 0) return;

      let bestLayout = {
        rows: packLinesGreedy(lines, 4),
        scale: TV.minScale,
        fits: false,
        rowCount: Number.POSITIVE_INFINITY,
      };

      for (const maxLinesPerRow of getMaxLinesPerRowCandidates(lines.length)) {
        const rows = packLinesGreedy(lines, maxLinesPerRow);

        flushSync(() => {
          setLayout({ rows, scale: 1 });
        });

        const { scale, fits } = measureScaleForRows(
          content,
          rows,
          containerWidth,
          containerHeight,
        );

        if (fits) {
          if (
            rows.length < bestLayout.rowCount ||
            (rows.length === bestLayout.rowCount && scale > bestLayout.scale)
          ) {
            bestLayout = { rows, scale, fits: true, rowCount: rows.length };
          }
          continue;
        }

        if (!bestLayout.fits && scale > bestLayout.scale) {
          bestLayout = { rows, scale, fits: false, rowCount: rows.length };
        }
      }

      flushSync(() => {
        setLayout({ rows: bestLayout.rows, scale: bestLayout.scale });
      });
    };

    runLayout();

    const observer = new ResizeObserver(() => {
      runLayout();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [lines]);

  const rowGap = `calc(${TV.rowGapRem}rem * var(--tv-scale, 1))`;

  return (
    <div ref={containerRef} className="min-h-0 w-full flex-1 overflow-hidden">
      <div
        ref={contentRef}
        className="flex h-full w-full flex-col"
        style={
          {
            "--tv-scale": layout.scale,
            gap: rowGap,
          } as React.CSSProperties
        }
      >
        {layout.rows.map((row, rowIndex) => (
          <TvLyricRow key={rowIndex} row={row} />
        ))}
      </div>
    </div>
  );
}

export function BeatTimer({
  active,
  endsAt,
  durationMs,
  compact = false,
}: {
  active: boolean;
  endsAt: number | null;
  durationMs: number;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active || !endsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [active, endsAt]);

  if (!active || !endsAt) {
    return (
      <div
        className={`rounded-xl bg-surface-muted text-center font-medium text-[#8a7d6b] ${
          compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"
        }`}
      >
        Beat idle
      </div>
    );
  }

  const remaining = Math.max(0, endsAt - now);
  const seconds = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(100, (remaining / durationMs) * 100));

  return (
    <div className="rounded-xl bg-gradient-to-r from-accent to-accent-deep p-[2px]">
      <div className={`rounded-[10px] bg-surface-elevated ${compact ? "px-3 py-2" : "px-5 py-4"}`}>
        <div
          className={`mb-1.5 flex items-center justify-between font-semibold text-accent ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          <span>Beat active</span>
          <span>{seconds}s</span>
        </div>
        <div className={`overflow-hidden rounded-full bg-[#1a1612] ${compact ? "h-2" : "h-3"}`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-ink to-ink-bright transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function PhaseBadge({ phase }: { phase: string }) {
  const labels: Record<string, string> = {
    lobby: "Lobby",
    "round-setup": "Round Setup",
    "word-guess": "Word Guessing",
    "song-guess": "Name That Song",
    "between-rounds": "Between Rounds",
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
