import type { PlayerColor } from "./gameTypes.js";

/**
 * BOARD LAYOUT OVERVIEW
 *
 * The main track has 52 cells (indices 0-51), shared by all players.
 * Each player starts at a different offset on this shared track.
 * After cell 51, a player enters their home column (6 private cells: 52-57).
 * Cell 58 = home (final destination).
 *
 * Track offsets — the main-track index where each color enters the board:
 *   red    → 0
 *   blue   → 13
 *   green  → 26
 *   yellow → 39
 *
 * A token's absolute position is calculated as:
 *   absolutePos = (startOffset + stepsFromStart) % 52   (while on main track)
 *
 * Home column positions (local, per-color): 52, 53, 54, 55, 56, 57
 * Home cell: 58
 *
 * Safe cells (absolute main-track indices):
 *   0, 8, 13, 21, 26, 34, 39, 47
 *   (start cells + the safe cell 8 steps before each start)
 */

export const TRACK_LENGTH = 52;
export const HOME_COLUMN_START = 52;   // local step index where home column begins
export const HOME_COLUMN_LENGTH = 6;
export const HOME_POSITION = 58;       // final home step index
export const STEPS_TO_HOME = HOME_POSITION; // total steps from start offset to home

export const START_OFFSETS: Record<PlayerColor, number> = {
  red: 0,
  blue: 13,
  green: 26,
  yellow: 39,
};

// Absolute main-track indices that are safe from capture
export const SAFE_CELLS = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

export function isSafeCell(absolutePos: number): boolean {
  return SAFE_CELLS.has(absolutePos % TRACK_LENGTH);
}

/**
 * Converts a token's local step count (0 = just left base, 58 = home)
 * into an absolute main-track index.
 * Returns -1 if the token is in the home column or at home (no shared-track position).
 */
export function localStepToAbsolute(color: PlayerColor, localStep: number): number {
  if (localStep >= HOME_COLUMN_START) return -1;
  return (START_OFFSETS[color] + localStep) % TRACK_LENGTH;
}
