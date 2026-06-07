"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicLine, PublicToken } from "@/lib/types";

const LINE_BREAK_MARKER = "/";

export interface DisplayRowSegment {
  type: "line" | "slash";
  tokens?: PublicToken[];
}

export interface DisplayRow {
  segments: DisplayRowSegment[];
}

function getDisplayRowTarget(lineCount: number): number {
  if (lineCount <= 8) return lineCount;
  if (lineCount <= 18) return 8;
  if (lineCount <= 32) return 7;
  if (lineCount <= 48) return 6;
  return 5;
}

const MAX_TOKENS_PER_ROW = 36;

function filterTrailingSlash(segments: DisplayRowSegment[]): DisplayRowSegment[] {
  return segments.filter(
    (segment, index) => !(segment.type === "slash" && index === segments.length - 1),
  );
}

export function buildDisplayRows(lines: PublicLine[]): DisplayRow[] {
  if (lines.length === 0) return [];

  const targetRows = getDisplayRowTarget(lines.length);

  if (lines.length <= targetRows) {
    return lines.map((line) => ({
      segments: [{ type: "line", tokens: line.tokens }],
    }));
  }

  const groupSize = Math.ceil(lines.length / targetRows);
  const rows: DisplayRow[] = [];

  for (let i = 0; i < lines.length; i += groupSize) {
    const group = lines.slice(i, i + groupSize);
    let segments: DisplayRowSegment[] = [];
    let tokenCount = 0;

    for (const line of group) {
      const lineTokenCount = line.tokens.length;

      if (segments.length > 0 && tokenCount + lineTokenCount > MAX_TOKENS_PER_ROW) {
        rows.push({ segments: filterTrailingSlash(segments) });
        segments = [];
        tokenCount = 0;
      }

      if (segments.length > 0) {
        segments.push({ type: "slash" });
      }

      segments.push({ type: "line", tokens: line.tokens });
      tokenCount += lineTokenCount;
    }

    if (segments.length > 0) {
      rows.push({ segments: filterTrailingSlash(segments) });
    }
  }

  return rows;
}

function getBlankStyle(length: number, size: "sm" | "md" | "lg" | "display" | "tv") {
  const heightRem = { sm: 2, md: 2.5, lg: 3.5, display: 3, tv: 5.5 }[size];
  const charWidthRem = { sm: 0.45, md: 0.55, lg: 0.85, display: 0.7, tv: 1.15 }[size];
  const paddingRem = { sm: 0.5, md: 0.75, lg: 1, display: 0.85, tv: 1.25 }[size];
  const minWidthRem = Math.max(heightRem, paddingRem * 2 + length * charWidthRem);

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
    tv: "px-3 text-5xl font-black",
  }[size];
}

function LineBreakSlash({ size }: { size: "sm" | "md" | "lg" | "display" | "tv" }) {
  if (size === "tv") {
    return (
      <span
        className="mx-3 inline-flex h-20 min-w-16 shrink-0 items-center justify-center self-center rounded-2xl bg-[#fbbf24] text-5xl font-black leading-none text-[#1a1612] shadow-[0_0_24px_rgba(251,191,36,0.45)] ring-4 ring-white"
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
            ? "whitespace-pre text-3xl font-semibold text-white"
            : "whitespace-pre text-[#c4b5a0]"
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
  const [scale, setScale] = useState(1);
  const displayRows = useMemo(() => buildDisplayRows(lines), [lines]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const updateScale = () => {
      content.style.transform = "none";
      content.style.width = "100%";
      content.style.height = "auto";

      const heightRatio = container.clientHeight / Math.max(content.scrollHeight, 1);
      const widthRatio = container.clientWidth / Math.max(content.scrollWidth, 1);
      const nextScale = Math.max(0.45, Math.min(1, heightRatio, widthRatio));

      setScale(Number.isFinite(nextScale) ? nextScale : 1);
    };

    updateScale();

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateScale);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [displayRows]);

  const scaledWidth = scale < 1 ? `${100 / scale}%` : "100%";

  return (
    <div ref={containerRef} className="min-h-0 w-full flex-1 overflow-hidden">
      <div
        ref={contentRef}
        className="flex w-full flex-col justify-evenly gap-2"
        style={{
          width: scaledWidth,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {displayRows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex w-full flex-nowrap items-center justify-evenly gap-3"
          >
            {row.segments.map((segment, segmentIndex) => {
              const isLast = segmentIndex === row.segments.length - 1;
              if (segment.type === "slash") {
                if (isLast) return null;
                return <LineBreakSlash key={`slash-${segmentIndex}`} size="tv" />;
              }

              return (
                <span
                  key={`line-${segmentIndex}`}
                  className="inline-flex shrink-0 flex-nowrap items-center gap-3"
                >
                  {segment.tokens?.map((token, tokenIndex) =>
                    renderToken(token, tokenIndex, "tv"),
                  )}
                </span>
              );
            })}
          </div>
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
