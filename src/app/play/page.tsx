"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MusicBackdrop,
  Panel,
  PrimaryButton,
  SecondaryButton,
} from "@/components/game-ui";
import { normalizeRoomCode } from "@/lib/room-code";

export default function PlayJoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleJoin = () => {
    const code = normalizeRoomCode(roomCode);
    const name = displayName.trim();
    if (!code || !name) return;
    router.push(`/play/${code}?name=${encodeURIComponent(name)}`);
  };

  const openDisplay = () => {
    const code = normalizeRoomCode(roomCode);
    if (!code) return;
    router.push(`/display/${code}`);
  };

  return (
    <MusicBackdrop>
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
        <Panel title="Join Lyric Victory">
          <div className="grid gap-3">
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="Room code"
              className="rounded-2xl border border-violet-100 px-4 py-3 text-center font-mono text-xl tracking-[0.25em] outline-none ring-violet-200 focus:ring-2"
            />
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              className="rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none ring-violet-200 focus:ring-2"
            />
            <PrimaryButton onClick={handleJoin} disabled={!roomCode.trim() || !displayName.trim()} className="w-full">
              Join as Player
            </PrimaryButton>
            <SecondaryButton onClick={openDisplay} disabled={!roomCode.trim()} className="w-full">
              Open TV Display Instead
            </SecondaryButton>
            <SecondaryButton onClick={() => router.push("/")} className="w-full">
              Back Home
            </SecondaryButton>
          </div>
        </Panel>
      </main>
    </MusicBackdrop>
  );
}
