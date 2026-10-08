# Classic square board (4 players): visual specification

**Status: geometry drafted, awaiting your approval.** The rules engine (Phase 1) is not built until you approve the numbered diagrams below.

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

## Diagrams for approval

| Diagram | Shows |
| --- | --- |
| [classic-board-overview.svg](generated/classic-board-overview.svg) | absolute positions 0–51, a direction arrow on every step, starts, stars, lanes |
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

**Verified visually:** all five diagrams were rendered and inspected.

### Approval checklist

- [ ] Seat placement (crimson TL, blue TR, emerald BR, golden BL) and clockwise turn order
- [ ] Start cells r6c1 / r1c8 / r8c13 / r13c6
- [ ] Star cells r2c6 / r6c12 / r12c8 / r8c2 (8 steps after each start)
- [ ] Turn-in at the arm tip (r7c0 / r0c7 / r7c14 / r14c7), lane of 5, finish at step 56 with an exact roll
- [ ] 2-player games on the square: optional mode using seats 1 and 3 (diagonally opposite). The default 2-player board is the rectangle in [board-polygon.md](board-polygon.md).

## Visual specification

| Element | 2D | 3D |
| --- | --- | --- |
| Board frame | `#ECE6DC`, 18 px radius, padding 0.15 cell | 0.25-cell-thick satin slab, 0.15 bevel |
| Track cell | `#F7F4EE`, 1 px `#D8D0C2` separator, radius 0.1 cell | flush tiles, 0.01-unit groove between cells |
| Start cell | seat body colour + white star at 45% | seat colour satin tile, star engraved |
| Star cell | cell colour + `#8E8676` star at 40% | star engraved 0.01 deep |
| Home lane | seat `lane` colour | same, satin |
| Base | seat body colour, ivory inner panel, 4 slot rings (2px, body colour) | inset tray (depth 0.12) with 4 shallow cups |
| Centre | 4 flat triangles in seat body colours | shallow pyramid (height 0.3), satin |
| Direction cue | small chevron on the start cell only, pointing along the track | engraved chevron |
| Current player | base panel glows (outer ring in seat colour, pulsing 1.6 s) | base tray emissive lift 8% |

**Board numbers are never shown in play.** Numbering exists only in these review diagrams and in a debug overlay behind a developer flag.
