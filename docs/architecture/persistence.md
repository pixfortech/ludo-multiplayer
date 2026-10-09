# Persistence (Phase 2A)

Rooms, players, game sessions and an action log are stored in **PostgreSQL**. The rules engine (`@ludo/game-engine`) stays the only source of gameplay. The server stores its validated state snapshot and the authoritative actions that produced it.

## Choice of database layer

`pg` (node-postgres) with versioned SQL migrations and a typed repository, rather than an ORM:

- **Explicit control:** every write path depends on precise transactions, row locks (`SELECT … FOR UPDATE`) and conditional `UPDATE … WHERE state_version = $n`. Those are clearest written as SQL.
- **Small model:** four tables and a few dozen queries don't justify a code generator or a query builder.
- **Fewer moving parts:** no engine binaries to download (Prisma) and no codegen step. Everything builds offline with `tsc`.

## Schema (migration `0001_initial`)

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `rooms` | id (uuid), human code, name, host, max players (2–15), visibility, settings (jsonb), status, `room_version`, timestamps, expiry/archive | code format `^[A-HJ-NP-Z2-9]{6}$` and **unique**; status enum; `host_player_id` → players (deferred FK) |
| `players` | stable id, room, display name (1–24), seat (0–14), colour, kind (`remote` / future `local`), connection status, **credential digest + version + issued/revoked**, joined/last-seen/left, finish place | seat and colour **unique among active players** (partial indexes); digest exactly 32 bytes |
| `game_sessions` | one per room: full engine state snapshot (jsonb), `state_version`, phase, current player, settings, winner, ranking, engine schema version | primary key = room |
| `game_events` | action log: seq, player, action type, client request id, payload, resulting state version, time | `(room_id, seq)` unique; `(room_id, player_id, request_id)` unique → **idempotency** |
| `schema_migrations` | applied migration ids and checksums | — |

## Write paths and guarantees

- **Create room:** room and host are inserted in one transaction. On a code collision (unique violation) a fresh code is drawn, up to 8 attempts, then `room-code-exhausted`.
- **Room changes** (`addPlayer`, `markPlayerLeft`, `updateRoom`): each locks the room row, checks `room_version` (else `version-conflict`), writes, and increments the version, all in one transaction. Seat and colour clashes raise `seat-taken` / `colour-taken`; a full room raises `room-full`.
- **Start game:** the session row, event #1 and room status `playing` are written in one transaction.
- **Commit a game action** (`commitGameAction`), in one transaction:
  1. Reject a `(player, requestId)` that was already committed (`duplicate-request`).
  2. `UPDATE game_sessions … WHERE state_version = expected`. If no row matches, the result is `version-conflict`, or `duplicate-request` if the same request just won a race.
  3. Insert the event with the next `seq`. The row lock from step 2 serialises per room.
  4. Touch the room (and optionally change its status).
  5. `COMMIT`.

**The server must confirm an action to clients only after this resolves.** PostgreSQL's default `synchronous_commit = on` means the change has reached the write-ahead log before `COMMIT` returns.

- **Validation:** every state is validated with the engine's `deserializeGameState` before it's written *and* when it's loaded. A corrupted or tampered row raises `invalid-state` instead of resuming a broken game. The snapshot's `stateVersion` must match the row's.
- **Conflicts:** two conflicting actions can't both succeed, even from different server processes. Exactly one conditional update wins (tested with 5 simultaneous commits, and with 3 copies of one request).

## Credentials

Each player gets a 256-bit random secret, shown to the client once. Only its SHA-256 digest is stored; the secret is unguessable, so a slow hash adds nothing. Checks use constant-time comparison. Rotation replaces the digest and increments `credential_version`; revocation sets `credential_revoked_at`. The full resume and multi-tab design is Batch 2D.

## Recovery behaviour

| Situation | Result |
| --- | --- |
| Server process restarts | All rooms, players, sessions and events load from PostgreSQL. Nothing is held only in memory. |
| PostgreSQL crashes (process crash) | Every committed action survives (WAL recovery); in-flight uncommitted transactions are discarded. Tested with an immediate shutdown. |
| Commit fails part-way | The whole transaction rolls back: no partial state, no orphan event. Tested. |
| Two servers apply migrations at once | An advisory lock serialises them; each migration is applied exactly once. Tested. |
| Applied migration edited, or database newer than code | Startup migration refuses to run. |

Power-loss durability depends on the host's `fsync` behaviour and isn't covered by the process-crash test.

## Stores

- `PostgresGameStore`: production.
- `MemoryGameStore`: same contract, for fast unit tests of higher layers. **Not durable**, and never used when `DATABASE_URL` is set. The server will refuse to run multiplayer without a database (Batch 2B).

Both pass the same 22-test contract suite (`storeContract.ts`).

## Local setup

```bash
# Option A — Docker (optional)
docker compose up -d                      # PostgreSQL 16 on 127.0.0.1:5432
cp .env.example .env                      # DATABASE_URL for the compose database
# Option B — any PostgreSQL 14+: create a database and set DATABASE_URL

export DATABASE_URL=postgres://ludo:ludo_dev_only@127.0.0.1:5432/ludo
npm run db:migrate                        # applies pending migrations (safe to repeat)
```

Production: `npm run db:migrate:prod -w @ludo/server` (compiled), before starting the server.

## Tests and test databases

Tests **never** use `DATABASE_URL`.

| Environment | What the tests do |
| --- | --- |
| PostgreSQL binaries available (`PG_BIN`, `/usr/lib/postgresql/*/bin`, or PATH) | Each test file starts a **private cluster** (initdb in a temp directory, random 127.0.0.1 port; run as the `postgres` user when tests run as root), migrates it, and deletes it afterwards. Crash tests use it. |
| `TEST_DATABASE_URL` set | A uniquely named database is created on that server and dropped afterwards. Crash tests skip, with a warning. |
| Neither | PostgreSQL tests skip with a warning. Set `REQUIRE_POSTGRES_TESTS=1` in CI to make this a failure. |

Suites: `migrate.test.ts` (6), `postgresStore.test.ts` (contract 22 + recovery 2 + integrity 4), `memoryStore.test.ts` (contract 22), plus the engine's `sessionSerializer.test.ts` (17).
