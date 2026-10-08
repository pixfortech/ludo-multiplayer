# Board geometry for 2–15 players

Every board is generated mathematically by `@ludo/board-layouts`. No image is ever a coordinate system. The 4-player square is traditional Ludo ([board-classic.md](board-classic.md)). The 2-player rectangle and the 3-player triangle are explicit custom variants. 5–15 players use the scalable **ring board**.

## Universal topology (all variants)

Every board, whatever its outline, is the same abstract structure. This is what guarantees fairness:

- A shared **track loop** of `N × S` cells: one segment of `S` cells per seat, travelled clockwise.
- Seat *k* **starts** at offset 0 of segment *k*. Its **turn-in cell** is at step `lap − 2`, the second-to-last cell before its own start, exactly as in classic (step 50 of 52).
- A private **home lane** of **5 cells** from the turn-in cell toward the centre, then the **finish**.
- Step numbering: `0 … lap−2` track, `lap−1 … lap+3` lane, `lap+4` finish. Classic: 0–50, 51–55, 56.
- **Rotational symmetry:** seat *k*'s whole path (cells, safe cells, lane) is seat 0's path rotated by `k × 360°/N` (or mirrored, for the rectangle). Every seat therefore has an identical journey. Tests assert this for every layout, as they already do for the classic square.
- Safe cells: every start, plus **star cells** when the segment is long enough, at offset `round((S − 2) × 8/11)` (= 8 in classic). Target safe density is **10–20%** of track cells (classic 15.4%).

## 2 players: rectangle (custom)

An intentional landscape board, not a degenerate polygon.

| Parameter | Value |
| --- | --- |
| Grid | 19 columns × 9 rows (portrait phones show it rotated 90°; the geometry is unchanged) |
| Track | the 52-cell perimeter loop of the grid, clockwise |
| Lap | 52, the same pace as classic |
| Seat 1 | start r2c0 on the left end; turn-in r4c0 (step 50); lane r4c1 → r4c5; finish at the centre's left |
| Seat 2 | the 180° rotation: start r6c18; turn-in r4c18; lane r4c17 → r4c13 |
| Start separation | 26 (half a lap) |
| Safe cells | starts (abs 0, 26), stars (8, 34), plus neutral stars (13, 21, 39, 47). That's **the same 8 absolute safe indices as classic**, so tactics feel identical. |
| Bases | inside the loop: seat 1 in the top-left interior (rows 1–3, cols 1–5), seat 2 in the bottom-right (rows 5–7, cols 13–17) |
| Centre | cols 6–12, rows 1–7: finish triangles plus the dice hub |
| Spare interior | top-right and bottom-left interior: player panels and dice trays, each facing its owner for same-screen play across a table |

Rules: classic in every respect. Pending approval (P1): whether 2-player rooms also offer the square with diagonally opposite seats as an option.

## 3 players: triangle (custom)

| Parameter | Value |
| --- | --- |
| Outline | equilateral triangle, one vertex down (players sit on three sides of a table) |
| Topology | **three-arm "Y"**: one arm from the centre to the midpoint of each side; bases in the three corners between arms |
| Arm | 3 lines wide (out-track, home lane, in-track), about 8 cells long |
| Segment `S` | 17 cells per seat: out side, tip, back side and the junction cell. The exact split is fixed by the Phase 5 preview, with `S = 17` held constant. |
| Lap | 51 (classic pace: 52) |
| Steps | track 0–49, turn-in at 49, lane 50–54, finish 55 |
| Safe cells | starts (0, 17, 34) + stars (8, 25, 42). That's 6 of 51 (11.8%). Optional: neutral stars at start + 13 for 9/51 (17.6%); decision P2. |
| Cells | arm cells are squares; where arms meet at the 120° junction, a wedge-shaped junction cell replaces classic's diagonal crossing |
| Corners | bases are inset from the sharp 60° vertices so all 4 slots stay clear of the frame |

## 5–15 players: ring board

