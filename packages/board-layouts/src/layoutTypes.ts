/** A grid cell. Row 0 is the top edge, column 0 the left edge (screen orientation). */
export interface Cell {
  row: number;
  col: number;
}

/**
 * The logical path of one seat, indexed by the seat's own step count:
 * `track[0..50]` shared-track cells (0 = start), `lane[0..4]` home-lane cells
 * (steps 51–55), then the finish (step 56). Both renderers and the rules
 * engine share this numbering (docs/rules/classic-ludo.md).
 */
export interface SeatPath {
  track: readonly Cell[];
  lane: readonly Cell[];
  finish: Cell;
}

export const cellKey = (c: Cell): string => `r${c.row}c${c.col}`;

export const sameCell = (a: Cell, b: Cell): boolean => a.row === b.row && a.col === b.col;
