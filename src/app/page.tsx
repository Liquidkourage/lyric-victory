import Link from "next/link";
import { MusicBackdrop, Panel, PrimaryButton, SecondaryButton } from "@/components/game-ui";

export default function HomePage() {
  return (
    <MusicBackdrop>
      <main className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-violet-900/60 px-4 py-2 text-sm font-semibold text-violet-200 ring-1 ring-violet-500/30">
            <span aria-hidden>🎵</span>
            Party lyrics game
          </div>
          <h1 className="text-5xl font-black tracking-tight text-slate-50 sm:text-6xl">
            Lyric <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Victory</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            Guess the missing words beat by beat, then race to name the song. Host on your laptop,
            players on phones, and put the big board on the TV.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Host">
            <p className="mb-5 text-sm text-slate-400">
              Create a room, pick songs or paste custom lyrics, and run each round.
            </p>
            <Link href="/host">
              <PrimaryButton className="w-full">Open Host Console</PrimaryButton>
            </Link>
          </Panel>

          <Panel title="Players">
            <p className="mb-5 text-sm text-slate-400">
              Join with a room code and display name. Submit word and song guesses each round.
            </p>
            <Link href="/play">
              <PrimaryButton className="w-full">Join a Game</PrimaryButton>
            </Link>
          </Panel>

          <Panel title="TV Display">
            <p className="mb-5 text-sm text-slate-400">
              Open on a projector or living-room screen to show the puzzle board and live guesses.
            </p>
            <Link href="/play">
              <SecondaryButton className="w-full">Use Room Code From Host</SecondaryButton>
            </Link>
          </Panel>
        </div>
      </main>
    </MusicBackdrop>
  );
}
