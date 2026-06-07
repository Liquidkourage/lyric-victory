"use client";

import { useEffect, useState } from "react";
import type { PublicLine, PublicToken } from "@/lib/types";

function BlankTile({
  token,
  size = "md",
}: {
  token: Extract<PublicToken, { type: "blank" }>;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 min-w-8 px-1 text-sm",
    md: "h-10 min-w-10 px-2 text-base",
    lg: "h-14 min-w-14 px-3 text-2xl",
  }[size];

  if (token.revealed && token.answer) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-lg bg-emerald-100 font-semibold uppercase tracking-wide text-emerald-800 ring-2 ring-emerald-300 ${sizeClasses}`}
      >
        {token.answer}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-violet-100 font-bold text-violet-500 ring-2 ring-violet-200 ${sizeClasses}`}
      aria-label={`${token.length} letter blank`}
    >
      {Array.from({ length: token.length }).map((_, index) => (
        <span key={index} className="mx-px inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
      ))}
    </span>
  );
}

export function LyricBoard({
  lines,
  size = "md",
}: {
  lines: PublicLine[];
  size?: "sm" | "md" | "lg";
}) {
  const textSize = {
    sm: "text-sm leading-8",
    md: "text-base leading-10",
    lg: "text-3xl leading-[3.5rem]",
  }[size];

  return (
    <div className={`space-y-3 ${textSize}`}>
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {line.tokens.map((token, tokenIndex) =>
            token.type === "text" ? (
              <span key={tokenIndex} className="whitespace-pre text-slate-700">
                {token.value}
              </span>
            ) : (
              <BlankTile key={tokenIndex} token={token} size={size} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function BeatTimer({
  active,
  endsAt,
  durationMs,
}: {
  active: boolean;
  endsAt: number | null;
  durationMs: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active || !endsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [active, endsAt]);

  if (!active || !endsAt) {
    return (
      <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-500">
        Beat idle
      </div>
    );
  }

  const remaining = Math.max(0, endsAt - now);
  const seconds = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(100, (remaining / durationMs) * 100));

  return (
    <div className="rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 p-[2px] shadow-lg">
      <div className="rounded-[14px] bg-white px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-violet-700">
          <span>Beat active</span>
          <span>{seconds}s</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-violet-100">
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

export function RoomCodeBadge({ code }: { code: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 shadow-sm ring-1 ring-violet-100">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Room</span>
      <span className="font-mono text-2xl font-bold tracking-[0.2em] text-violet-700">{code}</span>
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
