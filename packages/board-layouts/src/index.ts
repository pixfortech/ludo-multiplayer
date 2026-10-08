// @ludo/board-layouts — pure geometry for every board shape (2–15 players).
//
// Produces renderer-agnostic layout data (cell positions, bases, home lanes,
// safe-cell markers) consumed identically by the 2D and 3D renderers. It never
// decides rules. The classic square is drafted here pending approval; polygon
// layouts arrive with Phase 5 (see docs/design/board-polygon.md).

import { BOARD_SHAPE_BY_PLAYER_COUNT, type BoardShape, type PlayerCount } from "@ludo/shared-types";

export function boardShapeFor(count: PlayerCount): BoardShape {
  return BOARD_SHAPE_BY_PLAYER_COUNT[count];
}

export * from "./classicSquareLayout.js";
export * from "./layoutTypes.js";
export { buildClassicDiagramSvg, CLASSIC_DIAGRAMS } from "./diagram/classicDiagram.js";
