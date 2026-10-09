# Game engine (`@ludo/game-engine`)

The single, server-authoritative source of classic Ludo rules (2–4 players on the approved square board). Pure and deterministic: **state in, action in, new state out**. No I/O, no clocks, no hidden randomness. Rules: [classic-ludo.md](../rules/classic-ludo.md). Board: [board-classic.md](../design/board-classic.md) (approved at `fd71ef1`, frozen).

## Modules

| Module | Responsibility |
| --- | --- |
| `types.ts` | `GameState`, `LegalMove`, `HistoryEntry`, `ActionResult`, error codes, config. All plain JSON. |
| `dice.ts` | `DiceSource`; `createCryptoDice` (Web Crypto, unbiased rejection sampling), `createFixedDice` (tests/replays), `drawIndex` (first player), `isValidDieValue` |
| `board.ts` | The engine's only view of geometry: `@ludo/board-layouts/topology` (track length, starts, safe cells, lane, finish). No path maths is duplicated. |
| `state.ts` | `createGame`, `cloneState`, `currentPlayer`, `findPlayer` |
| `moveValidator.ts` | `canTokenMove`, `getMovableTokens` (legal moves with consequences), `validateMove` |
| `captureEngine.ts` | `checkCapture` |
| `turnEngine.ts` | passing the turn clockwise, bonus rolls, `nextActivePlayerIndex` |
| `homeEngine.ts` | finishing, ranking, end of game |
| `history.ts` | append-only authoritative history |
| `gameEngine.ts` | the actions: `rollDice`, `moveToken`, and the `applyMove` transition |

## Using it (server)

```ts
const dice = createCryptoDice();
let state = createGame({ players: [{ id: "p1" }, { id: "p2" }], firstPlayerIndex: drawIndex(2) });
const rolled = rollDice(state, "p1", dice.roll()); // { ok, state, events } or { ok: false, error }
const moved = moveToken(rolled.state, "p1", tokenId); // when rolled.state.turn.phase === "awaiting-move"
```

- Every result is `{ ok: true, state, events }` (`events` = the new history entries, for client animation) or `{ ok: false, error, message, state }` with the **unchanged** input state.
- Error codes: `game-finished`, `unknown-player`, `not-your-turn`, `not-awaiting-roll`, `not-awaiting-move`, `invalid-dice`, `unknown-token`, `illegal-move`.
- `stateVersion` increases by exactly 1 per accepted action; clients discard older states.
- `createGame` throws `GameConfigError` for an invalid setup (fewer than 2 or more than 4 players, duplicate ids, invalid seats, bad first player).

## State

- **Players:** in clockwise seat order. Seat 0 is Crimson (top-left), then 1 top-right, 2 bottom-right, 3 bottom-left. Two players sit on seats 0 and 2 by default; explicit seats are allowed.
- **Tokens:** `step: null` means base; `0–50` is the shared track (0 = start cell); `51–55` the home lane; `56` home.
- **`turn`:** `phase` (`awaiting-roll` | `awaiting-move`), `dice`, `consecutiveSixes`, and the server-computed `legalMoves`.
- **Other fields:**
  - `lastRoll` and `lastAutoMove` (auto-move metadata for presentation; cleared by the next action);
  - `phase` (`playing` | `finished`), `ranking`, `winnerId`;
  - `history`;
  - `settings`: `autoMove` (default on) and `rankingMode` (`winner-only` default, or `full-ranking`).

## Turn flow

```
awaiting-roll ──rollDice(v)──▶ record roll; count sixes
   │  third consecutive six ─────────────▶ forfeit (no move) → turn passes
   │  no legal move:  v = 6 ─────────────▶ bonus roll (same player)
   │                  v ≠ 6 ─────────────▶ auto-pass → turn passes
   │  exactly one legal move + autoMove ─▶ auto-move (applyMove)
   └  otherwise ─────────────────────────▶ awaiting-move (legalMoves listed)
awaiting-move ──moveToken(id)──▶ applyMove
applyMove: move token → capture every opponent on a non-safe shared cell → home?
   → player finished? → game over (winner-only) or turn passes (full-ranking)
   → else bonus roll if six / capture / home (one roll, reasons listed) → else turn passes clockwise
```

## History entries

`roll`, `move`, `auto-move`, `capture`, `home`, `bonus-roll` (with reasons), `auto-pass`, `forfeit`, `turn` (next player and reason), `player-finished` (place), `win`, `game-over` (ranking). Each has a contiguous `seq`. Entries are append-only and shared between successive states (never mutated), which keeps each action linear in cost.

## Clarifications implemented

- **Opening** uses the 6 and places the token on step 0 without further movement; the 6's bonus roll applies.
- **A 6 with no legal move** still grants the bonus roll. The three-sixes forfeit caps the chain.
- **Stacked opponents** on a non-safe cell are all captured, for one bonus roll. This implements D2's proposed default, the same as approved custom-mode rule C7.
- **Blocks** are disabled (D3 proposed default).
- **Consecutive sixes** reset when a non-6 is rolled or the turn passes; a non-6 capture or home bonus continues the turn with the count at 0.
- **Full ranking:** finished players are skipped. The game ends when one unfinished player remains, who takes last place.

## Tests (`packages/game-engine/src/__tests__`, 95 tests)

| File | Covers |
| --- | --- |
| `dice` | 1 dice validity, fixed dice, crypto distribution (χ²), bias rejection, first-player draw |
| `opening` | 2 opening only on 6, start cells, auto-open vs manual choice; 3 base-token behaviour |
| `movement` | 4 shared track and wrap-around; 5 lane entry; 6 exact home; 7 overshoot; 8 home-token immovability |
| `capture` | 9 capture, stacked, self; 10 safe cells (all 8); 11 lanes and home; 14 capture bonus (single, with a 6) |
| `bonus` | 12 six bonus and clockwise order; 13 three-sixes forfeit and resets; 15 home bonus |
| `autoMove` | 16 auto-pass; 17 auto-move (metadata, capture, exact home, disabled, multiple choices) |
| `win` | 18 winner-only and full ranking; 19 finished game rejects every action |
| `geometry` | 20 each colour's sample journey played through the engine lands on the approved cells (literals) |
| `engine` | setup validation, error codes, immutability (deep-frozen input), determinism, JSON round trip, and 125 seeded full games across 2–4 players and settings, with invariants checked after every action |
