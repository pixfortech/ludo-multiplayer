// The 3D Kolkata around the board, as data: where every landmark, district
// and route sits, in board world units (one cell = 1, board centred, +Y up,
// rows along +Z: the camera of the 2.5D view looks from +Z). Pure, so the
// rules that keep the board playable are tested without rendering:
//  - nothing stands on the board or its border;
//  - nothing south of the board is tall enough to hide a cell from the aerial
//    camera, and the default 3D views see every cell;
//  - routes are closed loops (no teleporting), outside the board.
//
// Geography is compressed and stylised: the Hooghly wraps the north and west
// of the board (as it runs west of central Kolkata), the Howrah Bridge spans
// its west arm beside the board, and each player's corner opens onto its
// district: crimson (north-west) North Kolkata heritage, royal blue (north-
// east) the riverside ghats, emerald (south-east) the Maidan and cultural
// Kolkata, golden (south-west) contemporary Kolkata. It is not a map.

/** The board, its border and a clear margin: nothing of the city enters this square. */
export const BOARD_CLEAR = 8.05 + 0.35;
/** The board stands on its slab; the city's ground is level with the slab's foot. */
export const GROUND_Y = -0.42;
export const WATER_Y = GROUND_Y - 0.22;

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Top of the object above the ground. */
  height: number;
}

export interface Landmark {
  id: string;
  name: string;
  /** The district (seat) it belongs to, or null for the river and its bridge. */
  seat: 0 | 1 | 2 | 3 | null;
  at: { x: number; z: number };
  /** Its footprint and height (for placement, occlusion and camera clipping). */
  box: Box;
}

const box = (cx: number, cz: number, w: number, d: number, height: number): Box => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height });

/** The Hooghly: an L around the north and west of the board. Water rectangles (x/z ranges). */
export const RIVER = {
  west: { minX: -16.5, maxX: -11.2, minZ: -19.5, maxZ: 40 },
  north: { minX: -16.5, maxX: 40, minZ: -19.5, maxZ: -14 },
} as const;

export const BRIDGE = {
  /** The deck runs east to west across the river's west arm (south of centre: in view below the side panels in 2.5D). */
  z: 6.6,
  /** Ends of the anchor arms (on the banks). */
  east: -11.25,
  west: -17.3,
  /** Towers at the water's edge; the main span between them (the real bridge: ~1 : 4.6 anchor to main span). */
  towers: [-12.0, -16.4] as const,
  towerHeight: 5.2,
  /** Deck level above the ground. */
  deckHeight: 0.85,
  /** Half the distance between the two truss planes. */
  halfWidth: 0.62,
};

export const LANDMARKS: readonly Landmark[] = [
  { id: "howrah-bridge", name: "Howrah Bridge", seat: null, at: { x: (BRIDGE.east + BRIDGE.west) / 2, z: BRIDGE.z }, box: { minX: BRIDGE.west, maxX: BRIDGE.east, minZ: BRIDGE.z - 0.8, maxZ: BRIDGE.z + 0.8, height: BRIDGE.towerHeight + 0.3 } },
  { id: "hooghly-river", name: "Hooghly riverside", seat: null, at: { x: -13.85, z: -6 }, box: { minX: -16.5, maxX: -11.2, minZ: -19.5, maxZ: 40, height: 0 } },
  { id: "writers-building", name: "Writers' Building", seat: 0, at: { x: 2.2, z: -12.35 }, box: { minX: -2.1, maxX: 6.5, minZ: -13.3, maxZ: -10.85, height: 3.0 } },
  { id: "heritage-houses", name: "North Kolkata heritage houses", seat: 0, at: { x: -6.2, z: -12.3 }, box: { minX: -10.4, maxX: -2.4, minZ: -13.6, maxZ: -10.9, height: 3.1 } },
  { id: "ghats", name: "Riverside ghats", seat: 1, at: { x: 11.5, z: -12.6 }, box: { minX: 7.2, maxX: 16, minZ: -15.1, maxZ: -11, height: 2.4 } },
  { id: "shaheed-minar", name: "Shaheed Minar", seat: 1, at: { x: 14.6, z: -6.4 }, box: box(14.6, -6.4, 1.3, 1.3, 7.6) },
  { id: "victoria-memorial", name: "Victoria Memorial", seat: 2, at: { x: 17.4, z: 2.4 }, box: { minX: 14.2, maxX: 20.6, minZ: 0.5, maxZ: 5.4, height: 5.6 } },
  { id: "book-stalls", name: "College Street book stalls", seat: 2, at: { x: 14.5, z: 13.3 }, box: { minX: 11.2, maxX: 18, minZ: 12.8, maxZ: 13.9, height: 0.95 } },
  { id: "maidan", name: "The Maidan: benches and a tram stop", seat: 2, at: { x: 16.8, z: 2.5 }, box: { minX: 11.3, maxX: 20.9, minZ: -2.3, maxZ: 7.3, height: 0.9 } },
  { id: "biswa-bangla-gate", name: "Biswa Bangla Gate", seat: 3, at: { x: -5, z: 15 }, box: box(-5, 15, 5.2, 4.6, 5.3) },
  { id: "contemporary-towers", name: "Contemporary Kolkata", seat: 3, at: { x: -6, z: 18 }, box: { minX: -10.9, maxX: 2.2, minZ: 12.4, maxZ: 24, height: 6.2 } },
  { id: "howrah-station", name: "Howrah Station", seat: null, at: { x: -22.2, z: 3.2 }, box: box(-22.2, 3.2, 4.2, 5.6, 3.6) },
  { id: "tea-stall", name: "Tea stall and adda", seat: 0, at: { x: -9.6, z: -11.05 }, box: box(-9.6, -11.05, 1.1, 0.7, 0.9) },
];

