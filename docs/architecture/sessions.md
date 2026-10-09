# Sessions, resume and recovery (Phase 2D)

A player can refresh, close the browser, lose the network or outlive a server restart, and come back to exactly the same seat and game. Everything that matters is in PostgreSQL:

- tokens, dice, turn and history (the validated engine snapshot);
- room status and pause reason;
- membership, colour and seat;
- credentials.

The server process holds only presence and timers.

## Identity

| Concept | What it is |
| --- | --- |
| **Player id** | Stable per seat (uuid). Public within the room, and never enough on its own to act. |
| **Credential** | `{ playerId, secret }`: a 256-bit secret, given to the client once (create, join, rotation). Only its SHA-256 digest is stored, and it is checked in constant time. |
| **Session epoch** | A counter on the seat (`players.session_epoch`), moved on every time a connection takes control. Every action is authorised under the epoch it was issued with. |
| **Connection** | A Socket.IO socket: a transport handle only, never an identity. |

**Resume** (`room:resume`, or the same credential in the Socket.IO handshake `auth`):

1. Verify the credential: constant-time check of the digest.
   - **Unknown or wrong secret:** `unauthenticated`.
   - **Right secret, but the player left or was removed:** `session-expired` (`reason: "left"`). Leaving revokes the credential in the same transaction.
   - **Right secret, archived room:** `session-expired` (`reason: "expired"`).
2. Claim the seat for this connection (see "One controlling connection").
3. Load the latest committed room and game from PostgreSQL. The game snapshot is re-validated, including its schema version.
4. Join the room's broadcast channel and mark the player connected (`player:connected`).
5. If the game was paused waiting for this player, resume it (`game:resumed`).
6. Acknowledge with:
   - the room and game snapshot, with versions;
   - this player's view;
   - `missedActions`: the committed actions after `knownStateVersion`, when there are at most 100; otherwise `null`, and the snapshot is what counts.

Resume never creates a player. Resuming again from the connection that already holds the seat is a no-op returning the snapshot, so a retried resume is harmless.

**Stale clients:** the server never rolls state back. A client holding an older `stateVersion` (for example, mid-way through a dice or auto-move animation) replaces it with the snapshot and keeps any newer events. A request computed from an old version is refused with `stale-state`.

## Credential rotation

Rotation has two steps, so a lost acknowledgement can never lock a player out:

1. `session:rotate` (on the controlling connection) returns a new secret, stored as *pending*. The current secret keeps working.
2. `session:confirmCredential { secret }` promotes the pending secret. Using it to resume also promotes it. From then on, only the new secret works.

Promotion is a compare-and-swap in PostgreSQL (`WHERE pending_credential_hash = $presented`), so concurrent confirmations or resumes promote at most once; the loser gets `credential-conflict`. Rotating again replaces an unconfirmed pending secret. Revocation happens when a player leaves or is removed (in the same transaction), and when a room is archived (credentials then report `session-expired`). Secrets never appear in broadcasts or logs; tests check every event and log line.

## One controlling connection per seat

Exactly one connection controls a seat.

| Situation | Result |
| --- | --- |
| A second connection resumes a seat that is controlled elsewhere | `session-in-use` (the handshake refuses with `connect_error` `session-in-use`) |
| …with `takeover: true` | Control moves: the session epoch moves on, and the old connection gets `session:ended { reason: "replaced" }` and is detached |
| An old connection acts after a takeover (even an action already queued, even in another server process) | Refused: `session-replaced`. Its epoch is stale, and this is checked against PostgreSQL inside the room's action slot. |
| The new connection retries a request the old one committed | The committed result is returned (`replayed: true`); nothing moves twice |
| Two resumes at the same moment | Exactly one wins; claims are serialised per player |
| Different players in two tabs of one browser | Independent seats, each with its own credential |

### Guidance for the browser UI

- **`localStorage`:** keep each seat's credential, keyed by room code: `{ roomCode, playerId, secret, displayName }`. It survives closing the browser; `sessionStorage` alone does not.
- **`sessionStorage`:** mark which seat *this tab* controls. A refreshed tab finds its marker and resumes without `takeover`.
- **A new tab** finds credentials in `localStorage` but no marker. Offer two choices:
  - "Continue as Asha here": resume with `takeover: true`, and the other tab shows "continued in another tab";
  - "Join as a new player": `room:join`, which creates a separate seat and credential.
- **On `session:ended`:**
  - `replaced`: stop sending actions and show "continued elsewhere";
  - `left` or `expired`: drop the stored credential.
- **Rotation:** after `session:rotate`, write the new secret to storage *before* calling `session:confirmCredential`.
- **TLS:** use `wss://`, and never put credentials in URLs.

## Disconnects and pausing

| Room status | `pause_reason` | Meaning | Who ends it |
| --- | --- | --- | --- |
| `playing` | — | Running | — |
| `paused` | `connection-lost` | The player whose turn it is has been away longer than the grace period (`RECONNECT_GRACE_SECONDS`, default 15) | That player resuming (automatic), or the host (`game:resume`) |
| `paused` | `host` | The host paused deliberately (`game:pause`) | The host (`game:resume`) |
| `finished` | — | The engine reported game over (ranking stored) | Archival |
| `abandoned` | `ended_reason`: `closed-by-host` / `everyone-left` / `expired` | Ended without a result | Archival |
| `archived` | — | Retained read-only; credentials report `session-expired` | — |

