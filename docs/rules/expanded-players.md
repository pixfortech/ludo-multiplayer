# Expanded Ludo (5–15 players) and the 2-player rectangle

Classic rules apply unless stated here. Geometry is implemented in Phase 5; gameplay variants in Phase 6.

## Board geometry and path length

Specified in [docs/design/board-polygon.md](../design/board-polygon.md):

- the universal topology that makes every seat's journey identical;
- the custom 2-player rectangle and 3-player triangle rules;
- the scalable ring board for 5–15 players, with per-N segment length, lap, safe cells and readability limits;
- the open decisions P1–P4.

That document supersedes the earlier "full lap vs fixed distance" sketch here. The proposal is now a full lap with the segment length scaled by player count, keeping laps at 60–75 cells.

## Fast-mode options (Phase 6, after the base engine is stable)

Auto-move when only one token can move, one token starting open, power cells, power cards, turn timer, skipping inactive players, catch-up mechanic.

## Power system foundation

Initial powers: **Boost** (extra spaces), **Shield** (protect a token for one round), **Swap** (swap with an opponent token, not on safe or home cells), **Rescue** (open a token without a 6), **Freeze** (opponent token skips one turn), **Jump** (advance to the next safe cell), **Trap** (mark a cell; landing there costs a penalty).

Constraints:

- A player holds at most 2 power cards and uses at most 1 per turn.
- The server validates every use.
- Powers never bypass the exact-roll home rule or capture safe-cell tokens, unless a mode explicitly allows it.
- Powers are typed, deterministic and unit-tested.

## Seat identities

Each seat has a unique colour **and** a unique symbol, so colour is never the only cue. The 15-identity palette and contrast checks are specified in the visual design phase.
