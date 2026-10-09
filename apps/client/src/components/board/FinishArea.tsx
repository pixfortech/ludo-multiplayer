// The 3 × 3 centre: one triangle per seat, each facing its own arm.
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { CLASSIC_CENTRE } from "@ludo/board-layouts";
import { CELL, px } from "./geometry";

export function FinishArea({ mutedSeats = [] }: { mutedSeats?: readonly number[] }) {
  const x = px(CLASSIC_CENTRE.col);
  const y = px(CLASSIC_CENTRE.row);
  const m = 3 * CELL;
  const mid = `${x + m / 2},${y + m / 2}`;
  const triangles = [`${x},${y} ${x},${y + m} ${mid}`, `${x},${y} ${x + m},${y} ${mid}`, `${x + m},${y} ${x + m},${y + m} ${mid}`, `${x},${y + m} ${x + m},${y + m} ${mid}`];
  return (
    <g data-finish="">
      {triangles.map((points, seat) => (
        <polygon key={seat} points={points} fill={PLAYER_IDENTITIES[seat]!.body} opacity={mutedSeats.includes(seat) ? 0.4 : 1} />
      ))}
      <circle cx={x + m / 2} cy={y + m / 2} r={CELL * 0.16} fill="#FFFFFF" opacity="0.9" />
    </g>
  );
}
