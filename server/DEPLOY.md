# Deploying ShotFor.Me

The app has two deployable parts:

- **`client/`** → Vercel (Next.js).
- **`server/`** → a Docker container on your Hetzner box, behind Caddy for TLS.

The `shared/` workspace is not deployed on its own; it's compiled into both.

---

## Backend — Hetzner + Docker

### Why this shape

The server holds **all game state in memory** (rooms, players, round timers) and
keeps **long-lived WebSocket connections** open. It must run as a single
always-on process — no serverless, and **do not run more than one replica**
(rooms can't be shared across processes). A single small container is the right
fit.

TLS is required: the Vercel client is served over HTTPS, so it can only open a
**`wss://`** (secure) WebSocket. Caddy terminates TLS and proxies to the server.

### Prerequisites on the server

- Docker Engine + Compose plugin (`docker compose version` should work).
- Ports **80** and **443** open in the Hetzner Cloud Firewall and any host
  firewall (`ufw`).
- A DNS **A/AAAA record** (e.g. `api.yourdomain.com`) pointing at the box's IP.

### Steps

```bash
# On the server, get the code (git clone, or rsync/scp this repo up). The whole
# repo is needed — the image build pulls in the shared/ workspace too.
cd ball-knowledge/server     # all deploy files live here

# Configure environment.
cp .env.example .env
nano .env                 # set DOMAIN, ACME_EMAIL, SUPABASE_URL

# Build and start (server + caddy). The build context is the repo root (`..`),
# wired up in docker-compose.yml.
docker compose up -d --build

# Verify.
docker compose ps
docker compose logs -f server
curl https://api.yourdomain.com/health     # -> {"status":"ok"}
```

Caddy fetches a Let's Encrypt cert automatically on first start (needs ports
80/443 reachable + DNS resolving). The cert persists in the `caddy_data` volume.

### Updating after code changes

```bash
git pull        # or re-sync the files
docker compose up -d --build
```

### Configuration

All via `.env` (consumed by `docker-compose.yml`):

| Var                | Required | Purpose                                              |
| ------------------ | -------- | ---------------------------------------------------- |
| `DOMAIN`           | yes      | Public hostname; Caddy gets a TLS cert for it.       |
| `SUPABASE_URL`     | yes      | Project URL used to verify player JWTs (same project as the client). |
| `ACME_EMAIL`       | no       | Let's Encrypt expiry notices.                        |
| `SUPABASE_JWT_AUD` | no       | JWT audience; defaults to `authenticated`.           |

Optional game-loop tuning (set under `server.environment` in compose if needed):
`TOTAL_ROUNDS`, `ROUND_MS`, `COUNTDOWN_MS`, `ABANDON_MS`.

---

## Frontend — Vercel

- **Root Directory:** `client`
- **Install Command:** `npm ci` run at the repo root (Vercel does this when the
  project is linked to the repo root with `client` as the root dir) so the
  `@ball-knowledge/shared` workspace symlink resolves. The client compiles
  `shared` from source via `transpilePackages` — no separate build needed.
- **Environment variables:**

  | Var                             | Value                                  |
  | ------------------------------- | -------------------------------------- |
  | `NEXT_PUBLIC_WS_URL`            | `wss://api.yourdomain.com`             |
  | `NEXT_PUBLIC_SUPABASE_URL`      | your Supabase project URL              |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key                 |

  `NEXT_PUBLIC_WS_URL` **must** use `wss://` (not `ws://`) — see
  `client/lib/useGameClient.ts`.

---

## How `shared` resolves (why the build works)

`shared/package.json` uses export conditions so the same source serves every
consumer correctly:

- **bundler / client (Next) and `tsc`** → `src/index.ts` (TypeScript source).
- **Node runtime** (`node dist/index.js`, i.e. the Docker container) → the
  compiled `dist/index.js` via the `"node"` condition.
- **server dev** (`tsx watch --conditions development`) → `src/index.ts` for
  hot reload.

This is why the production container must build `shared` before `server` (the
Dockerfile does this), and why the dev experience is unchanged.
