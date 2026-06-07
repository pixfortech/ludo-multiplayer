// Board geometry for the classic 4-player Ludo board.
//
// This file is PURE LAYOUT: it maps the server's authoritative token positions
// onto (row, col) coordinates of a 15×15 grid. It contains NO game rules — the
// server still decides every move. The only shared constants (START_OFFSETS,
// SAFE cells) mirror the server purely so we can paint state in the right place.
//
// Grid: 15×15, row 0 = top, col 0 = left.
//   • Four 6×6 base corners.
//   • A cross-shaped shared track of 52 cells (index = absolute position).
//   • Four coloured home lanes (6 cells each) leading inward.
//   • A 3×3 central finish.
//
// Track index ↔ direction of travel is clockwise, matching the server's
// absolute = (START_OFFSET[color] + step) % 52.

import type { PlayerColor, Token } from "../../types";

export interface Coord {
  row: number;
  col: number;
}

export const GRID = 15;

export const START_OFFSETS: Record<PlayerColor, number> = {
  red: 0,
  yellow: 13,
  green: 26,
  blue: 39,
};

// Absolute track indices that cannot be captured. These are the 4 coloured
// start cells (0, 13, 26, 39) plus the 4 "star" cells exactly 8 steps after
// each start (8, 21, 34, 47). This set MUST stay identical to the server's
// SAFE_CELLS in server/src/game/boardConfig.ts — the server is authoritative
// for captures; this copy only paints the markers in the right place.
export const SAFE_ABS = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

// The coloured start cell index for each colour (also a safe cell). Each start
// is 13 cells (one quarter-loop) after the previous, matching the server's
// START_OFFSETS so TRACK[START_OFFSETS[color]] is that colour's start square.
export const START_ABS: Record<number, PlayerColor> = {
  0: "red",
  13: "yellow",
  26: "green",
  39: "blue",
};

// 52-cell shared track, clockwise, TRACK[abs] → (row,col) on the 15×15 grid.
// Tokens travel in increasing index order and wrap 51 → 0. The path runs along
// the two outer lines of each cross arm; the middle line of each arm is that
// colour's private home lane (below). At the four inner cross corners the path
// "cuts" diagonally (e.g. {6,5} → {5,6}) — this is the standard Ludo turn where
// no orthogonal cell exists between adjacent arms. Each colour's start square is
// marked, and the home lane is entered after local step 51 (see tokenCoord).
export const TRACK: Coord[] = [
  { row: 6, col: 1 }, { row: 6, col: 0 }, { row: 7, col: 0 }, { row: 8, col: 0 }, { row: 8, col: 1 }, // 0-4
  { row: 8, col: 2 }, { row: 8, col: 3 }, { row: 8, col: 4 }, { row: 8, col: 5 }, { row: 9, col: 6 }, // 5-9
  { row: 10, col: 6 }, { row: 11, col: 6 }, { row: 12, col: 6 }, { row: 13, col: 6 }, { row: 14, col: 6 }, // 10-14
  { row: 14, col: 7 }, { row: 14, col: 8 }, { row: 13, col: 8 }, { row: 12, col: 8 }, { row: 11, col: 8 }, // 15-19
  { row: 10, col: 8 }, { row: 9, col: 8 }, { row: 8, col: 9 }, { row: 8, col: 10 }, { row: 8, col: 11 }, // 20-24
  { row: 8, col: 12 }, { row: 8, col: 13 }, { row: 8, col: 14 }, { row: 7, col: 14 }, { row: 6, col: 14 }, // 25-29
  { row: 6, col: 13 }, { row: 6, col: 12 }, { row: 6, col: 11 }, { row: 6, col: 10 }, { row: 6, col: 9 }, // 30-34
  { row: 5, col: 8 }, { row: 4, col: 8 }, { row: 3, col: 8 }, { row: 2, col: 8 }, { row: 1, col: 8 }, // 35-39
  { row: 0, col: 8 }, { row: 0, col: 7 }, { row: 0, col: 6 }, { row: 1, col: 6 }, { row: 2, col: 6 }, // 40-44
  { row: 3, col: 6 }, { row: 4, col: 6 }, { row: 5, col: 6 }, { row: 6, col: 5 }, { row: 6, col: 4 }, // 45-49
  { row: 6, col: 3 }, { row: 6, col: 2 },                                                               // 50-51
];

