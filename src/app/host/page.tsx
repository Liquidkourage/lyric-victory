"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MusicBackdrop,
  Panel,
  PrimaryButton,
  SecondaryButton,
} from "@/components/game-ui";
import { createRoom } from "@/hooks/useGameSocket";

export default function HostLandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { code } = await createRoom();
      router.push(`/host/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room.");
      setLoading(false);
    }
  };

  return (
    <MusicBackdrop>
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
        <Panel title="Host Console">
          <p className="mb-6 text-sm text-[#c4b5a0]">
            Start a new Lyric Victory session. You&apos;ll get a room code for players and a
            dedicated TV display link.
          </p>
          {error ? (
            <p className="mb-4 rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">{error}</p>
          ) : null}
          <div className="flex flex-col gap-3">
            <PrimaryButton onClick={handleCreate} disabled={loading} className="w-full">
              {loading ? "Creating room…" : "Create New Game"}
            </PrimaryButton>
            <SecondaryButton onClick={() => router.push("/")} className="w-full">
              Back Home
            </SecondaryButton>
          </div>
        </Panel>
      </main>
    </MusicBackdrop>
  );
}
