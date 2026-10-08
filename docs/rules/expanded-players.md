# Expanded Ludo (5–15 players) and the 2-player rectangle

Classic rules apply unless stated here. Geometry is implemented in Phase 5; gameplay variants in Phase 6.

## Board shapes

| Players | Shape | Notes |
| --- | --- | --- |
| 2 | Rectangle | Intentional custom layout, not a two-sided polygon |
| 3 | Triangle | |
| 4 | Square | Traditional cross layout |
| 5–15 | Regular N-gon | Pentagon → pentadecagon |

## Generalising the classic layout

The classic square is read as: **N arms**, one per side, each pointing at a shared centre, with **N bases** in the corners between arms. Each arm carries three lanes: an outgoing track lane, the owner's home lane in the middle, and an incoming track lane. Turns between arms happen at the inner corners.

For an N-gon the same topology holds:

- one arm per edge, its axis running from the edge midpoint to the centre;
- one base per vertex region, with 4 token slots;
- the shared track runs around the perimeter of the arms;
- each home lane runs along its arm's axis to the central finish;
- start cells, star cells and home-entry cells sit at identical **relative** positions on every arm, so every player's path is congruent, and therefore fair.

**Rectangle (2 players):** two opposing arms on the long axis with a base at each end. The short sides carry a widened connecting track so the loop is continuous. Path length matches the classic lap so 2-player games feel like classic.

**Triangle (3 players):** same topology; vertex bases are inset to stay usable in the sharp corners.

## Path length and fairness

Every player must travel the same number of cells. Two candidate variants are shown below. **Decision required in Phase 5 (D4).**

| | A. Full lap | B. Fixed-distance lap |
| --- | --- | --- |
| Track | `S × N` cells (S = cells per arm, 13 in classic) | `S × N` cells |
| Distance to home lane | `S × N − 1` (all the way round) | Fixed `D` (≈ classic 51) for every N |
| Home lane location | On the owner's arm | On the arm reached after `D` cells (a fixed rotation, so each arm still hosts exactly one lane) |
| 15 players, S = 13 | 194 cells per lap: very long | ≈ 51 cells: classic pace |
| Interaction | Everyone crosses everyone | Local rivalries; still dense with 15 players |

Recommendation: **B for N ≥ 6**, A for N ≤ 5. It keeps game length bounded as players are added, and every path stays congruent. `S` may shrink for large N to keep the board readable; this is tuned with visual previews.

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
