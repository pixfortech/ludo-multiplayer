// One shared-track cell. A seat's start cell is filled in the seat colour with
// a clockwise chevron; safe cells carry a star.
import { CLASSIC_BOARD_MATERIAL, type BoardMaterial2d } from "@ludo/city-themes";
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import type { Cell } from "@ludo/board-layouts";
import { CELL, cellCentre, px } from "./geometry";
import { SafeCell } from "./SafeCell";
import { WHITE } from "./surfaceShared";

export function Chevron({ from, to, stroke, size = 0.42 }: { from: Cell; to: Cell; stroke: string; size?: number }) {
  const angle = (Math.atan2(to.row - from.row, to.col - from.col) * 180) / Math.PI;
  const k = CELL * size;
  const { x, y } = cellCentre(from);
  return <path d={`M${-k * 0.35} ${-k * 0.5}L${k * 0.35} 0L${-k * 0.35} ${k * 0.5}`} fill="none" stroke={stroke} strokeWidth={CELL * 0.08} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${x} ${y}) rotate(${angle})`} />;
}

export function BoardCell({ cell, next, startSeat, safe, muted, material = CLASSIC_BOARD_MATERIAL }: { cell: Cell; next: Cell; startSeat: number | null; safe: boolean; muted: boolean; material?: BoardMaterial2d }) {
  const start = startSeat !== null;
  return (
    <g data-cell={`r${cell.row}c${cell.col}`} data-start={start ? startSeat : undefined}>
      <rect x={px(cell.col) + 0.5} y={px(cell.row) + 0.5} width={CELL - 1} height={CELL - 1} rx="3" fill={start ? PLAYER_IDENTITIES[startSeat]!.body : material.cell} stroke={material.separator} opacity={start && muted ? 0.4 : 1} />
      {start ? <Chevron from={cell} to={next} stroke={WHITE} /> : null}
      {safe ? <SafeCell cell={cell} fill={material.safeMark} /> : null}
    </g>
  );
}
