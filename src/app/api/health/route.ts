import { NextResponse } from "next/server";
import { getGameManager } from "@/server/game-manager-instance";

export async function GET() {
  const manager = getGameManager();

  return NextResponse.json({
    ok: true,
    service: "lyric-victory",
    rooms: manager?.getStatus() ?? { activeRooms: 0, note: "Game manager not ready" },
  });
}
