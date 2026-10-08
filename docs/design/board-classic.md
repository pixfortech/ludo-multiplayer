# Classic square board (4 players): visual specification

**Status: reference v1, awaiting your approval.** Once approved, this geometry is frozen: the rules engine (Phase 1) and both renderers must follow it, and any change needs a new approval.

## Geometry (source: `packages/board-layouts/src/classicSquareLayout.ts`)

- 15 × 15 grid; row 0 at the top. Cells are named `r<row>c<col>`.
- Bases in the four 6 × 6 corners: **seat 1 top-left, seat 2 top-right, seat 3 bottom-right, seat 4 bottom-left**, in clockwise turn order.
- Shared track: 52 cells, travelled **clockwise**. Each arm's two outer lines are track; the middle line is the owner's private home lane.
- Inner corners are crossed diagonally (for example r6c5 → r5c6), the standard Ludo turn around the centre.

| | Seat 1 · Crimson | Seat 2 · Royal Blue | Seat 3 · Emerald | Seat 4 · Golden |
| --- | --- | --- | --- | --- |
| Start cell (step 0, safe) | r6c1 (abs 0) | r1c8 (abs 13) | r8c13 (abs 26) | r13c6 (abs 39) |
| Star cell (start + 8, safe) | r2c6 (abs 8) | r6c12 (abs 21) | r12c8 (abs 34) | r8c2 (abs 47) |
| Turn-in cell (step 50) | r7c0 | r0c7 | r7c14 | r14c7 |
| Home lane (steps 51–55) | r7c1 → r7c5 | r1c7 → r5c7 | r7c13 → r7c9 | r13c7 → r9c7 |
| Finish (step 56) | centre, left triangle | centre, top triangle | centre, right triangle | centre, bottom triangle |

Each seat travels 51 track cells (steps 0–50, never the cell just behind its own start), 5 lane cells, then the finish. That's 56 moves from start to finish, identical for every seat.

## Step 56 versus the old position 58

The previous implementation (preserved on `backup/old-ludo-at-reset`) used **positions 0–51 on the track, a 6-cell home column 52–57, and "home" at 58**. Measured against the physical board, that model has two extra steps, and neither exists on a real board:

| | Old model (finish 58) | Reference (finish 56) |
| --- | --- | --- |
| Shared track | 52 steps (0–51): a **full** lap, including the cell directly behind the seat's own start | 51 steps (0–50): the seat turns in at its arm tip and never visits the cell behind its start |
| Seat 1 turn-in | passed r7c0 at 50, went **up** to r6c0 at 51, then **diagonally back** to r7c1: a detour past its own lane mouth | r7c0 (step 50) → r7c1 (step 51): a straight step into the lane |
| Home lane | 6 cells; the 6th (r7c6 for seat 1) lies **inside the 3×3 centre square** | 5 cells (r7c1–r7c5), exactly the 5 coloured cells printed on each arm |
| Finish | 58, a separate "home" after the centre cell | 56, the seat's centre triangle |
| Moves from start to finish | 58 | **56** |

The final pushed version of the old code (counter-clockwise) had the same 58 count, with a different inconsistency: seat 1's step 51 was r6c2, followed by a diagonal jump to r7c1.

**Convention (all boards):** opening with a 6 places the token on its start cell as **step 0**. Every later roll adds exactly its value. A token occupies steps 0–50 on the shared track, 51–55 in its lane, and 56 at the finish. Finishing needs the rolls after opening to total **exactly 56**. Counting the start cell, a token stands on 57 positions along the way. Every seat's path is the same shape rotated by 90°, so all four distances are equal by construction. This is tested, and the step-by-step mapping is in [generated/classic-reference.md](generated/classic-reference.md).

## Diagrams for approval

| Diagram | Shows |
| --- | --- |
| [classic-board-concept.svg](generated/classic-board-concept.svg) | the visual target: flat, pastel-stepped bases, crisp white track, clockwise chevrons, drawn from the real layout |
| [classic-reference.md](generated/classic-reference.md) | every seat's step → cell table (0–56) and a complete sample journey per colour |
| [classic-board-overview.svg](generated/classic-board-overview.svg) | **the reference diagram**: absolute track 0–51 with an arrow on every step, starts, stars, each seat's dashed turn-in, lanes numbered 51–55, finish 56 |
| [classic-path-seat1-crimson.svg](generated/classic-path-seat1-crimson.svg) | seat 1's numbered path, steps 0–56 |
| [classic-path-seat2-royal-blue.svg](generated/classic-path-seat2-royal-blue.svg) | seat 2 |
| [classic-path-seat3-emerald.svg](generated/classic-path-seat3-emerald.svg) | seat 3 |
| [classic-path-seat4-golden.svg](generated/classic-path-seat4-golden.svg) | seat 4 |

**Verified by tests:**

- the loop is clockwise (positive signed area in screen coordinates);
- rotating seat k's entire path 90° clockwise gives seat k+1's path exactly;
- every step is to an adjacent cell, with exactly 4 diagonal corner crossings;
- lanes are private;
- starts and stars are at the cells above.

**Verified visually:** the concept, the reference overview and all four seat paths were rendered in Chromium and inspected.

### Approval checklist

- [ ] Seat placement (crimson TL, blue TR, emerald BR, golden BL) and clockwise turn order
- [ ] Start cells r6c1 / r1c8 / r8c13 / r13c6
- [ ] Star cells r2c6 / r6c12 / r12c8 / r8c2 (8 steps after each start)
- [ ] Turn-in at the arm tip (r7c0 / r0c7 / r7c14 / r14c7), lane of 5, finish at step 56 with an exact roll
- [ ] Position convention: step 0 = start after opening, finish at 56 (replacing the old 58)
- [ ] Visual direction of the [concept](generated/classic-board-concept.svg)
- [x] 2-player games: rectangle by default; the square with diagonally opposite seats (1 and 3) as an option (approved provisionally)

## Visual specification

| Element | 2D | 3D |
| --- | --- | --- |
| Board frame | white, 30 px radius, faint 6% shadow; page backdrop `#F3F0EA` | 0.25-cell-thick satin slab, 0.15 bevel |
| Track cell | porcelain `#F7F4EE`, 1 px `#ECE7DE` separator, radius 3 px | flush tiles, 0.01-unit groove between cells |
| Start cell | seat body colour + white clockwise chevron (coloured start cells are safe by convention; the chevron replaces the star) | seat colour satin tile, chevron engraved |
| Star cell | cell colour + `#8E8676` star at 40% | star engraved 0.01 deep |
| Home lane | 5-step tint ramp, pastel at the arm tip → saturated at the centre | same, satin |
| Base | five stepped tonal squares from the seat colour toward white (8% → 80%), 4 soft slot discs | inset tray with stepped tonal terraces and 4 shallow cups |
| Centre | 4 flat triangles in seat body colours | shallow pyramid (height 0.3), satin |
| Direction cue | white chevron on each start cell pointing clockwise; a tinted chevron on each turn-in cell pointing into the lane | engraved chevrons |
| Current player | base panel glows (outer ring in seat colour, pulsing 1.6 s) | base tray emissive lift 8% |

**Board numbers are never shown in play.** Numbering exists only in these review diagrams and in a debug overlay behind a developer flag.
