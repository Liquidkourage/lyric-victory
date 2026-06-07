"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicLine, PublicToken } from "@/lib/types";

const LINE_BREAK_MARKER = "/";

function getDisplayRowTarget(lineCount: number): number {
  if (lineCount <= 8) return lineCount;
  if (lineCount <= 18) return 8;
  if (lineCount <= 32) return 7;
  if (lineCount <= 48) return 6;
  return 5;
}

export function combineLinesForDisplay(
  lines: PublicLine[],
  targetRows = getDisplayRowTarget(lines.length),
): PublicLine[] {
  if (lines.length <= targetRows) {
    return lines;
  }

  const groupSize = Math.ceil(lines.length / targetRows);
  const combined: PublicLine[] = [];

  for (let i = 0; i < lines.length; i += groupSize) {
    const group = lines.slice(i, i + groupSize);
    const tokens: PublicToken[] = [];

    group.forEach((line, index) => {
      if (index > 0) {
        tokens.push({ type: "text", value: LINE_BREAK_MARKER });
      }
      tokens.push(...line.tokens);
    });

    combined.push({ tokens });
  }

  return combined;
}

function LineBreakSlash({ size }: { size: "sm" | "md" | "lg" | "display" }) {
  if (size === "display") {
    return (
      <span
        className="mx-2 inline-flex h-12 min-w-10 shrink-0 items-center justify-center self-center rounded-xl bg-gradient-to-b from-violet-500 to-fuchsia-500 text-3xl font-black leading-none text-white shadow-md ring-2 ring-violet-300"
        aria-label="Line break"
      >
        /
      </span>
    );
  }

  return (
    <span className="px-1 text-base font-semibold text-violet-400" aria-label="Line break">
      /
    </span>
  );
}

function renderToken(
  token: PublicToken,
  tokenIndex: number,
  size: "sm" | "md" | "lg" | "display",
) {
  if (token.type === "text") {
    if (token.value === LINE_BREAK_MARKER) {
      return <LineBreakSlash key={tokenIndex} size={size} />;
    }

    return (
      <span key={tokenIndex} className="whitespace-pre text-slate-700">
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
  size?: "sm" | "md" | "lg" | "display";
}) {
  const sizeClasses = {
    sm: "h-8 min-w-8 px-1 text-sm",
    md: "h-10 min-w-10 px-2 text-base",
    lg: "h-14 min-w-14 px-3 text-2xl",
    display: "h-12 min-w-12 px-2 text-2xl",
  }[size];

  if (token.revealed && token.answer) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md bg-emerald-100 font-semibold uppercase tracking-wide text-emerald-800 ring-2 ring-emerald-300 ${sizeClasses}`}
      >
        {token.answer}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-violet-100 font-bold tabular-nums text-violet-700 ring-2 ring-violet-200 ${sizeClasses}`}
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
          className={`flex flex-wrap items-center ${gapClass} ${size === "display" ? "justify-center" : ""}`}
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
  const displayLines = useMemo(() => combineLinesForDisplay(lines), [lines]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const updateScale = () => {
      const widthRatio = (container.clientWidth - 16) / content.scrollWidth;
      const heightRatio = (container.clientHeight - 16) / content.scrollHeight;
      const nextScale = Math.min(widthRatio, heightRatio);
      setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateScale);
    });
    observer.observe(container);
    observer.observe(content);

    return () => observer.disconnect();
  }, [displayLines]);

  return (
    <div ref={containerRef} className="min-h-0 w-full flex-1 overflow-hidden">
      <div className="flex h-full w-full items-center justify-center">
        <div
          ref={contentRef}
          className="inline-block max-w-none origin-center"
          style={{ transform: `scale(${scale})` }}
        >
          <LyricBoard lines={displayLines} size="display" />
        </div>
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
        className={`rounded-xl bg-slate-100 text-center font-medium text-slate-500 ${
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
    <div className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 p-[2px]">
      <div className={`rounded-[10px] bg-white ${compact ? "px-3 py-2" : "px-5 py-4"}`}>
        <div
          className={`mb-1.5 flex items-center justify-between font-semibold text-violet-700 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          <span>Beat active</span>
          <span>{seconds}s</span>
        </div>
        <div className={`overflow-hidden rounded-full bg-violet-100 ${compact ? "h-2" : "h-3"}`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-200"
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
    <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
      {labels[phase] ?? phase}
    </span>
  );
}

export function RoomCodeBadge({ code, compact = false }: { code: string; compact?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl bg-white shadow-sm ring-1 ring-violet-100 ${
        compact ? "px-3 py-1.5" : "rounded-2xl px-4 py-2"
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Room</span>
      <span
        className={`font-mono font-bold tracking-[0.15em] text-violet-700 ${
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
    <div className="relative min-h-full overflow-hidden bg-[#faf7f2]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.12),transparent_35%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.12),transparent_30%),radial-gradient(circle_at_bottom,rgba(45,212,191,0.08),transparent_40%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-56 w-56 rounded-full bg-violet-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full bg-pink-200/40 blur-3xl" />
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
    <section className={`rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-violet-100 backdrop-blur ${className}`}>
      {title ? <h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2> : null}
      {children}
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
      className={`rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
      className={`rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
