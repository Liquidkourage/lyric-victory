import { NextResponse } from "next/server";
import type { SongSearchResult } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const response = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "LyricVictory/1.0 (https://github.com)" },
        next: { revalidate: 3600 },
      },
    );

    if (!response.ok) {
      return NextResponse.json({ results: [], error: "Search unavailable." });
    }

    const data = (await response.json()) as Array<{
      id: number;
      trackName: string;
      artistName: string;
      albumName: string;
      duration: number | null;
    }>;

    const results: SongSearchResult[] = data.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.trackName,
      artist: item.artistName,
      album: item.albumName,
      duration: item.duration,
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "Search failed." });
  }
}
