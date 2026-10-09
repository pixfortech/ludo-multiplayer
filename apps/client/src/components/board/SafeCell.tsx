// The quiet star that marks a safe cell.
import { BOARD_SURFACES, SAFE_STAR_PATH } from "@ludo/design-tokens";
import type { Cell } from "@ludo/board-layouts";
import { CELL, px } from "./geometry";

export function SafeCell({ cell }: { cell: Cell }) {
  return <path d={SAFE_STAR_PATH} fill={BOARD_SURFACES.safeMark} opacity="0.45" transform={`translate(${px(cell.col) + CELL * 0.25} ${px(cell.row) + CELL * 0.25}) scale(${(CELL * 0.5) / 24})`} data-safe="" />;
}
