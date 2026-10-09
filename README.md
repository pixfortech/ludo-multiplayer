# Ludo Platform

A professional, server-authoritative multiplayer Ludo game.

- **Classic Ludo** for 2–4 players, with every traditional rule implemented and tested.
- **Expanded Ludo** for 5–15 players on polygon boards (pentagon → pentadecagon).
- **Board shape follows player count:** rectangle (2), triangle (3), square (4), pentagon (5) … pentadecagon (15).
- **Play anywhere:** everyone on one screen, or each player on their own device via cloud rooms.
- **Rooms that last:** create or join by code or link, reconnect after a refresh, and resume saved games later.
- **Two renderers:** a fast premium 2D board (SVG) and an optional 3D board (React Three Fiber), both drawing the same layout data.

## Principles

1. **The server is the only authority.** Dice, legal moves, captures, turns, powers and wins are decided by the game engine running on the server. Clients render state and request actions.
2. **Rules are pure and tested.** `@ludo/game-engine` is deterministic TypeScript with no I/O. Randomness is injected, so every rule can be tested with forced dice.
3. **Geometry is separate from rules.** `@ludo/board-layouts` turns a board shape into coordinates. Both renderers consume it, and neither renderer contains game logic.
4. **Visual assets decorate, never define.** Generated artwork and models are skins over programmatic geometry (see [docs/architecture/overview.md](docs/architecture/overview.md)).

## Repository layout

```
apps/
  client/            React + Vite + Tailwind web client
  server/            Express + Socket.IO authoritative server
packages/
  shared-types/      Types and constants shared by every layer
  design-tokens/     Palette, symbols, colour science, UI and motion tokens
  assets/            Asset manifest schema, validation, resolver with fallbacks
  game-engine/       Pure rules engine (server-authoritative)
  board-layouts/     Board geometry for 2–15 players
assets/              Source tree for generated and hand-made art/audio (+ manifest.json)
docs/
  architecture/      System design
  design/            Design system, board specs, visual pipeline (index: docs/design/README.md)
  rules/             Rule specifications (classic and expanded)
  qa/                Test plan
```

Visual assets are produced through Higgsfield under an explicit approval and cost-control workflow ([docs/design/higgsfield-integration.md](docs/design/higgsfield-integration.md)). The game never depends on them: every visual has a procedural fallback, and nothing in build, test or runtime contacts Higgsfield.

## Getting started

The server requires PostgreSQL (14+): it refuses to start without a reachable, migrated database set in `DATABASE_URL`. See [docs/architecture/persistence.md](docs/architecture/persistence.md) for local setup (Docker optional), `npm run db:migrate`, and how tests get a disposable database.

