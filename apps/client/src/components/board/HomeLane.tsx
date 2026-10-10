// A seat's home lane: five cells deepening toward the centre, with an entry
// chevron on the last shared cell pointing into the lane.
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { CLASSIC_HOME_LANES, CLASSIC_TRACK, classicHomeEntryIndex } from "@ludo/board-layouts";
import { CELL, px } from "./geometry";
import { Chevron } from "./BoardCell";
import { SEPARATOR, tint } from "./surfaceShared";

const LANE_TINTS = [0.8, 0.64, 0.47, 0.3, 0.12];

export function HomeLane({ seat, muted = false, separator = SEPARATOR }: { seat: number; muted?: boolean; separator?: string }) {
  const lane = CLASSIC_HOME_LANES[seat]!;
  const body = PLAYER_IDENTITIES[seat]!.body;
  return (
    <g opacity={muted ? 0.4 : 1} data-lane={seat}>
      {lane.map((c, i) => (
        <rect key={i} x={px(c.col) + 0.5} y={px(c.row) + 0.5} width={CELL - 1} height={CELL - 1} rx="3" fill={tint(body, LANE_TINTS[i]!)} stroke={separator} />
      ))}
      <Chevron from={CLASSIC_TRACK[classicHomeEntryIndex(seat)]!} to={lane[0]!} stroke={tint(body, 0.2)} size={0.34} />
    </g>
  );
}
