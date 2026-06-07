// Geometry for the n-player polygon board preview.
// All coordinates are in a 500×500 viewBox (cx=cy=250).

export interface Vec2 { x: number; y: number; }

export interface TrackCell {
  x: number; y: number;
  playerIndex: number;
  isStart: boolean; // entry cell for this player
  isSafe: boolean;
}

export interface HomeLaneCell {
  x: number; y: number;
  playerIndex: number;
  laneIndex: number; // 0=outermost (near track), HOME_LANE_CELLS-1=innermost
}

export interface TokenSlot {
  x: number; y: number;
  playerIndex: number;
}

export interface PolygonLayout {
  n: number;
  cx: number;
  cy: number;
  outerR: number;
  trackR: number;
  cellR: number;         // visual radius for track cells
  tokenR: number;        // visual radius for token dots
  centerR: number;       // central finish zone radius
  vertices: Vec2[];
  trackCells: TrackCell[];
  homeLanes: HomeLaneCell[][];  // indexed [playerIndex][laneIndex]
  tokenSlots: TokenSlot[][];    // indexed [playerIndex][0..3]
}

export const POLYGON_NAMES: Record<number, string> = {
  2:  "Duel",
  3:  "Triangle",
  4:  "Square",
  5:  "Pentagon",
  6:  "Hexagon",
  7:  "Heptagon",
  8:  "Octagon",
  9:  "Nonagon",
  10: "Decagon",
  11: "Hendecagon",
  12: "Dodecagon",
  13: "Tridecagon",
  14: "Tetradecagon",
  15: "Pentadecagon",
};

const CELLS_PER_SIDE  = 3;
const HOME_LANE_CELLS = 5;
const VIEWBOX         = 500;

// Angle of vertex p for an n-gon, starting at the top.
function vertexAngle(p: number, n: number): number {
  return (2 * Math.PI * p) / n - Math.PI / 2;
}

export function computePolygonLayout(n: number): PolygonLayout {
  const cx = VIEWBOX / 2;
  const cy = VIEWBOX / 2;

  // Radii shrink slightly for small n (fewer sides = larger cells look better).
  const outerR  = n <= 4 ? 185 : n <= 7 ? 200 : 210;
  const trackR  = outerR * 0.76;
  const homeEnd = outerR * 0.21;     // innermost home lane cell
  const homeStart = trackR * 0.83;   // outermost home lane cell
  const centerR = outerR * 0.13;
  const cellR   = Math.max(7, 14 - n * 0.5);   // shrink cells for large n
  const tokenR  = Math.max(6, 13 - n * 0.4);

  const vertices: Vec2[] = [];
  for (let p = 0; p < n; p++) {
    const a = vertexAngle(p, n);
    vertices.push({ x: cx + outerR * Math.cos(a), y: cy + outerR * Math.sin(a) });
  }

  const sectionSpan = (2 * Math.PI) / n;
  const trackCells: TrackCell[]      = [];
  const homeLanes:  HomeLaneCell[][] = [];
  const tokenSlots: TokenSlot[][]    = [];

  for (let p = 0; p < n; p++) {
    const va = vertexAngle(p, n);

    // ── Track cells ────────────────────────────────────────────────────
    // CELLS_PER_SIDE cells between vertex p and vertex (p+1), on trackR circle.
    for (let k = 0; k < CELLS_PER_SIDE; k++) {
      const t     = (k + 1) / (CELLS_PER_SIDE + 1);
      const angle = va + t * sectionSpan;
      trackCells.push({
        x: cx + trackR * Math.cos(angle),
        y: cy + trackR * Math.sin(angle),
        playerIndex: p,
        isStart: k === 0,
        isSafe:  k === 0,
      });
    }

    // ── Home lane ──────────────────────────────────────────────────────
    // Points radially inward from the midpoint of player p's arc section.
    const laneAngle = va + sectionSpan / 2;
    const laneCells: HomeLaneCell[] = [];
    for (let j = 0; j < HOME_LANE_CELLS; j++) {
      const t = j / (HOME_LANE_CELLS - 1);
      const r = homeStart + t * (homeEnd - homeStart);
      laneCells.push({
        x: cx + r * Math.cos(laneAngle),
        y: cy + r * Math.sin(laneAngle),
        playerIndex: p,
        laneIndex:   j,
      });
    }
    homeLanes.push(laneCells);

    // ── Token slots ────────────────────────────────────────────────────
    // 4 tokens in a 2×2 cluster near the vertex (base area).
    const bx = vertices[p].x;
    const by = vertices[p].y;
    const spread = tokenR * 1.25;
    tokenSlots.push([
      { x: bx - spread, y: by - spread, playerIndex: p },
      { x: bx + spread, y: by - spread, playerIndex: p },
      { x: bx - spread, y: by + spread, playerIndex: p },
      { x: bx + spread, y: by + spread, playerIndex: p },
    ]);
  }

  return { n, cx, cy, outerR, trackR, cellR, tokenR, centerR, vertices, trackCells, homeLanes, tokenSlots };
}