Requires Node.js 22 or newer (`.nvmrc` pins 22). Install [Git LFS](https://git-lfs.com) (`git lfs install`) before committing binary assets; see [docs/design/asset-pipeline.md](docs/design/asset-pipeline.md).

```bash
npm install
npm run dev        # server on :3001, client on :5173 (proxied)
```

| Script              | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Builds the packages, then runs server and client with live reload |
| `npm run test`      | Runs Vitest in every workspace                    |
| `npm run typecheck` | Runs strict `tsc` in every workspace              |
| `npm run build`     | Builds packages, server and client in dependency order |
| `npm run lint`      | Runs ESLint across the repo                       |
| `npm run db:migrate` | Applies pending database migrations (`DATABASE_URL`) |
| `npm run design:generate` | Regenerates the palette report and board diagrams in `docs/design/generated/` |

Every phase must pass `test`, `typecheck` and `build` before it is committed.

### Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs every push to `fresh/ludo-rebuild` and every pull request on **Ubuntu and Windows** with **Node.js 24** and **PostgreSQL 17**.

- **Steps:** `npm ci`, typecheck, lint, build, the full test suite with `REQUIRE_POSTGRES_TESTS=1`, then the startup, two-client and restart tests against the compiled server.
- **Strict checks:** `scripts/ci/run-checked.mjs` fails a step on any skipped or todo test, harness skip warning, unhandled error or time-out, even if the test command exits 0.
- **Safety:** the workflow has read-only permissions and uses no secrets. Every database test runs on a throwaway cluster on the runner.

See [docs/qa/phase-2e.md](docs/qa/phase-2e.md) for the backend QA report.

### Database tests

`npm run test` needs PostgreSQL **server binaries** (`initdb`, `pg_ctl`; version 14 or newer, 16 and 17 tested). It never uses `DATABASE_URL` and never touches your development or production database.

- **Private cluster:** each test file starts its own private PostgreSQL in the system temp directory on a random `127.0.0.1` port, and deletes it afterwards.
- **Where it looks for the binaries:** in this order:
  1. `PG_BIN_DIR`;
  2. `PATH`;
  3. common install locations, newest version first:
     - Windows: `C:\Program Files\PostgreSQL\<version>\bin`
     - macOS: Homebrew `postgresql@<version>`, Postgres.app
     - Linux: `/usr/lib/postgresql/<version>/bin`, `/usr/pgsql-<version>/bin`
- **Alternative:** set `TEST_DATABASE_URL` to an admin database (e.g. `/postgres`) on a test server. The tests then create a throwaway `ludo_test_*` database there and drop it afterwards. It must not point at the `DATABASE_URL` database.
- **If PostgreSQL is missing:** the database suites are skipped with a prominent warning and setup instructions. With `REQUIRE_POSTGRES_TESTS=1` (CI, release checks) they fail instead.

### Running on Windows (PowerShell)

No WSL, Git Bash or Docker is needed. Paths with spaces are fine.

1. **Install and verify PostgreSQL** (installer from <https://www.postgresql.org/download/windows/>, version 14 or newer):

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\initdb.exe" --version   # initdb (PostgreSQL) 17.x
   & "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" --version
   Get-Service postgresql*                                        # the installer's service, used by the dev server only
   ```

2. **Executable discovery.** The tests find `C:\Program Files\PostgreSQL\<version>\bin` automatically. For a non-standard location, or to pick a version:

   ```powershell
   $env:PG_BIN_DIR = "C:\Program Files\PostgreSQL\17\bin"                                       # this session
   [Environment]::SetEnvironmentVariable("PG_BIN_DIR", "C:\Program Files\PostgreSQL\17\bin", "User")  # permanently (new terminals)
   ```

3. **Environment for the dev server.** Create a development database with the `postgres` superuser password you chose in the installer:

   ```powershell
   $psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
   & $psql -U postgres -h 127.0.0.1 -c "CREATE ROLE ludo LOGIN PASSWORD 'ludo_dev_only';"
   & $psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE ludo OWNER ludo;"
   $env:DATABASE_URL = "postgres://ludo:ludo_dev_only@127.0.0.1:5432/ludo"
   ```

4. **Apply migrations:**

   ```powershell
   npm run db:migrate
   ```

5. **Run all tests:**

   ```powershell
   $env:REQUIRE_POSTGRES_TESTS = "1"   # fail rather than skip if PostgreSQL cannot be found
   npm run test
   npm run typecheck; npm run build; npm run lint
   ```

   The tests start their own temporary PostgreSQL. They don't use the Windows service or `DATABASE_URL`. To use a running server instead, point `TEST_DATABASE_URL` at its admin database:

   ```powershell
   $env:TEST_DATABASE_URL = "postgres://postgres:<password>@127.0.0.1:5432/postgres"
   ```

   It creates and drops `ludo_test_*` databases. Never point it at your development or production database.

6. **Start the development server** (same PowerShell session, so `DATABASE_URL` is set):

   ```powershell
   npm run dev   # server on :3001, client on :5173
   ```

   The server refuses to start without a reachable, migrated database.

Variables set with `$env:` last for the current terminal only. `Remove-Item Env:TEST_DATABASE_URL` clears one.

## Roadmap

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Reset and scaffold the monorepo; Higgsfield pipeline preparation | ✅ |
| 0.5 | Visual design system, 15-player palette, classic reference geometry, 2–15 topology, Higgsfield plan ([docs/design](docs/design/README.md)) | ✅ geometry approved |
| 1 | Classic 2–4 player game engine with full rules and tests ([engine](docs/architecture/game-engine.md)) | ✅ |
| 2 | Rooms and sessions backend: create, join, resume, identity, persistence foundation | In progress: 2A persistence ✅, 2B rooms and players ✅ ([rooms](docs/architecture/rooms.md)), 2C real-time gameplay ✅ ([realtime](docs/architecture/realtime.md)), 2D resume and recovery ✅ ([sessions](docs/architecture/sessions.md)), 2E CI and QA ✅ ([QA](docs/qa/phase-2e.md)) |
| 3 | Basic 2D client: lobby, room, classic board, dice, movement, reconnect | In progress: 3A app shell, home, create and join, live lobby, sessions ✅ ([client](docs/architecture/client.md)); 3B board, dice and moves next |
| 4 | Premium 2D UI: animation, responsive layouts, fullscreen, accessibility | |
| 5 | Polygon board geometry for 2–15 players, with previews and tests | |
| 6 | Expanded 5–15 player gameplay: fair paths, fast mode, power system foundation | |
| 7 | 3D renderer: lazy-loaded, same state, quality settings | |
| 8 | Persistence and resume polish: durable rooms, move history | |
| 9 | Audit and deployment preparation | |

The previous implementation is preserved on the `backup/old-ludo-at-reset` branch.
