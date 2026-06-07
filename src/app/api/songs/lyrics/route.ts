import { NextResponse } from "next/server";
import { plainLyricsToTemplate } from "@/lib/lyrics";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const title = searchParams.get("title");
  const artist = searchParams.get("artist");

  try {
    let lyrics: string | null = null;
    let trackTitle = title ?? "Unknown Title";
    let trackArtist = artist ?? "Unknown Artist";

    if (id) {
      const byId = await fetch(`https://lrclib.net/api/get/${id}`, {
        headers: { "User-Agent": "LyricVictory/1.0 (https://github.com)" },
        next: { revalidate: 3600 },
      });
      if (byId.ok) {
        const data = (await byId.json()) as {
          plainLyrics?: string;
          trackName?: string;
          artistName?: string;
        };
        lyrics = data.plainLyrics ?? null;
        trackTitle = data.trackName ?? trackTitle;
        trackArtist = data.artistName ?? trackArtist;
      }
    } else if (title && artist) {
      const params = new URLSearchParams({
        track_name: title,
        artist_name: artist,
      });
      const response = await fetch(`https://lrclib.net/api/get?${params}`, {
        headers: { "User-Agent": "LyricVictory/1.0 (https://github.com)" },
        next: { revalidate: 3600 },
      });
      if (response.ok) {
        const data = (await response.json()) as {
          plainLyrics?: string;
          trackName?: string;
          artistName?: string;
        };
        lyrics = data.plainLyrics ?? null;
        trackTitle = data.trackName ?? trackTitle;
        trackArtist = data.artistName ?? trackArtist;
      }
    }

    if (!lyrics) {
      return NextResponse.json({ error: "Lyrics not found for this track." }, { status: 404 });
    }

    const { template, answers } = plainLyricsToTemplate(lyrics);

    return NextResponse.json({
      title: trackTitle,
      artist: trackArtist,
      template,
      answers,
      plainLyrics: lyrics,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch lyrics." }, { status: 500 });
  }
}
