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

export function EffectMark({ effect }: { effect: BoardEffect }) {
  const identity = PLAYER_IDENTITIES[effect.seat]!;
  return (
    <g pointerEvents="none" transform={`translate(${effect.at.x} ${effect.at.y})`} data-effect={effect.kind}>
      <circle className={effect.kind === "home" ? "board-effect-home" : "board-effect-capture"} r={CELL * 0.5} fill="none" stroke={effect.kind === "home" ? "#E3B341" : identity.rim} strokeWidth="3" />
    </g>
  );
}
