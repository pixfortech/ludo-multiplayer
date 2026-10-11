// Kolkata's landmarks as procedural models (C.2B). Each is built from simple
// parts into one merged geometry with vertex colours. Proportions follow the
// real buildings, compressed to fit round the board; the details that make
// them recognisable are modelled, not painted:
//  - Howrah Bridge: the cantilever truss (short anchor arms, towers at the
//    water's edge, a long main span with a suspended centre), two truss
//    planes, lateral bracing seen from above, piers and deck;
//  - Victoria Memorial: white marble, central dome on a drum with a lantern
//    and the angel, corner cupolas, wings, a colonnaded front;
//  - Writers' Building: a long red-brick facade with white bands, rows of
//    windows, a central pedimented portico and rooftop statues;
//  - Shaheed Minar: a slim column on a flared base, two balconies, a cupola;
//  - Biswa Bangla Gate: a tilted steel ring on slanted legs over the avenue,
//    with a glass pod at its centre;
//  - Howrah Station: red brick with corner towers, across the river.

import type { BufferGeometry } from "three";
import { Builder, type V3 } from "../kit";
import type { EnvironmentQuality } from "../ambient";
import { BRIDGE, GROUND_Y as G, LANDMARKS, WATER_Y } from "./layout";

type Detail = EnvironmentQuality["detail"];
const at = (id: string) => LANDMARKS.find((l) => l.id === id)!.at;

const STEEL = "#6C665F";
const STEEL_DARK = "#4C4844";
const DECK = "#4A4642";
const PIER = "#8E8578";

/** The top chord's height above the ground at x (anchor arm up, main span down to the suspended centre). */
export function bridgeChord(x: number): number {
  const [tEast, tWest] = BRIDGE.towers;
  const top = BRIDGE.towerHeight - 0.25;
  const end = BRIDGE.deckHeight + 0.85;
  const centre = BRIDGE.deckHeight + 1.75;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  if (x >= tEast) return lerp(end, top, (BRIDGE.east - x) / (BRIDGE.east - tEast));
  if (x <= tWest) return lerp(end, top, (x - BRIDGE.west) / (tWest - BRIDGE.west));
  const span = tEast - tWest;
  const u = (tEast - x) / span; // 0 at the east tower, 1 at the west tower
  const cantilever = 0.3;
  if (u < cantilever) return lerp(top, centre, u / cantilever);
  if (u > 1 - cantilever) return lerp(top, centre, (1 - u) / cantilever);
  // The suspended span: a gentle arch.
  const k = (u - cantilever) / (1 - 2 * cantilever);
  return centre + Math.sin(Math.PI * k) * 0.22;
}

