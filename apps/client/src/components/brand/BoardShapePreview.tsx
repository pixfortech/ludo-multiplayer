// Player-count preview, 2–15. 2–4 players use the classic square (unused
// corners muted); 5–15 show the planned polygon board's outline and seats —
// a preview of a mode that is still in development.

import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { BOARD_SHAPE_BY_PLAYER_COUNT, type PlayerCount } from "@ludo/shared-types";
import { ClassicBoardArt } from "./ClassicBoardArt";

const CLASSIC_SEATS: Record<number, number[]> = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

export function BoardShapePreview({ players }: { players: PlayerCount }) {
  if (players <= 4) {
    return <ClassicBoardArt activeSeats={CLASSIC_SEATS[players] ?? [0, 1, 2, 3]} title={`Classic square board with ${players} active corners`} />;
  }
  const size = 320;
  const c = size / 2;
  const r = 118;
  const points = Array.from({ length: players }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / players;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a), a };
  });
  const shape = BOARD_SHAPE_BY_PLAYER_COUNT[players];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${shape} board outline for ${players} players (in development)`} className="block h-auto w-full">
      <rect x="0" y="0" width={size} height={size} rx="24" fill="#FFFFFF" />
      <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="#F7F4EE" stroke="#D8D0C2" strokeWidth="2" strokeLinejoin="round" />
      <polygon points={points.map((p) => `${c + (p.x - c) * 0.45},${c + (p.y - c) * 0.45}`).join(" ")} fill="#ECE6DC" stroke="#D8D0C2" strokeDasharray="4 5" />
      {points.map((p, i) => {
        const identity = PLAYER_IDENTITIES[i]!;
        const tokenR = Math.max(7, 15 - players * 0.45);
        return (
          <g key={i}>
            <line x1={c} y1={c} x2={p.x} y2={p.y} stroke={identity.lane} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            <circle cx={p.x} cy={p.y} r={tokenR + 2.5} fill="#FFFFFF" />
            <circle cx={p.x} cy={p.y} r={tokenR} fill={identity.body} stroke={identity.rim} strokeWidth="1.5" />
          </g>
        );
      })}
      <text x={c} y={c + 5} textAnchor="middle" fontFamily="Outfit Variable, Outfit, sans-serif" fontSize="15" fontWeight="600" fill="#5C6370">
        In development
      </text>
    </svg>
  );
}
