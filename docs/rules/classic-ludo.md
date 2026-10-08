# Classic Ludo rules (2–4 players)

This is the specification Phase 1 implements and tests. Rule numbers are referenced from tests.

## Board and positions

- Shared loop of **52 track cells**, travelled **clockwise**. Each colour owns one arm with a **start cell** and a **home lane**. Exact cells: [board-classic.md](../design/board-classic.md).
- Each player has **4 tokens**. A token's position is relative to its owner:

| Position | Meaning |
| --- | --- |
| `base` | In the yard, not on the board |
| `0 … 50` | On the shared track, counted from the owner's start cell (51 cells) |
| `51 … 55` | In the owner's private home lane (5 cells) |
| `56` | Finished, in the centre |

  Track cell = `(startOffset[colour] + position) mod 52`. Starts are 13 cells apart.
- **Safe cells:** the 4 start cells and the 4 star cells, each 8 cells after a start.

## Rules

1. Each player has 4 tokens.
2. A token leaves base only on a roll of **6**. It is placed on its start cell; this uses the roll.
3. Dice values are 1–6, generated only on the server.
4. Tokens move forward along the track by exactly the dice value.
5. Reaching the centre (56) requires the **exact** value; overshooting is not a legal move.
6. A finished token can never move again.
7. Landing on an opponent token on a non-safe track cell **captures** it: it returns to base.
8. No capture on safe cells; tokens of different colours may share them.
9. No capture inside home lanes (they are private).
10. No self-capture; your own tokens may share a cell.
11. Rolling a **6** grants another roll.
12. Capturing grants another roll.
13. Moving a token into the centre grants another roll.
14. A **third consecutive 6** in one turn forfeits: no move is made with it and the turn passes. Moves made with the first two sixes stand.
15. If no legal move exists, the turn passes automatically, after the roll is shown.
16. If exactly one legal move exists and **auto-move** is enabled, the server applies it, after the roll is shown.
17. If several legal moves exist, the player chooses.
18. A player wins when all 4 tokens finish.
19. The game ends on the first win, unless **full ranking** mode is on, in which case play continues until ranks are decided.

## Clarifications

- **Bonus rolls do not stack.** A move that both rolls a 6 and captures still grants one extra roll.
- **Consecutive-six counter** counts sixes within one player's uninterrupted turn. It resets when the turn passes or a non-6 is rolled.
- **Opening captures:** a token entering its start cell cannot capture there, because start cells are safe.
- **Turn order** follows seat order, which matches the direction of travel around the board.

## Open decisions (need sign-off before Phase 1 closes)

| # | Question | Proposed default |
| --- | --- | --- |
| D1 | **Direction of travel** on the 4-player square | **Resolved: traditional clockwise** (approved). Cell-by-cell geometry and diagrams in [docs/design/board-classic.md](../design/board-classic.md), awaiting final geometry sign-off before Phase 1. |
| D2 | Two opponent tokens of the same colour on one non-safe cell: capture both, or treat as a protected block? | Capture all opponent tokens on the cell (no blocks in v1) |
| D3 | Blocks or barriers (two own tokens stopping passage) | Off in v1; optional house rule later |