/** A closed route: a rounded rectangle traversed at constant speed. */
export interface Loop {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  radius: number;
  /** Height of the path above the ground. */
  y: number;
  /** +1 clockwise seen from above, −1 anticlockwise. */
  direction: 1 | -1;
}

/** The ring road round the board (Strand Road along the river): taxis, both ways. */
export const TAXI_LANES: readonly Loop[] = [
  { id: "taxi-inner", minX: -9.65, maxX: 9.65, minZ: -9.65, maxZ: 9.65, radius: 1.4, y: GROUND_Y, direction: 1 },
  { id: "taxi-outer", minX: -10.35, maxX: 10.35, minZ: -10.35, maxZ: 10.35, radius: 1.9, y: GROUND_Y, direction: -1 },
];
/** The tram line round the Maidan and the Victoria Memorial. */
export const TRAM_LOOP: Loop = { id: "tram", minX: 12.3, maxX: 22, minZ: -9.6, maxZ: 11.4, radius: 1.6, y: GROUND_Y, direction: 1 };
/** Ferries up and down the west arm (under the bridge) and along the north arm. */
export const FERRY_LOOPS: readonly Loop[] = [
  { id: "ferry-west", minX: -15.4, maxX: -12.9, minZ: -16.6, maxZ: 30, radius: 1.2, y: WATER_Y, direction: 1 },
  { id: "ferry-north", minX: -10, maxX: 34, minZ: -18.8, maxZ: -15.8, radius: 1.5, y: WATER_Y, direction: -1 },
];
/** Walkers: the riverside promenade, the ghats, the Maidan paths and the south plaza. */
export const WALK_LOOPS: readonly Loop[] = [
  { id: "promenade", minX: -10.9, maxX: -10.8, minZ: -9.5, maxZ: 9.5, radius: 0.05, y: GROUND_Y, direction: 1 },
  { id: "ghats", minX: 6.8, maxX: 16.2, minZ: -11.3, maxZ: -11.0, radius: 0.15, y: GROUND_Y, direction: -1 },
  { id: "maidan", minX: 13.1, maxX: 21.2, minZ: -0.6, maxZ: 6.2, radius: 0.8, y: GROUND_Y, direction: 1 },
  { id: "plaza", minX: -9.8, maxX: -0.6, minZ: 11.2, maxZ: 12.2, radius: 0.4, y: GROUND_Y, direction: -1 },
];

export function loopLength(l: Loop): number {
  const w = l.maxX - l.minX - 2 * l.radius;
  const d = l.maxZ - l.minZ - 2 * l.radius;
  return 2 * (w + d) + 2 * Math.PI * l.radius;
}