The engine's `phase` (`playing` / `finished`) is the game's terminal state. Pausing is a room lifecycle status, never stored in the engine state, so a pause doesn't change `stateVersion`.

**When a connection drops:**
- **Recorded:** the player becomes `disconnected` and the room gets `player:disconnected`.
- **Untouched:** seat, tokens, turn order and saved game. Nobody is removed and no turn is skipped.
- **When it is that player's turn:** if the player has no controlling connection when the turn reaches them, or loses it during their turn, a grace timer starts. When it fires, the server re-checks against PostgreSQL that the room is still playing, it is still that player's turn and they are still away. Then it commits `paused` / `connection-lost` and broadcasts `room:updated` + `game:paused`.
- **While paused:** rolls and moves are refused with `game-paused`. The commit itself also re-checks the status under the room lock, so a pause can't race a move.
- **When they come back:** they claim the seat, the game resumes (`game:resumed`), and it is still their turn.

## Departure and host policies

| Case | Policy |
| --- | --- |
| Leaving a waiting room | `room:leave`: seat, colour and name freed; credential revoked; host handed to the longest-standing member; the last one out abandons the room (`everyone-left`) |
| Leaving an active game | Not a lobby action: `room:leave` is refused (`game-in-progress`). Disconnecting is always safe; the game pauses when their turn comes. |
| Forfeiting | **Not implemented, pending approval** (see below) |
| Host disconnects | Remains host. Play continues for others; host-only actions wait until they return. |
| Host leaves for good | Lobby: `room:leave` hands over automatically. Mid-game: `room:transferHost` first, then disconnect. |
| Host returns later | Resumes as host with the same credential |
| Everyone disconnects | Nothing changes except presence. A running game pauses for its current player after the grace period; every saved state remains, ready to resume within the retention period. |
| A game stuck waiting for someone who never returns | The host can `room:close` (abandoned, `closed-by-host`) |

### Forfeit (needs a decision)

Forfeiting needs a new engine rule: today a player only leaves the turn order by finishing. The options are below; none is implemented until approved.

1. **Withdraw:** the player's tokens are removed from the board, the turn order skips them, and they take last place. Captures against their tokens become impossible.
2. **Freeze:** tokens stay on the board as obstacles (capturable), and the turn order skips them; last place.
3. **Timeout forfeit:** after N minutes of a connection-lost pause, apply 1 or 2 automatically (needs a configurable `forfeitAfterMinutes`, off by default).

## Persistent recovery and retention

- **Restart:**
  1. On start, the server marks every player disconnected; with a single instance, no connection survived.
  2. It gives each running game's current player a fresh grace period.
  3. Players resume with their stored credentials and get the exact committed state.

  Tested with real processes: play, stop the process, start a new one on the same database, resume both players, continue playing. Clients and the database end up identical, with every action recorded exactly once.
- **Retention:** rooms are never deleted by the server. A sweep (every `RETENTION_SWEEP_MINUTES`, default 60, and once at startup) works through the lifecycle:

  | Rooms | Inactive for | Become |
  | --- | --- | --- |
  | lobby | `ROOM_RETENTION_LOBBY_DAYS` (30) | `abandoned`, `expired` |
  | playing or paused | `ROOM_RETENTION_ACTIVE_DAYS` (90) | `abandoned`, `expired` |
  | finished or abandoned | `ROOM_RETENTION_ENDED_DAYS` (30) | `archived` (credentials stop working) |

  - **Expiry counts as activity:** an expired room is archived 30 days later, not at once.
  - **Locked rooms are skipped:** the sweep uses `FOR UPDATE SKIP LOCKED`, so a room locked by an in-flight operation (a move being committed, a join) is skipped and re-checked next time.
  - **Commits re-check:** a game commit that arrives after expiry is refused (`room-closed`).
  - **Deletion:** removing archived rows for good is a deliberate, separate decision; there is no automatic purge.

## Events added in 2D

| Client → server | Ack data |
| --- | --- |
| `room:resume { credential, takeover?, knownStateVersion? }` | `{ room, game, player, missedActions }` |
| `session:rotate {}` | `{ credential }` (pending) |
| `session:confirmCredential { secret }` | `{ credentialVersion }` |
| `game:pause {}` / `game:resume {}` (host) | `{ room, changed }` (`changed: false` if already in that state) |
| `room:transferHost { playerId }` / `room:close {}` (host) | `{ room }` |

| Server → client | When |
| --- | --- |
| `game:paused { pause: { reason, playerId, since } }` | After a pause is committed |
| `game:resumed` | After a resume is committed |
| `session:ended { reason: "replaced" \| "left" \| "expired" }` | This connection lost its seat |

All requests carry `requestId`; acks carry `roomVersion` / `stateVersion`; nothing is acknowledged or broadcast before its transaction commits.

## Limits (Batch 2E)

- **Per-process state:** presence, the single-controller registry, grace timers and rate limits live in one process. The session epoch already makes control safe across processes, and PostgreSQL arbitrates every action.
- **Multi-instance deployment needs:**
  - shared presence (e.g. heartbeats in the database or Redis);
  - a Socket.IO adapter for broadcasts;
  - a leader for grace timers and the retention sweep, and a rule for resetting presence that doesn't assume a single instance.
