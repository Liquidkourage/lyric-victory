# Lyric Victory

Real-time party game platform where players guess missing lyric words live, then name the song. Built for three surfaces:

- **Host console** — queue songs, run rounds, push announcements
- **Player phones** — join with a room code, submit word and song guesses
- **TV display** — read-only fullscreen kiosk for the room (bar-distance legibility)

## Stack

- Next.js (App Router)
- Socket.io for live sync
- LRCLIB API for song search + lyric import
- Tailwind CSS

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The dev server runs through `server.ts`, which mounts both Next.js and Socket.io on the same port.

## Game flow

1. Host creates a game at `/host`
2. Host searches songs and builds a setlist
3. Players join at `/play` with the room code
4. TV display opens at `/display/[ROOMCODE]`
5. Host starts the game and opens word guessing — correct words reveal instantly on the board
6. Host manually advances rounds

## Lyric format

Use `{n}` for a blank with `n` **letters** (punctuation is ignored). Example:

```text
Hey {4}, don't make it {3}
```

Answers (comma-separated, in blank order): `jude, bad` — letters only, no punctuation.

When importing from LRCLIB, eligible words are blanked automatically for each round.

## Deploy to Railway

1. Push this repo to GitHub
2. Create a new Railway project from the repo
3. Railway will detect Node via Nixpacks
4. Ensure the service uses:
   - **Build command:** `npm run build`
   - **Start command:** `npm start`
5. Railway sets `PORT` automatically

`railway.toml` is included with a health check on `/`.

### Environment variables

No required secrets for MVP. Optional:

| Variable | Description |
|----------|-------------|
| `PORT` | Set automatically by Railway |
| `HOSTNAME` | Defaults to `0.0.0.0` |

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing page |
| `/host` | Create a game |
| `/host/[roomCode]` | Host dashboard |
| `/play` | Player join form |
| `/play/[roomCode]` | Player game UI |
| `/display/[roomCode]` | Public TV board |

## Notes

- Game state is in-memory on the server (good for small/medium concurrent rooms on a single instance)
- Host auth is a browser session token stored in `sessionStorage`
- Word guesses score by lyric rarity; common grammar words auto-reveal on the board

## Scripts

```bash
npm run dev    # Next.js + Socket.io dev server
npm run build  # Production build
npm run start  # Production server
npm run lint   # ESLint
```
