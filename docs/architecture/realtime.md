# Real-time multiplayer (Phase 2C)

Resume, single-seat control, credential rotation, automatic pausing, restart recovery and retention (Phase 2D) are described in [sessions.md](sessions.md).

Persistent rooms are playable live over Socket.IO. The server is the only authority: it draws the dice, the Phase 1 engine decides what is legal, PostgreSQL commits every action, and only then are room members told.

## Layers

```
socket.io-client ──▶ socket/          transport: handshake auth, payload checks, rate limits, acks, presence
                       │
                       ├─▶ rooms/RoomService       create, preview, join, leave, host checks (Phase 2B)
                       └─▶ gameplay/GameplayService start, roll, move, snapshot, history (no Socket.IO)
                                 │   └─ ActionCoordinator: one action at a time per room (in-process)
                                 ├─▶ @ludo/game-engine     rules (unchanged)
                                 ├─▶ GameStore (PostgreSQL) atomic, version-checked commit
                                 └─▶ GamePublisher ──▶ socket/broadcaster  (after the commit only)
```

| Module | Responsibility |
| --- | --- |
| `shared-types/protocol.ts` | Event names, request and ack types, `PROTOCOL_VERSION = 2`, `MAX_PAYLOAD_BYTES` |
| `shared-types/game.ts` | Wire game state (`GameStateView`) and actions (`GameActionView`) |
| `shared-types/errors.ts` | Every error code a client can receive |
| `socket/socketServer.ts` | `attachRealtime`: handshake middleware, handlers, presence, broadcaster |
| `socket/socketAuth.ts` | Credential at connect time; rate-limit key from the connection, never from the client |
| `socket/payload.ts` | Envelope and field validation (unknown fields refused) |
| `socket/socketHandlers.ts` | One handler per event: validate, resolve the caller, call a service, acknowledge |
| `socket/broadcaster.ts` | Emits committed changes to the room's channel; never sends an older version than it already sent |
| `socket/presence.ts` | Which connections belong to which player (presence only) |
| `gameplay/gameplayService.ts` | Authoritative start, roll and move; idempotency; snapshots; history pages |
| `gameplay/stateProjection.ts` | Engine state → wire view (allow-list; recent history only) |
| `gameplay/actionCoordinator.ts` | Serialises one room's actions, and their broadcasts, in arrival order |

## Events

Every client → server event is `(request, ack)`, and every request carries a `requestId`.

| Event | Who | Request (besides `requestId`) | Ack data |
| --- | --- | --- | --- |
| `room:create` | unbound connection | host name, player count, settings, colour | `{ room, player, credential }` |
| `room:preview` | anyone | `code` | `{ preview }` |
| `room:join` | unbound connection | `code`, `displayName`, `colour?` | `{ room, player, credential }` |
| `room:leave` | member (lobby, or after the game) | `expectedRoomVersion?` | `{ left: true }` |
| `room:getState` | member | — | `{ room, game }` (recovery snapshot) |
| `game:start` | host | `expectedRoomVersion?` | `{ room, game }` |
| `game:roll` | current player | `expectedStateVersion` | `{ action, replayed, game }` |
| `game:move` | current player | `expectedStateVersion`, `tokenId` | `{ action, replayed, game }` |
| `game:getHistory` | member | `afterSeq?`, `limit?` (1–100) | `{ actions, nextAfterSeq, hasMore }` |

**Every ack** is `{ ok, requestId, roomVersion, stateVersion, data | error }`. On failure, `error` is `{ code, message, details }`; `code` is a typed `ProtocolErrorCode`, and the versions report the current state when relevant (e.g. on `stale-state`).

| Server → client | When |
| --- | --- |
| `server:hello` | On connect (protocol version) |
| `room:updated` | Membership, host, settings or status changed |
| `game:event` | A committed action, with the history entries it produced (roll, move, capture, bonus, turn, …) |
| `game:state` | The authoritative snapshot after each committed action |
| `game:finished` | The game ended: winner and ranking |
| `player:connected` / `player:disconnected` | Presence changed |

**State size.** `game:state` carries the last 20 history entries (`recentHistory`) and `historyLength`, never the whole log. Older actions come from `game:getHistory`.

**Ordering and gaps.** `stateVersion` increases by exactly 1 per action. A client that sees a gap, or reconnects, calls `room:getState`.

## Identity and authorisation

- **A connection becomes a player** in one of three ways:
  1. it creates a room;
  2. it joins one;
  3. it presents a credential in the Socket.IO handshake: `io(url, { auth: { credential: { playerId, secret } } })`.
- **Handshake credentials** are verified with Phase 2B's constant-time check before the connection is accepted. A wrong credential is refused with `connect_error` `unauthenticated`. Credentials never go in the URL.
- **What a binding means:** the connection is tied to one player and one room. The socket id is only a connection handle.
- **The acting player always comes from that binding.** Payloads can't name a player, a room or a die: any unexpected field is refused as `invalid-payload`. One player therefore can't act for another, and a member of one room can't act in another.
- **Re-checked on every action:** the services re-check membership and host rights against PostgreSQL each time.
- **The secret appears once:** in the create or join ack, to the connection that asked. It is never broadcast or logged; tests check every received event and every log line.
- **One connection, one room:** create or join on a bound connection gives `already-in-room`.

Reconnecting uses `room:resume` (or the same credential in the handshake): see [sessions.md](sessions.md) for single-seat control, takeover and rotation.

