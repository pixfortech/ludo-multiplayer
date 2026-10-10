// The 3D board as data: every tile, star, chevron, base tier, slot and centre
// piece with its world position and colour, built only from the classic
// layout (@ludo/board-layouts) and the same colour rules as the 2D board.
// Pure (no three.js), so it is tested like the 2D geometry; the meshes in
// BoardMesh3D only turn this list into instanced geometry.

import {
  CLASSIC_BASE_ORIGIN,
  CLASSIC_CENTRE,
  CLASSIC_HOME_LANES,
  CLASSIC_SAFE_INDICES,
  CLASSIC_START_INDEX,
  CLASSIC_TRACK,
  baseSlotToWorld,
  cellToWorld,
  classicHomeEntryIndex,
  gridToWorld,
  type Cell,
  type WorldPoint,
} from "@ludo/board-layouts";
import type { BoardMaterial2d } from "@ludo/city-themes";
import { PLAYER_IDENTITIES, mixLab } from "@ludo/design-tokens";

const WHITE = "#FFFFFF";
const tint = (hex: string, t: number) => (t === 0 ? hex : mixLab(hex, WHITE, t));
/** Lane cells deepen toward the centre (the 2D board's tints). */
export const LANE_TINTS = [0.8, 0.64, 0.47, 0.3, 0.12] as const;
/** Base tiers, outermost first (the 2D board's stepped squares). */
const BASE_TIERS = [
  { inset: 0.08, tint: 0.08, height: 0.26 },
  { inset: 0.62, tint: 0.3, height: 0.3 },
  { inset: 1.12, tint: 0.55, height: 0.33 },
] as const;

export type TileKind = "track" | "start" | "lane";

export interface Tile extends WorldPoint {
  kind: TileKind;
  cell: Cell;
  colour: string;
  /** Absolute track index (track and start tiles). */
  index: number | null;
  seat: number | null;
}

export interface Marker extends WorldPoint {
  /** Rotation about +Y, radians (0 = pointing along +X). */
  angle: number;
  colour: string;
}

export interface BaseTier extends WorldPoint {
  seat: number;
  size: number;
  height: number;
  colour: string;
}

export interface BoardModel {
  tiles: Tile[];
  stars: Marker[];
  chevrons: Marker[];
  tiers: BaseTier[];
  slots: (WorldPoint & { seat: number; colour: string; height: number })[];
  /** The centre: one triangle per seat, as three corners on the board plane. */
  centre: { seat: number; corners: [WorldPoint, WorldPoint, WorldPoint]; colour: string }[];
  /** Base squares (6 × 6 cells), for highlights. */
  bases: (WorldPoint & { seat: number; size: number })[];
}

const at = (c: Cell) => cellToWorld(c.row, c.col);
const angleBetween = (from: Cell, to: Cell) => Math.atan2(to.row - from.row, to.col - from.col);

/** Seats not in play are drawn faded toward the board body, as in 2D. */
function seatColour(seat: number, t: number, muted: boolean, body: string): string {
  const c = tint(PLAYER_IDENTITIES[seat]!.body, t);
  return muted ? mixLab(c, body, 0.62) : c;
}

export function buildBoardModel(material: BoardMaterial2d, activeSeats: readonly number[]): BoardModel {
  const muted = (seat: number) => !activeSeats.includes(seat);
  const tiles: Tile[] = [];
  const stars: Marker[] = [];
  const chevrons: Marker[] = [];

  CLASSIC_TRACK.forEach((cell, index) => {
    const startSeat = CLASSIC_START_INDEX.indexOf(index);
    const start = startSeat >= 0;
    tiles.push({ ...at(cell), kind: start ? "start" : "track", cell, index, seat: start ? startSeat : null, colour: start ? seatColour(startSeat, 0, muted(startSeat), material.body) : material.cell });
    if (start) chevrons.push({ ...at(cell), angle: angleBetween(cell, CLASSIC_TRACK[(index + 1) % CLASSIC_TRACK.length]!), colour: WHITE });
    else if (CLASSIC_SAFE_INDICES.includes(index)) stars.push({ ...at(cell), angle: 0, colour: material.safeMark });
  });

  for (let seat = 0; seat < 4; seat++) {
    const lane = CLASSIC_HOME_LANES[seat]!;
    lane.forEach((cell, i) => tiles.push({ ...at(cell), kind: "lane", cell, index: null, seat, colour: seatColour(seat, LANE_TINTS[i]!, muted(seat), material.body) }));
    // The entry chevron on the last shared cell, pointing into the lane.
    const entry = CLASSIC_TRACK[classicHomeEntryIndex(seat)]!;
    chevrons.push({ ...at(entry), angle: angleBetween(entry, lane[0]!), colour: seatColour(seat, 0.2, muted(seat), material.body) });
  }

  const tiers: BaseTier[] = [];
  const slots: BoardModel["slots"] = [];
  const bases: BoardModel["bases"] = [];
  for (let seat = 0; seat < 4; seat++) {
    const o = CLASSIC_BASE_ORIGIN[seat]!;
    const centre = gridToWorld(o.col + 3, o.row + 3);
    bases.push({ ...centre, seat, size: 6 });
    for (const t of BASE_TIERS) tiers.push({ ...centre, seat, size: 6 - t.inset * 2, height: t.height, colour: seatColour(seat, t.tint, muted(seat), material.body) });
    const top = BASE_TIERS[BASE_TIERS.length - 1]!.height;
    for (let slot = 0; slot < 4; slot++) slots.push({ ...baseSlotToWorld(seat, slot), seat, height: top, colour: mixLab(seatColour(seat, 0.55, muted(seat), material.body), WHITE, 0.6) });
  }

  // The 3 × 3 centre: each seat's triangle faces its own arm (as FinishArea in 2D).
  const c0 = gridToWorld(CLASSIC_CENTRE.col, CLASSIC_CENTRE.row);
  const c1 = gridToWorld(CLASSIC_CENTRE.col + 3, CLASSIC_CENTRE.row + 3);
  const mid = gridToWorld(CLASSIC_CENTRE.col + 1.5, CLASSIC_CENTRE.row + 1.5);
  const tl = { x: c0.x, z: c0.z };
  const tr = { x: c1.x, z: c0.z };
  const br = { x: c1.x, z: c1.z };
  const bl = { x: c0.x, z: c1.z };
  const corners: [WorldPoint, WorldPoint, WorldPoint][] = [
    [tl, bl, mid],
    [tl, tr, mid],
    [tr, br, mid],
    [bl, br, mid],
  ];
  const centre = corners.map((c, seat) => ({ seat, corners: c, colour: muted(seat) ? mixLab(PLAYER_IDENTITIES[seat]!.body, material.body, 0.62) : PLAYER_IDENTITIES[seat]!.body }));

  return { tiles, stars, chevrons, tiers, slots, centre, bases };
}
