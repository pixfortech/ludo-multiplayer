# Rooms and players (Phase 2B)

Private rooms are created, previewed and joined by code. Players get seats and colours, and the host manages the room until the game starts. Everything is stored in PostgreSQL through the `GameStore` ([persistence.md](persistence.md)). Nothing about a room lives only in server memory.

`RoomService` (`apps/server/src/rooms/roomService.ts`) is transport-agnostic. Socket.IO exposes it, with broadcasts, as described in [realtime.md](realtime.md) (Phase 2C).

## Layers

| Module | Responsibility |
| --- | --- |
| `rooms/roomService.ts` | Create, preview, join, authenticate, host controls, start, leave, close and archive. Turns each decision into one store write. |
| `rooms/validation.ts` | Turns untrusted input (`unknown`) into typed values or a precise `RoomError` |
| `rooms/seating.ts` | Seat and colour allocation |
| `rooms/lifecycle.ts` | The derived lifecycle, join blocking, and transition checks |
| `rooms/views.ts` | Allow-listed output shapes (`RoomView`, `RoomPreview`); nothing internal can leak by accident |
| `rooms/rateLimiter.ts` | Code-guessing and room-creation limits |
| `rooms/errors.ts` | `RoomError`: a stable `code`, a human message and safe `details` |
| `@ludo/shared-types` | `PLAYER_COLOURS`, `ROOM_STATUS_TRANSITIONS`, and the DTOs shared with the client (`RoomView`, `RoomPreview`, …) |

The engine is used only to create the initial game state at start. Rules are untouched.

## Creating a room

`createRoom({ hostName, maxPlayers, roomName?, colour?, autoMove?, rankingMode?, rules?, turnTimerSeconds?, visibility? }, { clientKey })`

1. **Validate.** Unknown fields are rejected, so typos never pass silently.
   - **Players:** 2–4 → OK; 5–15 → `unsupported-player-count` (in the data model, not playable yet); anything else → `invalid-player-count`.
   - **Rules:** only the implemented defaults are accepted. Anything else → `unsupported-rule`.
   - **Visibility and timers:** `visibility` must be `private`; turn timers must be 0 (both `unsupported-setting` otherwise).
   - **Names:** room name 0–40 characters, host name 1–24, after normalisation.
2. **Seat the host.** The host takes the preferred colour, or seat 0 (Crimson) for automatic allocation.
3. **Issue a credential.** A 256-bit secret is returned once; only its SHA-256 digest is stored.
4. **Write in one transaction.** The room and host are inserted together. A code collision draws a fresh code (up to 8 times, then `room-code-exhausted`).

The result is `{ room: RoomView, player, credential: { playerId, secret } }`. Nothing is written if validation fails.

## Previewing a room

`previewRoom(code, { clientKey })` is read-only. It returns:

- `code`, `name`, `status`, `lifecycle`, `maxPlayers`, `joinedCount`;
- `colours`: per colour, its seat, whether it's taken, and the holder's display name ("Crimson — Aman (taken)");
- `availableColours`, `occupiedSeats`, `hostName`;
- `joinable`, and `blockedReason` (`room-full` | `game-already-started` | `room-closed`) when it isn't.

**It never contains:** room or player ids, versions, timestamps, credential digests or secrets. A test checks the exact key set.

**Names are visible to anyone with the code.** Holding the code is the invitation, and players see each other's names anyway.

### Code-guessing protection

- **Code space:** 32⁶ ≈ 1.07 billion codes, drawn with secure randomness.
- **Uniform answer:** unknown and archived rooms give the same `room-not-found`.
- **Rate limits (per client key):**
  - lookups (preview or join): 60 per minute;
  - lookups of non-existent codes: 10 per 10 minutes;
  - room creation: 10 per 10 minutes.
- **Lock-out:** past the limit, every lookup is refused with `rate-limited` and `retryAfterSeconds`, even for a valid code, so a guesser learns nothing.
- **Malformed codes** (`invalid-room-code`) are rejected without touching the database.
- **Limitation:** the limiter is per process, with bounded memory. A multi-instance deployment needs a shared limiter (Batch 2E).

## Joining a room

`joinRoom({ code, displayName, colour?, credential? }, { clientKey })`. Checks, in order:

