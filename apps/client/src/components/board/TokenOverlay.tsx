// Board overlays drawn from server data only: the preview of a legal move
// (its exact path and destination, from the server's legal-move list) and
// short-lived capture / home-entry marks after a committed move.
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { CELL, hopSteps, piecePosition, type Point } from "./geometry";

export interface MovePreview {
  seat: number;
  from: number | null;
  to: number;
  slot: number;
}

export interface BoardEffect {
  id: string;
  kind: "capture" | "home";
  at: Point;
  seat: number;
}

export function MovePreviewPath({ preview }: { preview: MovePreview }) {
  const identity = PLAYER_IDENTITIES[preview.seat]!;
  const start = piecePosition(preview.seat, preview.from, preview.slot);
  const points = [start, ...hopSteps(preview.from, preview.to).map((step) => piecePosition(preview.seat, step))];
  return (
    <g pointerEvents="none" data-testid="move-preview">
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={identity.rim} strokeWidth={CELL * 0.1} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${CELL * 0.12} ${CELL * 0.2}`} opacity="0.7" />
      {points.slice(1, -1).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={CELL * 0.09} fill={identity.rim} opacity="0.55" />
      ))}
    </g>
  );
}

export function DestinationMarker({ preview }: { preview: MovePreview }) {
  const identity = PLAYER_IDENTITIES[preview.seat]!;
  const at = piecePosition(preview.seat, preview.to);
  return (
    <g pointerEvents="none" transform={`translate(${at.x} ${at.y})`} data-testid="move-destination">
      <circle r={CELL * 0.46} fill="none" stroke={identity.rim} strokeWidth="3" />
      <circle r={CELL * 0.46} fill={identity.body} opacity="0.14" />
    </g>
  );
}

const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  return { dx: Math.cos(a) * CELL * 0.95, dy: Math.sin(a) * CELL * 0.95 };
});

export function EffectMark({ effect }: { effect: BoardEffect }) {
  const identity = PLAYER_IDENTITIES[effect.seat]!;
  if (effect.kind === "home") {
    // The finishing accent: a soft gold glow, an expanding ring and eight small sparks. One burst, ~700 ms.
    return (
      <g pointerEvents="none" transform={`translate(${effect.at.x} ${effect.at.y})`} data-effect="home">
        <circle className="board-home-glow" r={CELL * 0.62} fill="#E3B341" />
        <circle className="board-effect-home" r={CELL * 0.5} fill="none" stroke="#E3B341" strokeWidth="3" />
        {SPARKS.map((s, i) => (
          <path key={i} className="board-home-spark" d="M0 -4.2L1.4 0L0 4.2L-1.4 0Z" fill="#E3B341" style={{ ["--dx" as string]: `${s.dx.toFixed(1)}px`, ["--dy" as string]: `${s.dy.toFixed(1)}px` }} />
        ))}
      </g>
    );
  }
  return (
    <g pointerEvents="none" transform={`translate(${effect.at.x} ${effect.at.y})`} data-effect={effect.kind}>
      <circle className="board-effect-capture" r={CELL * 0.5} fill="none" stroke={identity.rim} strokeWidth="3" />
    </g>
  );
}