export function buildHowrahBridge(detail: Detail): BufferGeometry {
  const b = new Builder();
  const panel = detail === "low" ? 0.46 : detail === "medium" ? 0.35 : 0.3;
  const deck = G + BRIDGE.deckHeight;
  const xs: number[] = [];
  for (let x = BRIDGE.east; x > BRIDGE.west + 1e-6; x -= panel) xs.push(x);
  xs.push(BRIDGE.west);
  const chord = (x: number) => G + bridgeChord(x);
  const thick = detail === "low" ? 0.09 : 0.07;
  for (const side of [-1, 1]) {
    const z = BRIDGE.z + side * BRIDGE.halfWidth;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      const top: V3 = [x, chord(x), z];
      const bottom: V3 = [x, deck, z];
      b.beam(bottom, top, thick * 0.8, STEEL);
      if (i < xs.length - 1) {
        const n = xs[i + 1]!;
        b.beam(top, [n, chord(n), z], thick * 1.5, STEEL);
        b.beam(bottom, [n, deck, z], thick * 1.4, STEEL_DARK);
        // Diagonals alternate, as in the real truss's web.
        b.beam(i % 2 ? top : bottom, i % 2 ? [n, deck, z] : [n, chord(n), z], thick * 0.7, STEEL);
      }
    }
  }
  // Lateral bracing between the two planes along the top chord (an X every other panel), and cross girders.
  for (let i = 0; i < xs.length - 1; i += 2) {
    const x = xs[i]!;
    const n = xs[Math.min(i + 2, xs.length - 1)]!;
    const z0 = BRIDGE.z - BRIDGE.halfWidth;
    const z1 = BRIDGE.z + BRIDGE.halfWidth;
    b.beam([x, chord(x), z0], [n, chord(n), z1], thick * 0.6, STEEL);
    if (detail !== "low") b.beam([x, chord(x), z1], [n, chord(n), z0], thick * 0.6, STEEL);
    b.beam([x, chord(x), z0], [x, chord(x), z1], thick * 0.8, STEEL);
  }
  // Towers: tall tapering legs from the piers, with portal beams and X bracing across.
  for (const tx of BRIDGE.towers) {
    const topY = G + BRIDGE.towerHeight;
    for (const side of [-1, 1]) {
      const z = BRIDGE.z + side * BRIDGE.halfWidth;
      b.beam([tx - 0.22, deck - 0.05, z], [tx - 0.06, topY, z], 0.15, STEEL_DARK);
      b.beam([tx + 0.22, deck - 0.05, z], [tx + 0.06, topY, z], 0.15, STEEL_DARK);
      for (let k = 0; k < 4; k++) {
        const y0 = deck + ((topY - deck) * k) / 4;
        const y1 = deck + ((topY - deck) * (k + 1)) / 4;
        const w0 = 0.22 - 0.16 * (k / 4);
        const w1 = 0.22 - 0.16 * ((k + 1) / 4);
        b.beam([tx - w0, y0, z], [tx + w1, y1, z], 0.05, STEEL);
        b.beam([tx + w0, y0, z], [tx - w1, y1, z], 0.05, STEEL);
      }
    }
    for (const y of [topY - 0.08, G + BRIDGE.towerHeight * 0.62, deck + 0.9]) b.beam([tx, y, BRIDGE.z - BRIDGE.halfWidth], [tx, y, BRIDGE.z + BRIDGE.halfWidth], 0.12, STEEL_DARK);
    // The pier in the river, and the cap on top of each tower.
    b.block(tx, BRIDGE.z, 0.9, BRIDGE.halfWidth * 2 + 0.6, WATER_Y - 0.05, deck - WATER_Y, PIER);
    b.box([0.28, 0.12, BRIDGE.halfWidth * 2 + 0.2], [tx, topY + 0.06, BRIDGE.z], STEEL_DARK);
  }
  // The deck, with footways outside the trusses, and the anchorages on the banks.
  b.box([BRIDGE.east - BRIDGE.west + 0.2, 0.12, BRIDGE.halfWidth * 2 + 0.1], [(BRIDGE.east + BRIDGE.west) / 2, deck - 0.06, BRIDGE.z], DECK);
  for (const side of [-1, 1]) b.box([BRIDGE.east - BRIDGE.west, 0.05, 0.22], [(BRIDGE.east + BRIDGE.west) / 2, deck - 0.03, BRIDGE.z + side * (BRIDGE.halfWidth + 0.15)], "#7B746B");
  for (const x of [BRIDGE.east, BRIDGE.west]) b.block(x, BRIDGE.z, 0.4, BRIDGE.halfWidth * 2 + 0.6, G, BRIDGE.deckHeight, PIER);
  return b.build();
}

const MARBLE = "#F3EFE6";
const MARBLE_SHADE = "#E0D9CA";
const RECESS = "#C9BFAB";

export function buildVictoriaMemorial(detail: Detail): BufferGeometry {
  const b = new Builder();
  const { x, z } = at("victoria-memorial");
  const seg = detail === "low" ? 10 : detail === "medium" ? 16 : 22;
  // Terrace and steps.
  b.block(x, z, 6.4, 3.8, G, 0.14, MARBLE_SHADE);
  b.block(x, z, 6.0, 3.4, G + 0.14, 0.14, MARBLE);
  const base = G + 0.28;
  // Wings and the central block.
  b.block(x, z, 3.0, 2.5, base, 1.55, MARBLE);
  for (const s of [-1, 1]) {
    b.block(x + s * 2.2, z, 1.5, 2.0, base, 1.15, MARBLE);
    b.block(x + s * 2.2, z, 1.6, 2.1, base + 1.15, 0.1, MARBLE_SHADE);
  }
  b.block(x, z, 3.1, 2.6, base + 1.55, 0.12, MARBLE_SHADE);
  // Corner pavilions with cupolas.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = x + sx * 1.3;
      const cz = z + sz * 1.05;
      b.block(cx, cz, 0.55, 0.55, base + 1.55, 0.42, MARBLE);
      b.cylinder(cx, cz, 0.26, 0.28, base + 1.97, 0.16, MARBLE_SHADE, seg);
      b.dome(cx, cz, 0.27, base + 2.13, MARBLE, 1.25, seg);
      b.cone(cx, cz, 0.04, base + 2.45, 0.16, "#C9A24A", 6);
    }
  // The drum, the great dome, the lantern and the angel.
  const drumY = base + 1.67;
  b.cylinder(x, z, 0.95, 1.0, drumY, 0.75, MARBLE, seg);
  if (detail !== "low") for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.block(x + Math.cos(a) * 0.98, z + Math.sin(a) * 0.98, 0.07, 0.07, drumY + 0.08, 0.6, MARBLE_SHADE);
  }
  b.dome(x, z, 1.02, drumY + 0.75, MARBLE, 1.22, seg);
  const lanternY = drumY + 0.75 + 1.02 * 1.22 - 0.06;
  b.cylinder(x, z, 0.2, 0.23, lanternY, 0.32, MARBLE, seg);
  b.dome(x, z, 0.22, lanternY + 0.32, MARBLE_SHADE, 1.3, seg);
  b.cylinder(x, z, 0.03, 0.05, lanternY + 0.6, 0.18, "#B48A3A", 6);
  b.sphere([x, lanternY + 0.86, z], 0.07, "#B48A3A", 6);
  b.box([0.34, 0.03, 0.06], [x, lanternY + 0.86, z], "#B48A3A");
  // The colonnaded front (facing the board, +z) and arched recesses along the wings.
  const front = z + 1.25;
  const cols = detail === "low" ? 4 : 6;
  for (let i = 0; i < cols; i++) b.cylinder(x - 0.75 + (1.5 * i) / (cols - 1), front + 0.12, 0.055, 0.06, base, 1.3, MARBLE, 8);
  b.block(x, front + 0.12, 1.75, 0.32, base + 1.3, 0.16, MARBLE_SHADE);
  for (const s of [-1, 1])
    for (let i = 0; i < (detail === "low" ? 2 : 3); i++) b.block(x + s * (1.75 + i * 0.42), z + 1.005, 0.22, 0.02, base + 0.25, 0.6, RECESS);
  // The reflecting pool and lawn in front.
  b.block(x, z + 2.9, 3.2, 0.9, G, 0.04, "#7FA3A4");
  return b.build();
}

