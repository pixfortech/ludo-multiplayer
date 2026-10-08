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
| `npm run design:generate` | Regenerates the palette report and board diagrams in `docs/design/generated/` |

Every phase must pass `test`, `typecheck` and `build` before it is committed.

## Roadmap

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Reset and scaffold the monorepo; Higgsfield pipeline preparation | ✅ |
| 0.5 | Visual design system, 15-player palette, classic reference geometry, 2–15 topology, Higgsfield plan ([docs/design](docs/design/README.md)) | ✅ awaiting approval |
| 1 | Classic 2–4 player game engine with full rules and tests | Next |
| 2 | Rooms and sessions backend: create, join, resume, identity, persistence foundation | |
| 3 | Basic 2D client: lobby, room, classic board, dice, movement, reconnect | |
| 4 | Premium 2D UI: animation, responsive layouts, fullscreen, accessibility | |
| 5 | Polygon board geometry for 2–15 players, with previews and tests | |
| 6 | Expanded 5–15 player gameplay: fair paths, fast mode, power system foundation | |
| 7 | 3D renderer: lazy-loaded, same state, quality settings | |
| 8 | Persistence and resume polish: durable rooms, move history | |
| 9 | Audit and deployment preparation | |

The previous implementation is preserved on the `backup/old-ludo-at-reset` branch.