**Construction**

1. **Outline:** a regular N-gon, flat edge at the bottom.
2. **Track ring:** one straight run of `S` cells along each side, inset 1.2 cells from the outline. Cells are trapezoids following the ring, and corner cells absorb the exterior angle of 360°/N.
3. **Home lanes:** each seat's lane leaves its turn-in cell (the end of the previous side) and runs **radially inward** for 5 cells.
4. **Hub:** a central N-gon holding N finish wedges (one per seat, facing its lane) and, for same-screen play, the dice.
5. **Bases:** in the annulus between ring and hub, one per seat, beside its start. 4 slots as a 2 × 2 cluster when the free arc is ≥ 3 cells; otherwise a curved row of 4 along the inner side of the ring.

**Proposed parameters** (computed; geometry previews in Phase 5 for approval)

| N | Shape | S | Lap | Finish step | Safe cells | Density | Board Ø (cells) | Free arc for base |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | pentagon | 12 | 60 | 64 | starts + stars | 16.7% | ~24 | 5.6 |
| 6 | hexagon | 11 | 66 | 70 | starts + stars | 18.2% | ~26 | 5.8 |
| 7 | heptagon | 9 | 63 | 67 | starts | 11.1% | ~24 | 4.7 |
| 8 | octagon | 8 | 64 | 68 | starts | 12.5% | ~24 | 4.2 |
| 9 | nonagon | 7 | 63 | 67 | starts | 14.3% | ~24 | 3.6 |
| 10 | decagon | 7 | 70 | 74 | starts | 14.3% | ~26 | 3.9 |
| 11 | hendecagon | 6 | 66 | 70 | starts | 16.7% | ~25 | 3.1 |
| 12 | dodecagon | 6 | 72 | 76 | starts | 16.7% | ~27 | 3.3 |
| 13 | tridecagon | 5 | 65 | 69 | starts | 20.0% | ~24 | 2.5 → row |
| 14 | tetradecagon | 5 | 70 | 74 | starts | 20.0% | ~26 | 2.6 → row |
| 15 | pentadecagon | 5 | 75 | 79 | starts | 20.0% | ~28 | 2.7 → row |

`S` shrinks as N grows, so **every ring board is about 24–28 cells across**: visual density stays constant, and laps stay within 60–75 (classic 52) instead of growing to 195 for 15 players at classic segment length.

**Readability consequence (honest):** at 24–28 cells across, a 370 px-wide phone gets about 13–15 px per cell, below the 18 px minimum token size. Phones therefore **require** the focus/zoom tools for 5+ players ([responsive-layouts.md](responsive-layouts.md)). Tablets (~26 px/cell) and desktops (~35 px/cell) display the full board comfortably.

## Fairness and balance

- Equal path length, equal safe-cell pattern and equal lane length are guaranteed by the rotational construction and asserted by tests.
- **Seat-order advantage** (first mover) is the same as classic Ludo. Expanded modes may randomise the first player.
- **Game length:** before Phase 6 rules are finalised, a seeded Monte-Carlo simulation (10,000 games per N, simple bot) will measure turns-to-win, captures per game and safe-cell usage. `S`, star placement and fast-mode options are tuned from those results, not guessed.
- Fast-mode options for 6+ players remain Phase 6: one token starts open, auto-move, turn timer, skip inactive players.

## Decisions needed

| # | Decision | Proposal |
| --- | --- | --- |
| P1 | 2 players: offer the square with opposite seats as an option? | Yes, as "Classic 2-player"; the rectangle stays the default |
| P2 | Triangle: 6 or 9 safe cells | 6, then decide after simulation |
| P3 | Ring boards: full lap with scaled `S` (above), or fixed ~51-step journeys with offset lanes | **Full lap with scaled S**: keeps "go round once, come home beside your base", the core Ludo intuition |
| P4 | Ring boards with S ≤ 9: starts-only safe cells | Yes; revisit after simulation |
