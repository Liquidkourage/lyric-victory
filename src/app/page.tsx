import Link from "next/link";
import { MusicBackdrop, Panel, PrimaryButton, SecondaryButton } from "@/components/game-ui";

export default function HomePage() {
  return (
    <MusicBackdrop>
      <main className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-ink/10 px-4 py-2 text-sm font-semibold text-ink ring-1 ring-ink/25">
            <span aria-hidden>♪</span>
            Lyrics · rhythm · writing
          </div>
          <h1 className="font-display text-5xl font-bold tracking-tight text-[#f4ede3] sm:text-6xl">
            Lyric <span className="bg-gradient-to-r from-ink to-amber-400 bg-clip-text text-transparent">Victory</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#c4b5a0]">
            A room-scale word game built around songs and lines. Fill in the blanks live,
            then name the track before the room beats you to it.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Host">
            <p className="mb-5 text-sm text-[#c4b5a0]">
              Create a room, search for songs, queue your setlist, and run each round from the conductor&apos;s desk.
            </p>
            <Link href="/host">
              <PrimaryButton className="w-full">Open Host Console</PrimaryButton>
            </Link>
          </Panel>

          <Panel title="Players">
            <p className="mb-5 text-sm text-[#c4b5a0]">
              Join with a room code and pen your guesses on your phone — words first, then the song title.
            </p>
            <Link href="/play">
              <PrimaryButton className="w-full">Join a Game</PrimaryButton>
            </Link>
          </Panel>

          <Panel title="TV Display">
            <p className="mb-5 text-sm text-[#c4b5a0]">
              Put the manuscript board on the big screen — numbered blanks, live guesses, and the scoreboard.
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