// Home lanes: local positions 52–57 (6 cells) per colour, leading to centre.
export const HOME_LANES: Record<PlayerColor, Coord[]> = {
  red: [
    { row: 7, col: 1 }, { row: 7, col: 2 }, { row: 7, col: 3 },
    { row: 7, col: 4 }, { row: 7, col: 5 }, { row: 7, col: 6 },
  ],
  blue: [
    { row: 1, col: 7 }, { row: 2, col: 7 }, { row: 3, col: 7 },
    { row: 4, col: 7 }, { row: 5, col: 7 }, { row: 6, col: 7 },
  ],
  green: [
    { row: 7, col: 13 }, { row: 7, col: 12 }, { row: 7, col: 11 },
    { row: 7, col: 10 }, { row: 7, col: 9 }, { row: 7, col: 8 },
  ],
  yellow: [
    { row: 13, col: 7 }, { row: 12, col: 7 }, { row: 11, col: 7 },
    { row: 10, col: 7 }, { row: 9, col: 7 }, { row: 8, col: 7 },
  ],
};

// Four base-token resting slots inside each 6×6 corner (float coords, centred).
export const BASE_SLOTS: Record<PlayerColor, Coord[]> = {
  red: [
    { row: 1.3, col: 1.3 }, { row: 1.3, col: 3.7 },
    { row: 3.7, col: 1.3 }, { row: 3.7, col: 3.7 },
  ],
  blue: [
    { row: 1.3, col: 10.3 }, { row: 1.3, col: 12.7 },
    { row: 3.7, col: 10.3 }, { row: 3.7, col: 12.7 },
  ],
  green: [
    { row: 10.3, col: 10.3 }, { row: 10.3, col: 12.7 },
    { row: 12.7, col: 10.3 }, { row: 12.7, col: 12.7 },
  ],
  yellow: [
    { row: 10.3, col: 1.3 }, { row: 10.3, col: 3.7 },
    { row: 12.7, col: 1.3 }, { row: 12.7, col: 3.7 },
  ],
};

// Where a finished (home) token rests in the centre, offset toward its colour.
export const FINISH: Record<PlayerColor, Coord> = {
  red: { row: 7, col: 6.4 },
  blue: { row: 6.4, col: 7 },
  green: { row: 7, col: 7.6 },
  yellow: { row: 7.6, col: 7 },
};

// Top-left grid cell of each 6×6 base corner.
export const BASE_CORNER: Record<PlayerColor, Coord> = {
  red: { row: 0, col: 0 },
  blue: { row: 0, col: 9 },
  green: { row: 9, col: 9 },
  yellow: { row: 9, col: 0 },
};

/**
 * Maps a single token to its grid coordinate based on the authoritative state.
 *  - base (position -1)        → a resting slot in the colour's corner
 *  - active, position 0..51    → shared track cell (absolute)
 *  - active, position 52..57   → the colour's home lane
 *  - home (position 58)        → the centre finish
 */
export function tokenCoord(color: PlayerColor, token: Token): Coord {
  if (token.state === "base" || token.position < 0) {
    return BASE_SLOTS[color][token.id] ?? BASE_SLOTS[color][0];
  }
  if (token.state === "home" || token.position >= 58) {
    return FINISH[color];
  }
  if (token.position <= 51) {
    const abs = (START_OFFSETS[color] + token.position) % 52;
    return TRACK[abs];
  }
  // home lane 52..57
  return HOME_LANES[color][token.position - 52] ?? FINISH[color];
}

/** Key used to detect tokens sharing the same cell (for stacking offsets). */
export function cellKey(c: Coord): string {
  return `${Math.round(c.row * 2)}:${Math.round(c.col * 2)}`;
}