const BRICK = "#B4513A";
const BRICK_SHADE = "#9C4431";
const WHITE = "#F1E6D2";
const WINDOW = "#4E2A22";

export function buildWritersBuilding(detail: Detail): BufferGeometry {
  const b = new Builder();
  const { x, z } = at("writers-building");
  const w = 8.6;
  const d = 1.7;
  const floor = 0.78;
  const front = z + d / 2;
  b.block(x, z, w, d, G, floor * 3, BRICK);
  b.block(x, z - 0.1, w - 0.2, d - 0.2, G + floor * 3, 0.06, BRICK_SHADE);
  // White bands at each floor and a cornice.
  for (let f = 1; f <= 3; f++) b.box([w + 0.04, 0.07, 0.08], [x, G + f * floor - 0.03, front + 0.02], WHITE);
  b.box([w + 0.1, 0.12, 0.16], [x, G + 3 * floor + 0.02, front], WHITE);
  // Windows: white frames with dark panes, three rows.
  const perRow = detail === "low" ? 14 : detail === "medium" ? 20 : 26;
  for (let f = 0; f < 3; f++)
    for (let i = 0; i < perRow; i++) {
      const wx = x - w / 2 + 0.3 + (i * (w - 0.6)) / (perRow - 1);
      if (Math.abs(wx - x) < 0.95) continue; // the portico
      const wy = G + f * floor + 0.18;
      b.box([0.17, 0.42, 0.04], [wx, wy + 0.21, front + 0.02], WHITE);
      b.box([0.11, 0.34, 0.05], [wx, wy + 0.21, front + 0.03], WINDOW);
    }
  // The central portico: columns, a pediment and statues.
  b.block(x, front + 0.2, 1.8, 0.4, G, floor * 3, BRICK_SHADE);
  for (let i = 0; i < 4; i++) b.cylinder(x - 0.66 + i * 0.44, front + 0.45, 0.06, 0.07, G + 0.1, floor * 3 - 0.1, WHITE, 8);
  b.box([1.9, 0.12, 0.5], [x, G + floor * 3 + 0.06, front + 0.25], WHITE);
  b.prism(x, front + 0.25, 1.9, 0.42, 0.5, G + floor * 3 + 0.12, WHITE, true);
  // Rooftop statues along the parapet, and pavilions with small domes at both ends.
  const statues = detail === "low" ? 5 : 9;
  for (let i = 0; i < statues; i++) {
    const sx = x - w / 2 + 0.6 + (i * (w - 1.2)) / (statues - 1);
    if (Math.abs(sx - x) < 0.95) continue;
    b.block(sx, front - 0.05, 0.12, 0.12, G + floor * 3 + 0.08, 0.16, WHITE);
    b.sphere([sx, G + floor * 3 + 0.32, front - 0.05], 0.06, WHITE, 6);
  }
  for (const s of [-1, 1]) {
    b.block(x + s * (w / 2 - 0.45), z, 0.9, d + 0.1, G, floor * 3 + 0.3, BRICK);
    b.dome(x + s * (w / 2 - 0.45), z, 0.32, G + floor * 3 + 0.3, WHITE, 1.1, 10);
  }
  return b.build();
}

