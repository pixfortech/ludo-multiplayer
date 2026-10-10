// Board-space geometry for the 2D classic board. Every position comes from
// @ludo/board-layouts (the frozen classic layout): this module only converts
// the layout's grid cells into SVG coordinates. It holds no movement map of
// its own and decides nothing about the game.

import { CLASSIC_GRID, classicBaseSlots, classicSeatPath, classicStepCell, gridToWorld, type Cell, type WorldPoint } from "@ludo/board-layouts";

/** One cell, in SVG units (the board scales as a whole). */
export const CELL = 40;
/** Frame around the 15×15 grid. */
export const PAD = 16;
export const BOARD_PX = CLASSIC_GRID * CELL + PAD * 2;

export interface Point {
  x: number;
  y: number;
}

/** Left/top edge of a grid column/row. */
export const px = (index: number): number => PAD + index * CELL;
export const cellCentre = (c: Cell): Point => ({ x: px(c.col) + CELL / 2, y: px(c.row) + CELL / 2 });

/** Where a token at `step` stands, as a layout cell (null while in its base). Steps: 0–50 track, 51–55 lane, 56 finish. */
export function stepCell(seat: number, step: number | null): Cell | null {
  return classicStepCell(seat, step);
}

/**
 * A 2D board point (SVG units) in 3D world units. The 3D board places tokens
 * through this, from the same placements the 2D board draws (stacks included),
 * so the two renderers can never disagree about where a token is.
 */
export function svgToWorld(p: Point): WorldPoint {
  return gridToWorld((p.x - PAD) / CELL, (p.y - PAD) / CELL);
}

/** Centre of base slot `slot` (0–3) of a seat. */
export function baseSlotPoint(seat: number, slot: number): Point {
  const s = classicBaseSlots(seat)[slot % 4]!;
  return { x: PAD + s.x * CELL, y: PAD + s.y * CELL };
}

/** Where a single, unstacked piece is drawn: its base slot, or its cell's centre. */
export function piecePosition(seat: number, step: number | null, slot = 0): Point {
  const cell = stepCell(seat, step);
  return cell ? cellCentre(cell) : baseSlotPoint(seat, slot);
}

/** The seat's whole clockwise route (start → last lane cell), as points. */
export function seatRoute(seat: number): Point[] {
  const path = classicSeatPath(seat);
  return [...path.track, ...path.lane].map(cellCentre);
}

/**
 * The steps a token passes through between two authoritative positions, in
 * order and including the destination: [0] when it opens from its base, or
 * from+1 … to along its own path. Used only to animate toward a position the
 * server has already committed.
 */
export function hopSteps(from: number | null, to: number): number[] {
  if (from === null) return [to];
  if (to <= from) return [to];
  return Array.from({ length: to - from }, (_, i) => from + 1 + i);
}
