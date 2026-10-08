// Traditional 4-player Ludo board — STATUS: draft, pending approval.
//
// 15×15 grid. Bases in the corners (seat 1 top-left, then clockwise:
// 2 top-right, 3 bottom-right, 4 bottom-left). Tokens travel CLOCKWISE around
// a 52-cell shared track; each seat's private home lane runs along the middle
// of its own arm to the 3×3 centre. Diagrams: docs/design/generated/classic-*.svg.

import type { Cell, SeatPath } from "./layoutTypes.js";
import { CLASSIC_TOPOLOGY } from "./topology.js";

// Logical structure comes from the shared topology; this file adds geometry only.
export const CLASSIC_GRID = 15;
export const CLASSIC_SEATS = CLASSIC_TOPOLOGY.boardSeats;
export const CLASSIC_TRACK_LENGTH = CLASSIC_TOPOLOGY.trackLength;
/** Seat-relative steps: 0–50 shared track, 51–55 home lane, 56 finish. */
export const CLASSIC_LAST_TRACK_STEP = CLASSIC_TOPOLOGY.lastTrackStep;
export const CLASSIC_LANE_LENGTH = CLASSIC_TOPOLOGY.laneLength;
export const CLASSIC_FINISH_STEP = CLASSIC_TOPOLOGY.finishStep;
/** Each start is one quarter-loop after the previous seat's. */
export const CLASSIC_SEAT_SPACING = CLASSIC_TOPOLOGY.segmentLength;

const c = (row: number, col: number): Cell => ({ row, col });

/**
 * The shared track, clockwise, indexed by ABSOLUTE position. Index 0 is
 * seat 1's start cell. Corners between arms are crossed diagonally
 * (e.g. r6c5 → r5c6) because the centre square occupies the inner corner.
 */
export const CLASSIC_TRACK: readonly Cell[] = [
  c(6, 1), c(6, 2), c(6, 3), c(6, 4), c(6, 5), //           0–4   left arm, upper row → right
  c(5, 6), c(4, 6), c(3, 6), c(2, 6), c(1, 6), c(0, 6), //  5–10  top arm, left column ↑
  c(0, 7), c(0, 8), //                                      11–12 top tip →
  c(1, 8), c(2, 8), c(3, 8), c(4, 8), c(5, 8), //           13–17 top arm, right column ↓
  c(6, 9), c(6, 10), c(6, 11), c(6, 12), c(6, 13), c(6, 14), // 18–23 right arm, upper row →
  c(7, 14), c(8, 14), //                                    24–25 right tip ↓
  c(8, 13), c(8, 12), c(8, 11), c(8, 10), c(8, 9), //       26–30 right arm, lower row ←
  c(9, 8), c(10, 8), c(11, 8), c(12, 8), c(13, 8), c(14, 8), // 31–36 bottom arm, right column ↓
  c(14, 7), c(14, 6), //                                    37–38 bottom tip ←
  c(13, 6), c(12, 6), c(11, 6), c(10, 6), c(9, 6), //       39–43 bottom arm, left column ↑
  c(8, 5), c(8, 4), c(8, 3), c(8, 2), c(8, 1), c(8, 0), //  44–49 left arm, lower row ←
  c(7, 0), c(6, 0), //                                      50–51 left tip ↑
];

/** Absolute track index of each seat's start cell (seat index 0–3). */
export const CLASSIC_START_INDEX: readonly number[] = CLASSIC_TOPOLOGY.startIndex;

/** Home lanes (steps 51–55), outer cell first, each along its arm's middle line. */
export const CLASSIC_HOME_LANES: readonly (readonly Cell[])[] = [
  [c(7, 1), c(7, 2), c(7, 3), c(7, 4), c(7, 5)], //       seat 1, left arm →
  [c(1, 7), c(2, 7), c(3, 7), c(4, 7), c(5, 7)], //       seat 2, top arm ↓
  [c(7, 13), c(7, 12), c(7, 11), c(7, 10), c(7, 9)], //   seat 3, right arm ←
  [c(13, 7), c(12, 7), c(11, 7), c(10, 7), c(9, 7)], //   seat 4, bottom arm ↑
];

/** Top-left cell of each seat's 6×6 base. */
export const CLASSIC_BASE_ORIGIN: readonly Cell[] = [c(0, 0), c(0, 9), c(9, 9), c(9, 0)];

/** The 3×3 centre finish; each seat finishes on the triangle facing its own arm. */
export const CLASSIC_CENTRE: Cell = c(6, 6);
export const CLASSIC_FINISH: readonly Cell[] = [c(7, 6), c(6, 7), c(7, 8), c(8, 7)];

export function classicAbsoluteIndex(seat: number, step: number): number {
  return (CLASSIC_START_INDEX[seat]! + step) % CLASSIC_TRACK_LENGTH;
}

/** Absolute indices of the 8 safe cells: 4 starts + 4 stars. */
export const CLASSIC_SAFE_INDICES: readonly number[] = CLASSIC_TOPOLOGY.safeIndices;

/** Absolute index of the last shared cell before a seat turns into its lane. */
export function classicHomeEntryIndex(seat: number): number {
  return classicAbsoluteIndex(seat, CLASSIC_LAST_TRACK_STEP);
}

export function classicSeatPath(seat: number): SeatPath {
  if (!Number.isInteger(seat) || seat < 0 || seat >= CLASSIC_SEATS) throw new RangeError(`Invalid seat ${seat}`);
  const track = Array.from({ length: CLASSIC_LAST_TRACK_STEP + 1 }, (_, step) => CLASSIC_TRACK[classicAbsoluteIndex(seat, step)]!);
  return { track, lane: CLASSIC_HOME_LANES[seat]!, finish: CLASSIC_FINISH[seat]! };
}

/** Four base slots per seat, in grid units (cell centres are at .5). */
export function classicBaseSlots(seat: number): { x: number; y: number }[] {
  const o = CLASSIC_BASE_ORIGIN[seat]!;
  return [
    { x: o.col + 2, y: o.row + 2 },
    { x: o.col + 4, y: o.row + 2 },
    { x: o.col + 2, y: o.row + 4 },
    { x: o.col + 4, y: o.row + 4 },
  ];
}
