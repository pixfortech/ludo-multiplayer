# Architecture overview

## Layers

```
┌──────────────┐  actions (intent only)   ┌──────────────────────────────┐
│  apps/client │ ───────────────────────▶ │ apps/server                  │
│  renderers   │ ◀─────────────────────── │  rooms · sessions · sockets  │
│  2D / 3D     │  authoritative state     │        │                     │
└──────┬───────┘                          │        ▼                     │
       │ geometry only                    │  @ludo/game-engine (rules)   │
       ▼                                  │        │                     │
@ludo/board-layouts                       │        ▼                     │
       │                                  │  persistence (SQLite → PG)   │
       ▼                                  └──────────────────────────────┘
@ludo/shared-types  ◀── imported by every package and app
```

| Package / app | Responsibility | Must never |
| --- | --- | --- |
| `@ludo/shared-types` | Vocabulary: player counts, board shapes, settings, socket protocol | Contain behaviour beyond trivial helpers |
| `@ludo/game-engine` | Every rule: dice handling, legal moves, capture, safe cells, home entry, bonus turns, forfeits, wins, powers, serialization | Do I/O, read clocks, or call `Math.random` (dice come from an injected source) |
| `@ludo/board-layouts` | Logical track topology to visual coordinates for every shape; base slots, home lanes, safe-cell markers | Decide whether a move is legal |
| `apps/server` | Room lifecycle, player identity, reconnect, persistence, running the engine, broadcasting state | Trust any client-supplied outcome |
| `apps/client` | Lobby, room UI, 2D and 3D renderers, animation, socket client | Compute dice, legality, captures or turns |

## Server authority

Clients may only *request* an action: create, join, resume or leave a room; roll; select a token; use a power. The server:

1. authenticates the socket to a durable player ID,
2. checks it is that player's turn and phase,
3. runs the engine,
4. persists the new state and appends to move history,
5. broadcasts the new state (with a monotonically increasing `stateVersion`).

Clients discard any state older than the latest `stateVersion` they have applied. Animation is presentation only. It plays *toward* the authoritative state and never feeds back into it. A delayed visual reveal (for example, the dice animation before an auto-move) must not unlock actions the server has not granted.

## Module resolution

Every package exports a `source` condition pointing at `src/index.ts`, ahead of `types` and `default` (compiled `dist/`).

- **Typecheck, tests, client dev and build** use `source`: no build step, live reload across packages. This is configured via `customConditions` in tsconfig and `vitest.shared.ts` for Vite.
- **Server production build and runtime** use `dist/`. `npm run build` builds workspaces in dependency order: shared-types → game-engine → board-layouts → server → client.

## Board model (shared by both renderers)

The engine reasons only about **logical positions**: base, a track index, a home-lane index, finished. `@ludo/board-layouts` maps logical positions to coordinates for a given board shape. The 2D renderer projects those coordinates to SVG; the 3D renderer places meshes at the same coordinates on a plane. Switching renderers never touches game state.

**Generated images are never a coordinate system.** AI-generated artwork (boards, textures, backgrounds) is a skin laid over programmatic geometry. Generated 3D models are accepted only after inspection (scale, pivot, topology, materials).

## Persistence (planned, Phase 2 / 8)

A room record holds: room code, settings, players (durable IDs, names, colours, connection state), the serialized engine state, move history, phase, and timestamps. SQLite is used during development behind a repository interface, so PostgreSQL can be swapped in for deployment.

## Planned folders

These are added in the phase that needs them; empty placeholder folders are not committed.

```
apps/server/src/   socket/ rooms/ sessions/ persistence/ auth-lite/ reconnect/
apps/client/src/   routes/ components/{board,game,lobby,ui}/ renderers/{2d,3d}/ socket/ state/
packages/game-engine/src/   dice rules moveValidator gameEngine turnEngine captureEngine homeEngine powerEngine sessionSerializer
packages/board-layouts/src/ classicSquareLayout polygonLayout layoutTypes geometry
packages/ui/       shared UI primitives (Phase 4)
```