const CREAM = "#EFE2C6";
const CREAM_SHADE = "#D8C8A6";

export function buildShaheedMinar(detail: Detail): BufferGeometry {
  const b = new Builder();
  const { x, z } = at("shaheed-minar");
  const seg = detail === "low" ? 8 : 14;
  b.block(x, z, 1.3, 1.3, G, 0.12, CREAM_SHADE);
  // The flared base (square frustum) and the slim fluted shaft.
  b.cylinder(x, z, 0.36, 0.62, G + 0.12, 0.75, CREAM, 4);
  b.cylinder(x, z, 0.25, 0.3, G + 0.87, 0.18, CREAM_SHADE, seg);
  b.cylinder(x, z, 0.17, 0.24, G + 1.05, 5.0, CREAM, seg);
  for (const y of [2.2, 3.5, 4.8]) b.cylinder(x, z, 0.235, 0.235, G + y, 0.05, CREAM_SHADE, seg);
  // Two balconies, then the cupola.
  for (const [y, r] of [
    [6.05, 0.42],
    [6.6, 0.32],
  ] as const) {
    b.cylinder(x, z, r, r * 0.9, G + y, 0.08, CREAM_SHADE, seg);
    b.cylinder(x, z, 0.19, 0.19, G + y + 0.08, 0.3, CREAM, seg);
  }
  b.cylinder(x, z, 0.16, 0.17, G + 6.98, 0.2, CREAM, seg);
  b.dome(x, z, 0.19, G + 7.18, CREAM_SHADE, 1.4, seg);
  b.cone(x, z, 0.03, G + 7.42, 0.14, "#B48A3A", 6);
  return b.build();
}

export function buildBiswaBanglaGate(detail: Detail): BufferGeometry {
  const b = new Builder();
  const { x, z } = at("biswa-bangla-gate");
  const ringY = G + 4.25;
  const tilt = (12 * Math.PI) / 180;
  const seg = detail === "low" ? 24 : 48;
  // The ring, tilted, with a gold light line on its rim.
  b.torus([x, ringY, z], 2.05, 0.15, "#A9B1B6", [Math.PI / 2 + tilt, 0, 0], seg);
  b.torus([x, ringY + 0.05, z], 2.05, 0.05, "#F0C24A", [Math.PI / 2 + tilt, 0, 0], seg);
  // Slanted legs from both sides of the avenue up to the ring.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const footX = x + sx * 2.55;
      const footZ = z + sz * 1.05;
      const ringPoint: V3 = [x + sx * 1.75, ringY - sz * Math.sin(tilt) * 0.9 - 0.05, z + sz * 0.9];
      b.beam([footX, G, footZ], ringPoint, 0.16, "#8F979C");
      b.block(footX, footZ, 0.4, 0.4, G, 0.08, "#C9C3B8");
    }
  // The glass pod hanging at the centre, on four cables.
  const podY = ringY - 1.05;
  b.box([1.25, 0.5, 0.75], [x, podY, z], "#86B4C8");
  b.box([1.33, 0.06, 0.83], [x, podY + 0.28, z], "#D9D4CC");
  b.box([1.33, 0.06, 0.83], [x, podY - 0.28, z], "#D9D4CC");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([x + sx * 0.55, podY + 0.3, z + sz * 0.3], [x + sx * 1.6, ringY, z + sz * 1.2], 0.025, "#6C7378");
  return b.build();
}

export function buildHowrahStation(detail: Detail): BufferGeometry {
  const b = new Builder();
  const { x, z } = at("howrah-station");
  b.block(x, z, 3.4, 5.4, G, 1.7, BRICK);
  b.block(x, z, 3.5, 5.5, G + 1.7, 0.1, WHITE);
  // Corner towers with pyramid roofs, and a central clock tower.
  for (const sz of [-1, 1])
    for (const sx of [-1, 1]) {
      b.block(x + sx * 1.45, z + sz * 2.45, 0.7, 0.7, G, 2.5, BRICK_SHADE);
      b.cone(x + sx * 1.45, z + sz * 2.45, 0.52, G + 2.5, 0.7, "#6E3A2C", 4);
    }
  b.block(x + 1.45, z, 0.8, 0.8, G, 3.0, BRICK_SHADE);
  b.cone(x + 1.45, z, 0.6, G + 3.0, 0.6, "#6E3A2C", 4);
  b.box([0.05, 0.36, 0.36], [x + 1.86, G + 2.55, z], WHITE);
  if (detail !== "low")
    for (let i = 0; i < 8; i++)
      for (const y of [0.45, 1.15]) b.box([0.04, 0.34, 0.2], [x + 1.71, G + y, z - 2 + i * 0.57], "#4E2A22");
  return b.build();
}
