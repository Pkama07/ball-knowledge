# ShotFor.Me

A multiplayer web game. Players join a room, the host picks a musical artist, and
~30-second song previews from that artist's discography play one at a time. Players
race to type the song's title; faster correct guesses earn more points. After a set
number of rounds, the highest score wins.

## Architecture

Three parts, as separate workspaces in this repo:

- **`client/`** — the browser UI. Next.js 15 (App Router) + React 19 + Tailwind CSS v4.
- **`server/`** — the authoritative game server. Node.js + TypeScript. Owns room
  state, runs the round timer, scores guesses, and broadcasts updates over WebSockets.
- **`shared/`** — TypeScript types shared by client and server: the domain model and
  the WebSocket message protocol. Imported as `@ball-knowledge/shared`.
- **database** — not yet set up (see "Open decisions").

Song data comes from Apple's free **iTunes Search API** — no API key, no auth. It
provides artist search, per-artist track lookup, and 30s `previewUrl` clips plus
album artwork. The client plays previews directly via the browser `Audio` element.

### Why the server is authoritative

The song title is the answer, so it must never reach the client before the round
ends. The server holds each round's full `Song` (including the title), sends clients
only what they need to play the clip (`previewUrl`), checks guesses, and reveals the
title in a `roundReveal` only after the round closes. Timing/scoring is server-side
so clients can't cheat the clock.

## Tech stack

| Area     | Choice                                                              |
| -------- | ------------------------------------------------------------------ |
| Language | TypeScript 5.9, `strict` everywhere, ESM (`"type": "module"`)      |
| Client   | Next.js 15.3, React 19, Tailwind v4 (via `@tailwindcss/postcss`)   |
| Server   | Node.js HTTP server today; WebSockets to be added                  |
| Dev      | `tsx watch` (server), `next dev` (client)                          |
| Data     | iTunes Search API (`itunes.apple.com`), accessed from the client   |

## Layout

```
ball-knowledge/
├── client/
│   ├── app/                # Next App Router (layout.tsx, page.tsx, globals.css)
│   ├── lib/itunes.ts       # iTunes Search API client (JSONP — see note below)
│   └── next.config.mjs     # transpilePackages: ["@ball-knowledge/shared"]
├── server/
│   └── src/index.ts        # HTTP server + /health; rooms map (WS logic TODO)
├── shared/
│   └── src/
│       ├── domain.ts       # Song, Player, Round, RoomState, GamePhase, GAME_DEFAULTS
│       ├── protocol.ts     # ClientMessage / ServerMessage discriminated unions
│       └── index.ts        # re-exports both
└── .gitignore
```

### Key types (in `shared/`)

- `domain.ts` — `Song`, `Player`, `Round`, `RoomState`, the `GamePhase` lifecycle
  (`lobby → loading → playing → reveal → finished`), and `GAME_DEFAULTS`
  (`totalRounds: 10`, `roundDurationMs: 30_000`).
- `protocol.ts` — every client→server and server→client message as a `type`-keyed
  discriminated union, so each side handles messages with one exhaustive `switch`.
  Use the `ClientMessageOf<T>` / `ServerMessageOf<T>` helpers to narrow by `type`.

When you add or change a message or a field that crosses the wire, edit `shared/`
first, then update both client and server to match.

## Current state vs. intended design

The scaffold is wired but the multiplayer game is **not built yet**:

- `client/app/page.tsx` is a **single-player prototype**: search an artist, list
  their preview clips with titles blurred, play/▶ and manually "Reveal". There are
  no rooms, no scoring, and no server connection yet — it talks straight to iTunes.
- `server/src/index.ts` only serves `/health` and holds an unused `rooms` map. No
  WebSocket layer, no game loop.
- `shared/` already defines the full domain + protocol the real game will use.

The job is to grow this into the room-based multiplayer game the protocol describes:
WebSocket rooms on the server, lobby/room UI on the client, server-driven rounds and
scoring.

## Conventions

- **ESM only.** Relative imports between `.ts` files use `.js` extensions
  (e.g. `import ... from "./domain.js"`) — required for Node ESM resolution.
- **Share types, don't duplicate.** Anything client and server both need lives in
  `shared/`. Note `client/lib/itunes.ts` defines its own `Artist`/`Track` (raw iTunes
  shapes); `shared` `Song` is the game's normalized form — keep them distinct.
- **iTunes uses JSONP, not `fetch`.** The Search API doesn't send reliable CORS
  headers, so `client/lib/itunes.ts` loads results via a `<script>` `callback`. Keep
  that pattern for any browser-side iTunes call. (If iTunes access moves server-side,
  plain `fetch` is fine there.)
- **Filter to playable tracks.** Only keep iTunes results with a `previewUrl`
  (`wrapperType === "track" && kind === "song"`); many entries have no clip.
- Tailwind utility classes for styling; custom tokens (`bg-panel`, `border-edge`,
  `bg-accent`) are defined in `client/app/globals.css`.

## Commands

Run from each workspace directory (there is no root `package.json` / workspace
runner yet — see "Open decisions"). Install deps per workspace.

```bash
# client/  → http://localhost:3000
npm run dev          # next dev
npm run build
npm run lint

# server/  → http://localhost:4000  (PORT env overrides)
npm run dev          # tsx watch src/index.ts
npm run typecheck    # tsc --noEmit
npm run build        # tsc → dist/
npm start            # node dist/index.js

# shared/
npm run typecheck
```

Verify the server with `curl http://localhost:4000/health`.

## Open decisions (not yet made — confirm before assuming)

- **Database**: none chosen or wired yet. Decide what actually needs persistence
  (e.g. game history, leaderboards, user accounts) vs. what can stay in-memory in the
  server (live room state). Pick the engine and add it as the third part of the stack.
- **Root tooling**: packages depend on each other via `"@ball-knowledge/shared": "*"`
  but there's no root `package.json` or workspace config (npm/pnpm workspaces). Adding
  one would let you install and run all three together.
- **WebSocket library**: server is plain `node:http` today; the realtime layer (`ws`,
  Socket.IO, etc.) is still to be chosen.
