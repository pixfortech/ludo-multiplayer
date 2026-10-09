# Phase 1 readiness: server-authoritative game engine

**Status: Phase 1 complete.** The engine is implemented as described in [game-engine.md](game-engine.md). This document is kept as the original plan.

## Gate checklist

| Item | Status |
| --- | --- |
| Clockwise classic geometry: reference diagram, per-seat paths, step table | ✅ prepared · ⏳ **your approval** |
| Position convention (step 0 = start, finish = 56; replaces the old 58) | ✅ documented · ⏳ **your approval** |
| Classic rules spec ([classic-ludo.md](../rules/classic-ludo.md)) | ✅ · ⏳ confirm D2 (capture all stacked opponents) and D3 (no blocks) for classic |
| Custom-mode rules ([custom-modes.md](../rules/custom-modes.md)) | ✅ v1 approved |
| Shared topology for 2–15 players (`@ludo/board-layouts/topology`) | ✅ implemented and tested (fairness, symmetry, safe density, classic consistency) |
| Geometry report 2–15 | ✅ generated |
| Monorepo, strict TypeScript, Vitest, lint, LFS guard | ✅ |
| Powers | ❌ out of scope (later phase) |

## Engine architecture (`packages/game-engine`)

- **Pure and deterministic:** `(state, action, dice?) → { state, events }`. No I/O, no clocks, no `Math.random`.
- **Topology-driven:** the engine imports `topologyFor`, `absoluteTrackIndex`, `isSafeIndex` and `stepZone` from `@ludo/board-layouts/topology`. It never imports geometry or design tokens, and never re-derives track indices. The same engine runs classic (4 seats), the 2-player options, the triangle and ring boards; Phase 1 tests classic fully and smoke-tests the other topologies.
- **Rulesets:** `classic` and `custom-v1` as configuration objects (bonus rules, auto-move, ranking). Identical behaviour today; kept separate because conventions vary.
- **Dice:** a `DiceSource` interface. The server uses `crypto.randomInt(1, 7)`; tests inject fixed sequences. The engine receives the value; it never generates one.
- **First player:** drawn by the server's secure RNG at game start and stored in state (and history), so restore and replay are exact.

### Modules (planned)

`types.ts` · `dice.ts` (DiceSource, fixed and crypto adapters) · `rules.ts` (ruleset configs) · `moveValidator.ts` (legal moves with outcomes: capture, safe, lane, finish, open) · `captureEngine.ts` · `homeEngine.ts` · `turnEngine.ts` (bonus, three sixes, pass, ranking) · `gameEngine.ts` (`createGame`, `applyRoll`, `applyMove`) · `sessionSerializer.ts` (versioned JSON, migrations) · `powerEngine.ts` (stub, later).

### State (draft)

```ts
interface GameState {
  schemaVersion: 1;
  stateVersion: number;                    // +1 per applied action; clients drop stale states
  ruleset: "classic" | "custom-v1";
  board: { playerCount: PlayerCount; twoPlayerBoard?: "rectangle" | "square" };
  players: { seat: number; identityId: string; tokens: TokenPosition[] }[]; // 4 each
  turn: {
    seat: number;
    phase: "awaiting-roll" | "awaiting-move" | "game-over";
    dice: number | null;
    consecutiveSixes: number;
    legalMoves: LegalMove[];               // computed by the server, sent to clients
  };
  ranking: number[];                       // seats in finishing order
  settings: { autoMove: boolean; rankingMode: "winner-only" | "full-ranking" };
}
type TokenPosition = { kind: "base" } | { kind: "step"; step: number } | { kind: "finished" };
```

**Events** for the client's animation queue: `rolled`, `opened`, `moved` (with the exact cell path), `captured` (all tokens), `entered-lane`, `finished`, `bonus-roll`, `three-sixes`, `turn-passed`, `auto-moved`, `won`. Animations consume events and never compute rules.

## Test plan (Phase 1)

| Suite | Covers |
| --- | --- |
| `dice.test.ts` | range 1–6, injected sequences, no client path to dice |
| `movement.test.ts` | traditional clockwise movement over the reference step table: every seat, every step → the cell in `classic-reference.md` |
| `opening.test.ts` | only a 6 opens; the token lands on its start (step 0) |
| `safe.test.ts` | starts and stars are uncapturable; shared occupancy allowed |
| `lane.test.ts` | turn-in at step 50, lane 51–55, no capture in lanes |
| `finish.test.ts` | exact roll to 56, overshoot illegal, finished tokens immovable |
| `capture.test.ts` | single and stacked capture → all to base; one bonus roll |
| `bonus.test.ts` | six, capture and finish bonuses don't stack; finish bonus not granted when the game ends |
| `threeSixes.test.ts` | the third six forfeits without moving; earlier moves stand |
| `autoMove.test.ts` | exactly one legal move → applied (with setting); none → pass; several → await choice |
| `turn.test.ts` | clockwise order, recorded first player, 2-player square seats 1 and 3 |
| `ranking.test.ts` | winner-only vs full ranking; finished players skipped |
| `serializer.test.ts` | round-trip, schemaVersion, restore yields identical legal moves |
| `topologies.test.ts` | the engine runs a seeded full game on every topology 2–15 without rule violations |
| `simulation.test.ts` | seeded bot games: every game terminates; distance and safe-cell invariants hold |

Room persistence and restoration (server) build on `sessionSerializer` in Phase 2. Phase 1 guarantees that the serialised state is complete and versioned.

## Explicitly not in Phase 1

Rooms, sockets, persistence storage, UI, 3D, powers, custom-board geometry (coordinates), and fast-mode options.