## Server authority and gameplay

- **Start:**
  - only the host can start, with 2–4 active players, each holding the colour that matches their seat;
  - the game can't start twice, and a finished game can't be restarted;
  - the first player is drawn by the server;
  - the session, event #1 and the move to `playing` are one transaction.
- **Roll:**
  - the server draws the die (secure randomness; tests inject a sequence at the service constructor only);
  - the engine applies the existing rules: a six's bonus, three sixes forfeit, no legal move, auto-move when exactly one token can move;
  - a roll the engine would refuse (wrong player, a token still to be chosen, game over) is refused before any die is drawn.
- **Move:**
  - the engine validates the token against the legal moves it computed: own tokens only, no finished tokens, exact home entry;
  - it applies captures, safe cells, home entry and bonus turns.
- **Handlers contain no rules.** Clients receive `turn.legalMoves` and only choose among them.

## Persistence, ordering and idempotency

1. **Idempotent retries.** If this player already committed this `requestId`, the original result comes back (`replayed: true`) and nothing is applied again: no new roll, no second move, no new broadcast. Reusing the id for a different action gives `request-id-reused`.
2. **Stale requests:** an `expectedStateVersion` that isn't current gives `stale-state` (with the current version).
3. **The engine decides** (see "Server authority and gameplay").
4. **Atomic commit:** `commitGameAction` writes the state and the event in one transaction, conditional on the state version.
   - **Lost race:** the losing action gets `stale-state`, even across server processes (tested with two server instances on one database).
   - **Same request in flight twice:** two copies racing are resolved by the unique request index and become a replay.
5. **Acknowledge and broadcast after `COMMIT` only.** A failed commit gives an error ack (e.g. `storage-unavailable`) and no broadcast; tested by failing commits at the store.

Within a process, the per-room `ActionCoordinator` runs one action at a time, so broadcasts go out in commit order. The broadcaster also never re-sends an older version. A finished game sets the room to `finished` in the same transaction and records finishing places.

## Disconnects

When a player's last connection closes:
- **Recorded:** their status becomes `disconnected`, and the room gets `player:disconnected`.
- **Untouched:** their seat, tokens, the turn order and the saved game.
- **No auto-skip:** no turn is skipped automatically (there is no timeout rule).

Reconnecting with the credential sends them `room:updated` and `game:state` snapshots, and tells the room `player:connected`.

## Limits and safety

- **Payloads:**
  - every event must be a plain object of at most 4096 bytes with a valid `requestId`;
  - Socket.IO drops any frame over 16 KiB and closes that connection;
  - a request without an ack callback is ignored.
- **Rate limits (in-process):**

  | What | Limit |
  | --- | --- |
  | events per connection | 60 per 10 s |
  | gameplay requests per player, across their connections | 40 per 10 s |
  | failed handshake credentials per client address | 20 per 10 min |
  | room creation and code lookups | the Phase 2B limits |

  The client address is the peer address. Set `TRUST_PROXY_HOPS=n` behind *n* trusted reverse proxies to use `X-Forwarded-For` instead; clients can't choose their own key.
- **Unexpected errors** become `internal-error` with an incident id. The details are logged redacted, and the connection and server keep running.
- **TLS:** the Node process speaks plain HTTP/WebSocket. In production it must sit behind a TLS-terminating proxy or load balancer, so clients use `https://`/`wss://`. With `NODE_ENV=production` the server refuses to start unless `CLIENT_ORIGIN` is set to https origin(s); wildcards are refused everywhere. API responses carry `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, a same-origin resource policy and `no-store`, and Socket.IO doesn't serve its client script.
- **Database:** pooled connections set `statement_timeout = 10 s`, so a stuck query can't block a room's action queue.

In 2D, a disconnected current player triggers a pause after a grace period ([sessions.md](sessions.md)).

**Multi-instance deployment needs (Batch 2E):**
- a shared rate limiter;
- shared presence;
- a Socket.IO adapter (e.g. Redis), so broadcasts reach clients connected to other instances.

Correctness doesn't depend on any of them: PostgreSQL arbitrates every action.

## Tests

| File | What it covers |
| --- | --- |
| `socket/__tests__/realtime.pg.test.ts` | 25 scenarios with real Socket.IO clients against a real server and PostgreSQL (see the list below) |
| `gameplay/__tests__/gameplayService.pg.test.ts` | The service with no transport: publishes only after commits, in order; nothing for rejected actions; a retried start is a replay |
| `__tests__/twoClient.e2e.pg.test.ts` | The real entry point as a separate process (source mode, or compiled with `LUDO_E2E_COMPILED=1`) with production dice; two clients play until the turn has changed hands many times; both clients and the database must match exactly |

The scenarios in `realtime.pg.test.ts`:

- **Rooms:** create, join, preview, full and invalid rooms, host-only start, one room per connection, leave.
- **Gameplay:**
  - roll and wrong-player roll;
  - legal, illegal and out-of-phase moves;
  - auto-move, three-sixes forfeit;
  - capture bonus, home bonus, game completion;
  - history paging.
- **Reliability:**
  - duplicate roll and move;
  - conflicting and stale actions, including across two server processes;
  - a failed commit gives no success broadcast;
  - convergence;
  - disconnect and reconnect.
- **Security:**
  - forged and invalid credentials;
  - identity claims in payloads;
  - anonymous actions;
  - malformed and oversized payloads;
  - rate limits;
  - no secrets in broadcasts or logs.
