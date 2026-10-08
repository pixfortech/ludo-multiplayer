# Custom-mode rules (rectangle, triangle, 5–15 player rings)

**Status: initial rules approved (v1).** These apply to every non-square board: the 2-player rectangle, the 3-player triangle and the 5–15 player ring boards. Board structure is in [docs/design/board-polygon.md](../design/board-polygon.md); per-count numbers are in the [geometry report](../design/generated/geometry-report.md). Traditional square rules are in [classic-ludo.md](classic-ludo.md) and are deliberately kept separate, because Ludo conventions vary.

## Structure (every custom board)

- Each player has **4 tokens** and a private base.
- **Full perimeter lap:** every seat travels the whole shared track to its own turn-in cell (step `lap − 2`), then a 5-cell home lane, then the finish (step `lap + 4`). Every seat's journey is identical in length and in safe-cell pattern, enforced by the topology tests.
- **Safe cells:** every start is safe. Extra safe cells exist only where they repeat identically for every seat and keep density within 10–20% (rectangle: classic's 8 indices; triangle: start + 8; rings: start + star only when a side has ≥ 11 cells).

## Rules (v1)

| # | Rule |
| --- | --- |
| C1 | A token leaves base only on a **6**, onto its start cell (step 0); this uses the roll. |
| C2 | Tokens move forward by exactly the roll. |
| C3 | **Exact roll** is required to reach the finish; overshooting is not a legal move. |
| C4 | Finished tokens cannot move. |
| C5 | **Blocks are disabled:** tokens never block passage, whatever the colour or count. |
| C6 | Tokens of the same colour may share any cell. Tokens of different colours may share **safe** cells. |
| C7 | Landing on a non-safe track cell occupied by opponent tokens **captures all of them**: every captured token returns to its base. |
| C8 | Safe cells cannot be captured on. Home lanes and the finish are private and cannot be captured on. |
| C9 | **One bonus roll per move**, whatever happened: a capture (of any number of tokens), reaching the finish (unless that ends the game), or rolling a 6. Bonuses do not stack into multiple rolls. |
| C10 | **Three consecutive sixes** in one turn forfeit the turn: no move is made with the third six, and earlier moves stand. |
| C11 | **No legal move:** the turn passes automatically after the roll is shown. |
| C12 | **Exactly one legal move** and auto-move enabled: the server applies it after the roll is shown (≥ 350 ms reveal). |
| C13 | Several legal moves: the player chooses. A turn timer, if enabled, auto-selects deterministically (the most advanced movable token) when time expires. |
| C14 | A player wins when all 4 tokens finish. With **full ranking**, play continues until every place is decided; finished players are skipped. |
| C15 | Powers are **not** part of v1. |

## Turn order (deterministic and fair)

- Turns go **clockwise by seat**, the same direction tokens travel.
- **First player:** the server draws it with a cryptographically secure RNG when the game starts, and records it in the game state and move history. Replays and restores use the recorded value, never a new draw.
- Disconnected players keep their seat. Skipping inactive players is a later fast-mode option, not v1.
- All randomness (dice, first player) is server-side, and every value is recorded so a saved game restores exactly.

## Not yet decided (simulation first, Phase 6)

- Whether ring boards with short sides need extra safe cells or shorter laps; Monte-Carlo game-length measurements decide this.
- Fast-mode options for 6+ players (one token starting open, turn timer defaults, skip-inactive).
