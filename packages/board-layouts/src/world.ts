// World coordinates for 3D renderers, derived from the classic layout only.
// One board cell is one world unit; the board is centred on the origin, lying
// in the XZ plane with +Y up. Columns grow along +X and rows along +Z, so a 3D
// board seen from above reads exactly like the 2D board: seat 0 (crimson) top
// left, 1 top right, 2 bottom right, 3 bottom left.
//
// There is no path or movement map here: a token's cell comes from the same
// seat path the engine and the 2D board use (classicSeatPath).

import { CLASSIC_FINISH_STEP, CLASSIC_GRID, CLASSIC_LAST_TRACK_STEP, classicBaseSlots, classicSeatPath } from "./classicSquareLayout.js";
import type { Cell } from "./layoutTypes.js";

/** A point on the board plane (y is height, decided by the renderer). */
export interface WorldPoint {
  x: number;
  z: number;
}

/** Board width in world units (one unit per cell). */
export const WORLD_BOARD_SIZE = CLASSIC_GRID;
const HALF = CLASSIC_GRID / 2;

/** Grid units (0 … 15, cell centres at .5) to world units. */
export const gridToWorld = (x: number, y: number): WorldPoint => ({ x: x - HALF, z: y - HALF });

/** The centre of a cell. */
export function cellToWorld(row: number, col: number): WorldPoint {
  return gridToWorld(col + 0.5, row + 0.5);
}

/** The cell a token stands on: null while in its base. Steps: 0–50 track, 51–55 home lane, 56 finish. */
export function classicStepCell(seat: number, step: number | null): Cell | null {
  if (step === null) return null;
  const path = classicSeatPath(seat);
  if (!Number.isInteger(step) || step < 0 || step > CLASSIC_FINISH_STEP) throw new RangeError(`Invalid step ${step}`);
  if (step <= CLASSIC_LAST_TRACK_STEP) return path.track[step]!;
  if (step < CLASSIC_FINISH_STEP) return path.lane[step - CLASSIC_LAST_TRACK_STEP - 1]!;
  return path.finish;
}

/** A base slot (0–3) of a seat. */
export function baseSlotToWorld(seat: number, slot: number): WorldPoint {
  const s = classicBaseSlots(seat)[((slot % 4) + 4) % 4]!;
  return gridToWorld(s.x, s.y);
}

/**
 * Where a single, unstacked token stands: its base slot (`slot`, usually the
 * token id) while in base, otherwise the centre of its step's cell. Stacks are
 * spread around this point by the renderer's placement (the same offsets in
 * 2D and 3D).
 */
export function tokenPositionToWorld(seat: number, step: number | null, slot = 0): WorldPoint {
  const cell = classicStepCell(seat, step);
  return cell ? cellToWorld(cell.row, cell.col) : baseSlotToWorld(seat, slot);
}