/** The point at arc length `s` along a loop, and the heading (radians about +Y, 0 = facing +X). */
export function loopPoint(l: Loop, s: number): { x: number; z: number; heading: number } {
  const L = loopLength(l);
  let t = ((s % L) + L) % L;
  if (l.direction === -1) t = L - t;
  const r = l.radius;
  const w = l.maxX - l.minX - 2 * r;
  const d = l.maxZ - l.minZ - 2 * r;
  const arc = (Math.PI / 2) * r;
  // Clockwise from above (+Z is "down" on screen): top edge west→east, right edge north→south, bottom east→west, left south→north.
  const segments: [number, (u: number) => { x: number; z: number; dx: number; dz: number }][] = [
    [w, (u) => ({ x: l.minX + r + u, z: l.minZ, dx: 1, dz: 0 })],
    [arc, (u) => corner(l.maxX - r, l.minZ + r, -Math.PI / 2 + u / r)],
    [d, (u) => ({ x: l.maxX, z: l.minZ + r + u, dx: 0, dz: 1 })],
    [arc, (u) => corner(l.maxX - r, l.maxZ - r, u / r)],
    [w, (u) => ({ x: l.maxX - r - u, z: l.maxZ, dx: -1, dz: 0 })],
    [arc, (u) => corner(l.minX + r, l.maxZ - r, Math.PI / 2 + u / r)],
    [d, (u) => ({ x: l.minX, z: l.maxZ - r - u, dx: 0, dz: -1 })],
    [arc, (u) => corner(l.minX + r, l.minZ + r, Math.PI + u / r)],
  ];
  function corner(cx: number, cz: number, a: number) {
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, dx: -Math.sin(a), dz: Math.cos(a) };
  }
  let last = segments[0]![1](0);
  for (const [length, at] of segments) {
    last = at(Math.min(t, length));
    if (t <= length) break;
    t -= length;
  }
  const dx = last.dx * l.direction;
  const dz = last.dz * l.direction;
  return { x: last.x, z: last.z, heading: Math.atan2(-dz, dx) };
}

/** Trees: the Maidan, the heritage courtyards, the south plaza, the far bank. */
export const TREES: readonly { x: number; z: number; scale: number }[] = [
  ...[
    [13.5, 7.6],
    [17.0, 9.8],
    [15.8, 8.6],
    [18.6, 9.2],
    [20.4, 8.3],
    [20.6, -3.4],
    [23.8, -7.2],
    [17.8, -8.4],
    [13.9, -3.4],
    [23.6, 0.2],
    [23.8, 6],
    [24.2, 12.8],
    [20.6, 15.2],
    [23.2, 18],
    [9.6, 17.4],
    [12.2, 20.6],
    [16.4, 19.4],
    [6.4, 21.4],
    [3.6, 13.6],
    [5.8, 12],
  ].map(([x, z], i) => ({ x: x!, z: z!, scale: 0.9 + ((i * 37) % 7) / 14 })),
  ...[
    [-10.6, -13.3],
    [-2.9, -13.4],
    [-1.2, 12.6],
    [-10.4, 12.4],
    [-19.6, -6.8],
    [-21.4, 10.6],
    [-24.6, -2.6],
    [-19.4, 12.2],
    [16.8, -11.2],
    [19.8, -12.6],
  ].map(([x, z], i) => ({ x: x!, z: z!, scale: 0.8 + ((i * 29) % 5) / 12 })),
];

/** Lamp posts: the riverside railing, the ghats and the Maidan paths. */
export const LAMPS: readonly { x: number; z: number }[] = [
  ...[-8.6, -5.4, -2.2, 1.0, 4.2, 9.2].map((z) => ({ x: -11.05, z })),
  ...[7.6, 10.4, 13.2, 15.8].map((x) => ({ x, z: -10.85 })),
  ...[
    [13.1, -0.8],
    [21.2, -0.8],
    [13.1, 6.4],
    [21.2, 6.4],
  ].map(([x, z]) => ({ x: x!, z: z! })),
  ...[-8.6, -4.6, -1.2].map((x) => ({ x, z: 11 })),
];

/** All footprints the camera must not pass through, and that must keep off the board. */
export function obstacles(): Box[] {
  return [...LANDMARKS.filter((l) => l.box.height > 0).map((l) => l.box), ...TREES.map((t) => ({ minX: t.x - 0.7 * t.scale, maxX: t.x + 0.7 * t.scale, minZ: t.z - 0.7 * t.scale, maxZ: t.z + 0.7 * t.scale, height: 2.1 * t.scale }))];
}