| Check | Error |
| --- | --- |
| Code format | `invalid-room-code` |
| Rate limit | `rate-limited` |
| Room exists and isn't archived | `room-not-found` |
| The caller presents a valid credential for an active member of this room | `already-member` (rejoin is Batch 2D's resume, not a second seat) |
| Game started (playing or paused) | `game-already-started` |
| Room finished or abandoned | `room-closed` |
| Room full | `room-full` |
| Name already used by an active member (case- and width-insensitive: "Ben" = "bEN" = "Ｂｅｎ") | `name-taken` |
| Colour not on this board / held by someone | `invalid-colour` / `colour-taken` (with `availableColours`) |

Each successful join creates a new player with its own id and credential. A second browser tab without the first tab's credential is therefore a different player, as the multi-tab design requires.

## Colours and seats

- **Colour and seat are tied:** on every board, colour *i* belongs to seat *i*, so choosing a colour chooses the seat.
  - **Classic board** (2–4 players): four seats and four colours.

    | Seat | Colour | Id | Corner |
    | --- | --- | --- | --- |
    | 0 | Crimson | `crimson` | top-left |
    | 1 | Royal Blue | `royal-blue` | top-right |
    | 2 | Emerald | `emerald` | bottom-right |
    | 3 | Golden Yellow | `golden` | bottom-left |

  - **Larger boards:** `coloursForRoom(n)` already extends to the 15-colour palette (one seat per player on boards for 5–15). Expanded gameplay itself is still refused.
- **Uniqueness:** each active player holds one seat and one colour. The server decides and the client only expresses a preference.
- **Automatic allocation** is deterministic. It picks the free seat farthest from every occupied seat; on a tie, the lowest seat wins.
  - **Classic fill order:** 0 → 2 → 1 → 3. The second player sits opposite the host, the traditional two-player layout.
  - **When the host chose a colour:** an auto guest sits opposite them (host Royal Blue → guest Golden Yellow).
- **Shared ids:** colour ids and names live in `@ludo/shared-types` (`PLAYER_COLOURS`). A design-tokens test checks they match the visual palette.

## Host controls

Every member operation takes an `AuthenticatedPlayer` from `authenticate({ playerId, secret })`:

- **Credential check:** constant-time comparison. Revoked credentials and players who left are refused.
- **Uniform failure:** every failure is the same `unauthenticated`.
- **No forgery:** the service only accepts identity objects it issued itself.
- **Fresh checks:** host rights and membership are re-read from the database on every call, never cached.

| Operation | Who | When | Notes |
| --- | --- | --- | --- |
| `getRoomView` | member | any | full `RoomView` with ids and `roomVersion` |
| `updateSettings` | host | lobby (else `settings-locked`) | any subset of the settings plus the room name; can't go below current members (`capacity-below-members`) |
| `transferHost` | host | not archived | the target must be another active member (`invalid-target`) |
| `removePlayer` | host | lobby | frees the seat, colour and name; the removed player's credential stops working |
| `startGame` | host | lobby with ≥ 2 players | see below |
| `closeRoom` | host | lobby, playing or paused | → `abandoned` |
| `archiveRoom` | host | finished or abandoned | → `archived`; the code stops working |
| `leaveRoom` | member | lobby, finished, abandoned | see "Host departure" |

Anyone else gets `not-host`, or `not-a-member` if they've left.

**Starting the game.**
- **Players:** everyone currently in the room plays, in seat order. A secure draw picks the first player. The host may start before the room is full, as in common Ludo apps.
- **One transaction:** the engine game, the session snapshot, event #1 (`game:start`, with an optional `requestId`) and the move to `playing`.
- **Exactly once:** a double-click starts once; the second call gets `game-already-started`.
- **Broadcasting:** the Socket.IO layer announces the start to the room ([realtime.md](realtime.md)).

### Host departure

When the host leaves, the host role passes to the longest-standing remaining member (earliest join, then lowest seat). The departure and the handover are written in **one** transaction, so the room never points at a host who has left.

When the last member leaves a lobby, the room becomes `abandoned` in that same transaction.

Leaving during a game is refused (`game-in-progress`). Mid-game disconnection, forfeits and pausing are Batch 2D.

## Lifecycle

The stored `rooms.status` is the only status. `waiting` and `ready` are **derived** from it (a lobby with fewer than 2 players, or with at least 2), so no second status can drift out of sync.

```
waiting ⇄ ready ──start──▶ playing ⇄ paused ──game over──▶ finished ──archive──▶ archived
   └──────────┴──── close / everyone leaves ────┴──────────▶ abandoned ──archive──▶ archived
```

| From | Allowed to |
| --- | --- |
| lobby | playing, abandoned |
| playing | paused, finished, abandoned |
| paused | playing, abandoned |
| finished | archived |
| abandoned | archived |
| archived | — |

The table is `ROOM_STATUS_TRANSITIONS` in `@ludo/shared-types`. It's enforced in three places:

- **The room service:** `invalid-transition`.
- **Both stores**, including the status change inside a game commit.
- **A database trigger** (migration 0002). New rooms must start in the lobby. A test compares the trigger with the table for all 36 status pairs.

## Concurrency and database guarantees

- **Atomic writes:** create, join, settings, host handover, leave and start are each one transaction. No partial rooms and no orphan players; both are tested by failing a statement part-way.
- **Optimistic concurrency:** every write carries the `room_version` it was computed from. The store locks the room row and refuses a stale version.
  - **Without `expectedRoomVersion`:** the service re-reads and decides again, so a racing join either succeeds against the new state or gets the precise reason.
  - **With `expectedRoomVersion`** (the client's last seen version): a stale write is reported as `version-conflict` instead of overwriting.
- **Database backstops** that hold even if application code is wrong:
  - seats, colours and names are unique among active players (partial unique indexes);
  - room codes are unique;
  - `archived_at` is set exactly when the room is archived;
  - `settings.maxPlayers` always equals `max_players`.
- **Tested races** (real PostgreSQL, real concurrent transactions):

  | Race | Result |
  | --- | --- |
  | 6 joiners for 3 places | exactly 3 succeed, 3 get `room-full` |
  | 3 players for one colour | 1 succeeds, 2 get `colour-taken` |
  | 2 players for the last place | 1 succeeds, 1 gets `room-full` |
  | 2 joins with the same name | 1 succeeds, 1 gets `name-taken` |
  | 2 settings edits from one version | 1 succeeds, 1 gets `version-conflict` |
  | double-clicked start | exactly one start event |

- **Outages:** an unreachable database gives `storage-unavailable`, without connection details.

## Errors

`RoomError.toJSON()` → `{ code, message, details }` is the only shape meant for clients. Codes, by group:

- **Input:**
  - `invalid-request`, `invalid-room-code`, `invalid-display-name`, `invalid-room-name`;
  - `invalid-colour`, `invalid-player-count`, `invalid-settings`.
- **Not yet supported:** `unsupported-player-count`, `unsupported-setting`, `unsupported-rule`.
- **Room state:**
  - `room-not-found`, `room-full`, `room-closed`;
  - `game-already-started`, `game-in-progress`, `settings-locked`, `not-enough-players`;
  - `invalid-transition`, `capacity-below-members`.
- **Membership:** `colour-taken`, `name-taken`, `already-member`, `unauthenticated`, `not-a-member`, `not-host`, `invalid-target`.
- **Infrastructure:** `version-conflict`, `rate-limited`, `room-code-exhausted`, `storage-unavailable`.

## Startup safety

`server.ts` → `bootstrap()` (`apps/server/src/startup.ts`) refuses to start, and exits with status 1, unless:

1. `DATABASE_URL` is set and is a `postgres://` or `postgresql://` URL;
2. PostgreSQL answers within 5 s;
3. the schema exactly matches this server's migrations: nothing pending, edited or unknown. Pending migrations name the fix (`npm run db:migrate`).

Only then does it accept connections. There is no in-memory fallback; `MemoryGameStore` is used only by unit tests.

Log lines go through `redactSecrets`, which strips connection strings and `password=` values. `/api/ready` answers 503 while the database is unreachable, so a load balancer stops routing players to that instance.

## Tests

| File | What it covers |
| --- | --- |
| `rooms/__tests__/roomService.pg.test.ts` | Full behaviour suite on real PostgreSQL (38), plus: reload with a new pool, rollback of a failed create or join, unreachable database, no secrets stored, trigger ↔ table for all pairs, consistency CHECKs |
| `rooms/__tests__/roomService.memory.test.ts` | The same 38-test suite on the memory store (parity) |
| `rooms/__tests__/validation`, `seating`, `rateLimiter`, `roomCode` | Pure unit tests |
| `__tests__/startup.test.ts` | Missing, blank or invalid `DATABASE_URL`; unreachable database; the real entry point exits 1 without printing the password; unmigrated, edited and newer schemas; healthy start with readiness; redaction |
| `persistence/__tests__/migrationsImmutable.test.ts` | Pins each migration's checksum, so editing an applied migration fails the build |
