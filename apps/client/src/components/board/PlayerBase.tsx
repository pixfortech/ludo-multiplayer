// A seat's corner base: stepped tonal squares and four slot wells. The
// current player's base carries a soft seat-colour glow (turn indicator).
import { memo } from "react";
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { CLASSIC_BASE_ORIGIN } from "@ludo/board-layouts";
import { CELL, baseSlotPoint, px } from "./geometry";
import { WHITE, tint } from "./surfaceShared";

const STEPS = [0.08, 0.3, 0.48, 0.64, 0.8];

export const PlayerBase = memo(function PlayerBase({ seat, muted = false, active = false, label }: { seat: number; muted?: boolean; active?: boolean; label?: string }) {
  const o = CLASSIC_BASE_ORIGIN[seat]!;
  const identity = PLAYER_IDENTITIES[seat]!;
  const x0 = px(o.col);
  const y0 = px(o.row);
  const side = 6 * CELL;
  return (
    <g opacity={muted ? 0.32 : 1} style={{ transition: "opacity 220ms ease" }} data-seat={seat} data-active={active || undefined}>
      <rect x={x0 + 1} y={y0 + 1} width={side - 2} height={side - 2} rx="42" fill="none" stroke={identity.rim} strokeWidth="5" opacity={active ? 0.55 : 0} style={{ transition: "opacity 220ms ease" }} />
      {STEPS.map((t, k) => {
        const inset = 4 + k * CELL * 0.5;
        return <rect key={k} x={x0 + inset} y={y0 + inset} width={side - inset * 2} height={side - inset * 2} rx={Math.max(6, 40 - k * 8)} fill={tint(identity.body, t)} />;
      })}
      {[0, 1, 2, 3].map((slot) => {
        const p = baseSlotPoint(seat, slot);
        return <circle key={slot} cx={p.x} cy={p.y} r={CELL * 0.44} fill={WHITE} opacity="0.55" />;
      })}
      {label ? (
        <text x={x0 + side / 2} y={y0 + side / 2 + 5} textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif" fontSize="14" fontWeight="700" fill={identity.rim} opacity="0.85">
          {label}
        </text>
      ) : null}
    </g>
  );
});
