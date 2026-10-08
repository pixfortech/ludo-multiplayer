// @ludo/board-layouts — pure geometry for every board shape (2–15 players).
//
// Produces renderer-agnostic layout data (cell positions, bases, home lanes,
// safe-cell markers) consumed identically by the 2D and 3D renderers. It never
// decides rules. Classic square layout arrives with Phase 3, polygon layouts
// with Phase 5 (see docs/rules/expanded-players.md).

import { BOARD_SHAPE_BY_PLAYER_COUNT, type BoardShape, type PlayerCount } from "@ludo/shared-types";

export function boardShapeFor(count: PlayerCount): BoardShape {
  return BOARD_SHAPE_BY_PLAYER_COUNT[count];
}
