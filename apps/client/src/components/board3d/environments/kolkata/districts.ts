// The four player districts of the 3D Kolkata, round one city (C.2B):
//  - crimson (north-west): North Kolkata heritage houses with green shutters,
//    balconies and parapets, a courtyard and a tea stall for adda;
//  - royal blue (north-east): the riverside ghats, a small temple, a jetty
//    and moored boats on the Hooghly;
//  - emerald (south-east): the Maidan and cultural Kolkata, College Street
//    book stalls and benches (its trees and trams are in the ambient layer);
//  - golden (south-west): contemporary Kolkata, glass towers, a plaza and the
//    avenue under the Biswa Bangla Gate.
// Plus the riverside railings and the lamp posts. Static and merged.

import type { BufferGeometry } from "three";
import { Builder, hash01 } from "../kit";
import type { EnvironmentQuality } from "../ambient";
import { GROUND_Y as G, LAMPS, LANDMARKS, RIVER, WATER_Y } from "./layout";

type Detail = EnvironmentQuality["detail"];
const box = (id: string) => LANDMARKS.find((l) => l.id === id)!.box;

const HOUSE_COLOURS = ["#E4B66C", "#E7A79C", "#EFD99F", "#A9C6CE", "#D88E63", "#F0E1C2", "#C9D59A"] as const;
const SHUTTER = "#3E7A55";
const CORNICE = "#F4ECDD";

/**
 * A signboard: a coloured panel with pale bands standing in for lettering (no text textures), centred on
 * (x, y, z). It faces +z (a panel across x) or, with `acrossZ`, +x.
 */
function signboard(b: Builder, x: number, y: number, z: number, w: number, h: number, colour: string, acrossZ = false, ink = "#F6EEDC") {
  const size = (u: number, v: number, t: number): [number, number, number] => (acrossZ ? [t, v, u] : [u, v, t]);
  const front = (d: number): [number, number, number] => (acrossZ ? [x + d, y, z] : [x, y, z + d]);
  b.box(size(w, h, 0.03), [x, y, z], colour);
  const lines = h > 0.14 ? 2 : 1;
  for (let i = 0; i < lines; i++) {
    const at = front(0.017);
    at[1] = y + (lines === 1 ? 0 : (i === 0 ? 0.25 : -0.22) * h);
    b.box(size(w * (i === 0 ? 0.72 : 0.5), h * 0.16, 0.01), at, ink);
  }
}

/** A Bengali heritage house facing +z: floors with shuttered windows, balconies and a parapet. */
function house(b: Builder, x: number, front: number, w: number, depth: number, floors: number, colour: string, detail: Detail, seed: number) {
  const fh = 0.74;
  const z = front - depth / 2;
  b.block(x, z, w, depth, G, floors * fh, colour);
  for (let f = 0; f < floors; f++) {
    const y = G + f * fh;
    b.box([w + 0.04, 0.05, 0.06], [x, y + fh - 0.02, front + 0.01], CORNICE);
    const windows = Math.max(2, Math.round(w / 0.42));
    for (let i = 0; i < windows; i++) {
      const wx = x - w / 2 + (w * (i + 0.5)) / windows;
      if (f === 0 && i === Math.floor(windows / 2)) {
        b.box([0.24, 0.5, 0.04], [wx, y + 0.25, front + 0.02], "#5B3A28"); // the door
        continue;
      }
      b.box([0.2, 0.38, 0.04], [wx, y + 0.34, front + 0.02], SHUTTER);
      if (detail !== "low") b.box([0.02, 0.38, 0.05], [wx, y + 0.34, front + 0.025], "#2F5E41");
    }
    // Balconies on the upper floors, with railings.
    if (f > 0 && hash01(seed * 7 + f) > 0.25) {
      b.box([w * 0.8, 0.05, 0.28], [x, y + 0.02, front + 0.14], CORNICE);
      if (detail === "low") b.box([w * 0.8, 0.18, 0.03], [x, y + 0.13, front + 0.27], "#E8DDC8");
      else {
        b.box([w * 0.8, 0.03, 0.03], [x, y + 0.22, front + 0.27], "#3E3A36");
        const posts = Math.round(w * 6);
        for (let p = 0; p <= posts; p++) b.box([0.015, 0.2, 0.015], [x - w * 0.4 + (w * 0.8 * p) / posts, y + 0.12, front + 0.27], "#3E3A36");
      }
    }
  }
  // Shop signboards over the doors of some houses.
  if (seed % 2 === 0) signboard(b, x, G + 0.62, front + 0.03, w * 0.56, 0.1, ["#B5543C", "#2F5F9E", "#3E7A55", "#C9893F"][(seed / 2) % 4]!);
  // The parapet with small pillars.
  const top = G + floors * fh;
  b.box([w + 0.06, 0.16, depth + 0.06], [x, top + 0.08, z], CORNICE);
  if (detail === "high") for (let p = 0; p < 4; p++) b.box([0.06, 0.12, 0.06], [x - w / 2 + 0.05 + (p * (w - 0.1)) / 3, top + 0.22, front], CORNICE);
}

export function buildHeritageDistrict(detail: Detail): BufferGeometry {
  const b = new Builder();
  const area = box("heritage-houses");
  // House fronts sit back so the balconies (0.3 deep) stay inside the district.
  const front = area.maxZ - 0.32;
  let x = area.minX + 0.05;
  let i = 0;
  while (x < area.maxX - 0.6) {
    const w = 0.95 + hash01(i + 11) * 0.55;
    if (x + w > area.maxX) break;
    // A courtyard gap after the third house.
    if (i === 3) {
      b.block(x + 0.45, front - 1.1, 0.9, 2.2, G, 0.03, "#CDB48E");
      x += 1.0;
    }
    const floors = 2 + Math.floor(hash01(i + 21) * 2);
    house(b, x + w / 2, front - hash01(i + 31) * 0.15, w, 2.3, floors, HOUSE_COLOURS[i % HOUSE_COLOURS.length]!, detail, i);
    x += w + 0.04;
    i++;
  }
  // The tea stall and benches for adda.
  const t = LANDMARKS.find((l) => l.id === "tea-stall")!.at;
  b.block(t.x, t.z, 0.8, 0.45, G, 0.5, "#8A5A3A");
  b.box([1.0, 0.04, 0.7], [t.x, G + 0.85, t.z + 0.05], "#D9622B");
  for (const sx of [-1, 1]) b.box([0.04, 0.35, 0.04], [t.x + sx * 0.45, G + 0.68, t.z + 0.35], "#5B3A28");
  b.cylinder(t.x + 0.15, t.z + 0.1, 0.06, 0.07, G + 0.5, 0.12, "#B87333", 8);
  for (const sx of [-1, 1]) b.block(t.x + sx * 0.75, t.z + 0.3, 0.55, 0.16, G, 0.18, "#7A5236");
  signboard(b, t.x, G + 0.95, t.z + 0.05, 0.7, 0.13, "#F2C230", false, "#8C2F1F");
  // A blue street-name sign on its post at the end of the row.
  const sx = area.maxX - 0.2;
  const sz = area.maxZ - 0.12;
  b.cylinder(sx, sz, 0.018, 0.022, G, 0.95, "#3E3A36", 6);
  signboard(b, sx, G + 0.86, sz, 0.42, 0.14, "#2F5F9E");
  return b.build();
}

export function buildRiversideDistrict(detail: Detail): BufferGeometry {
  const b = new Builder();
  const area = box("ghats");
  // The ghats: broad stone steps from the promenade down into the river.
  const steps = 5;
  const top = -11.2;
  const bottom = RIVER.north.maxZ - 0.6;
  const depth = (top - bottom) / steps;
  const x0 = area.minX + 1.8;
  const x1 = area.maxX - 2.0;
  for (let s = 0; s < steps; s++) {
    const zFront = top - s * depth;
    const y = G - ((G - WATER_Y + 0.1) * s) / steps;
    b.block((x0 + x1) / 2, zFront - depth / 2, x1 - x0, depth + 0.02, WATER_Y - 0.05, y - WATER_Y + 0.05, s % 2 ? "#D7C7AA" : "#CDBC9D");
  }
  // A small Bengal-style temple on the ghat: curved (dochala) roof and a spire.
  const tx = area.minX + 0.9;
  const tz = -12.6;
  b.block(tx, tz, 1.0, 1.0, G, 0.9, "#E7D3B0");
  b.dome(tx, tz, 0.62, G + 0.9, "#C9784A", 0.8, 12);
  b.cone(tx, tz, 0.08, G + 1.4, 0.45, "#B48A3A", 6);
  b.box([0.3, 0.5, 0.05], [tx, G + 0.3, tz + 0.51], "#6E3A2C");
  // A notice board for the ghat, on two posts by the temple.
  for (const dx of [-0.2, 0.2]) b.block(tx + 0.75 + dx, -11.62, 0.035, 0.035, G, 0.62, "#5B4632");
  signboard(b, tx + 0.75, G + 0.52, -11.6, 0.5, 0.2, "#7A2E2A");
  // The jetty: a wooden platform into the river on posts, with a shelter.
  const jx = area.maxX - 1.1;
  b.box([0.9, 0.08, 2.0], [jx, G - 0.02, -14.0], "#8A6A4A");
  for (const z of [-13.3, -14.1, -14.85]) for (const sx of [-1, 1]) b.block(jx + sx * 0.4, z, 0.08, 0.08, WATER_Y - 0.1, G - WATER_Y + 0.08, "#5B4632");
  for (const sx of [-1, 1]) for (const z of [-14.15, -14.7]) b.block(jx + sx * 0.35, z, 0.06, 0.06, G, 0.75, "#5B4632");
  b.box([1.0, 0.06, 0.9], [jx, G + 0.78, -14.42], "#B5543C");
  // Moored country boats (not on Low).
  for (const [bx, bz] of (detail === "low" ? [] : [
    [area.minX + 2.6, -14.5],
    [area.minX + 3.6, -14.8],
  ] as const)) {
    b.block(bx, bz, 1.1, 0.34, WATER_Y, 0.12, "#5B4632");
    b.box([0.5, 0.18, 0.3], [bx, WATER_Y + 0.21, bz], "#C9A46A");
  }
  return b.build();
}

export function buildCulturalDistrict(detail: Detail): BufferGeometry {
  const b = new Builder();
  const area = box("book-stalls");
  // College Street book stalls: wooden stalls, awnings, stacks of books in many colours.
  const books = ["#B5543C", "#2F6FA8", "#E9B35A", "#4D7C5B", "#7C4A8C", "#C9893F", "#365A7A", "#E7DDC8"];
  const stalls = 6;
  for (let i = 0; i < stalls; i++) {
    const sx = area.minX + 0.6 + (i * (area.maxX - area.minX - 1.2)) / (stalls - 1);
    const sz = (area.minZ + area.maxZ) / 2;
    b.block(sx, sz, 0.85, 0.5, G, 0.42, "#7A5236");
    b.prism(sx, sz - 0.05, 0.75, 0.16, 0.95, G + 0.72, i % 2 ? "#3E7A55" : "#B5543C");
    for (const px of [-0.4, 0.4]) b.box([0.04, 0.3, 0.04], [sx + px, G + 0.57, sz - 0.22], "#5B3A28");
    const n = detail === "low" ? 4 : 8;
    for (let k = 0; k < n; k++) b.box([0.08, 0.1 + hash01(i * 13 + k) * 0.08, 0.3], [sx - 0.33 + (k * 0.66) / (n - 1), G + 0.47 + hash01(i * 7 + k) * 0.03, sz], books[(i + k) % books.length]!);
  }
  // The College Street banner on two posts behind the stalls.
  const bz = area.maxZ - 0.08;
  for (const px of [area.minX + 0.5, area.maxX - 0.5]) b.block(px, bz, 0.04, 0.04, G, 0.92, "#3E3A36");
  signboard(b, (area.minX + area.maxX) / 2, G + 0.84, bz, area.maxX - area.minX - 1.2, 0.14, "#8C2F1F");
  return b.build();
}

/** The Maidan's street furniture: benches along its paths and a tram shelter. */
export function buildMaidanFurniture(): BufferGeometry {
  const b = new Builder();
  // Benches along the Maidan paths.
  for (const [x, z] of [
    [13.6, 7.0],
    [17.0, 7.0],
    [20.4, 7.0],
    [13.6, -2.0],
    [20.4, -2.0],
  ] as const) {
    b.box([0.75, 0.05, 0.22], [x, G + 0.2, z], "#7A5236");
    b.box([0.75, 0.18, 0.04], [x, G + 0.32, z - 0.1], "#7A5236");
    for (const sx of [-1, 1]) b.box([0.04, 0.2, 0.2], [x + sx * 0.32, G + 0.1, z], "#3E3A36");
  }
  // A tram shelter at the stop on the Maidan's west side.
  b.box([0.5, 0.05, 1.3], [11.65, G + 0.82, 5.2], "#3E7A55");
  for (const z of [4.65, 5.75]) b.block(11.65, z, 0.05, 0.05, G, 0.8, "#3E3A36");
  // The tram stop's sign, on its own post.
  b.cylinder(11.65, 4.2, 0.018, 0.022, G, 0.84, "#3E3A36", 6);
  signboard(b, 11.65, G + 0.76, 4.2, 0.26, 0.16, "#F2C230", true, "#2F5F9E");
  return b.build();
}

export function buildContemporaryDistrict(detail: Detail): { solid: BufferGeometry; glass: BufferGeometry } {
  const solid = new Builder();
  const glass = new Builder();
  const area = box("contemporary-towers");
  // The avenue under the gate, and the plaza.
  solid.box([2.0, 0.02, area.maxZ - 10.75], [-5, G + 0.01, (10.75 + area.maxZ) / 2], "#8C8178");
  solid.box([4.8, 0.02, 1.4], [-5.2, G + 0.012, 11.7], "#E4DCCD");
  // Towers either side of the avenue: glass with floor bands and pale frames. Heights stay under the aerial camera's sightline.
  const towers = [
    [-9.4, 13.4, 1.6, 1.4, 3.6],
    [-9.2, 16.6, 1.9, 1.8, 5.2],
    [-8.9, 20.8, 2.2, 2.0, 6.0],
    [-1.6, 13.6, 1.4, 1.5, 3.4],
    [-0.4, 17.4, 2.0, 1.8, 5.6],
    [0.9, 21.4, 1.8, 1.8, 4.6],
  ] as const;
  for (const [i, [x, z, w, d, h]] of towers.entries()) {
    glass.block(x, z, w, d, G, h, i % 2 ? "#8EB0C2" : "#9BB9C4");
    const bands = detail === "low" ? Math.round(h / 1.2) : Math.round(h / 0.5);
    for (let k = 1; k <= bands; k++) solid.box([w + 0.04, 0.04, d + 0.04], [x, G + (k * h) / (bands + 1), z], "#E9ECEC");
    solid.block(x, z, w + 0.1, d + 0.1, G + h, 0.12, "#DADFE0");
    if (detail !== "low") solid.block(x, z, w * 0.4, d * 0.4, G + h + 0.12, 0.3, "#C9CED0");
  }
  // A sculpture and planters on the plaza.
  solid.cylinder(-7.4, 11.7, 0.12, 0.18, G, 0.55, "#C9A24A", 8);
  solid.sphere([-7.4, G + 0.75, 11.7], 0.22, "#E0B84A", 10);
  for (const x of [-3.2, -5.3]) solid.block(x, 11.7, 0.5, 0.5, G, 0.25, "#7C9A5B");
  // A wayfinding totem in the Biswa Bangla colours.
  solid.block(-8.6, 11.7, 0.16, 0.12, G, 0.72, "#2D3A4A");
  signboard(solid, -8.6, G + 0.5, 11.77, 0.14, 0.34, "#E9B35A", false, "#2D3A4A");
  return { solid: solid.build(), glass: glass.build() };
}

/** Lamp posts (one geometry, instanced) and the riverside railings (merged). */
export function buildLampPost(): BufferGeometry {
  const b = new Builder();
  b.cylinder(0, 0, 0.035, 0.06, 0, 1.15, "#2E2925", 8);
  b.cylinder(0, 0, 0.09, 0.09, 0, 0.12, "#2E2925", 8);
  b.box([0.3, 0.03, 0.03], [0.1, 1.12, 0], "#2E2925");
  b.cylinder(0.22, 0, 0.08, 0.06, 0.98, 0.14, "#FFD98E", 8);
  b.cone(0.22, 0, 0.1, 1.11, 0.08, "#2E2925", 8);
  return b.build();
}

export function buildRailings(detail: Detail): BufferGeometry {
  const b = new Builder();
  const spacing = detail === "low" ? 0.8 : 0.4;
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    b.beam([x0, G + 0.38, z0], [x1, G + 0.38, z1], 0.04, "#2E2925");
    b.beam([x0, G + 0.22, z0], [x1, G + 0.22, z1], 0.03, "#2E2925");
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / spacing));
    for (let i = 0; i <= n; i++) b.box([0.04, 0.4, 0.04], [x0 + ((x1 - x0) * i) / n, G + 0.2, z0 + ((z1 - z0) * i) / n], "#2E2925");
  };
  // Along the west promenade (both sides of the bridge's landing) and the north bank.
  rail(RIVER.west.maxX + 0.08, -10.8, RIVER.west.maxX + 0.08, 5.6);
  rail(RIVER.west.maxX + 0.08, 7.6, RIVER.west.maxX + 0.08, 12);
  rail(-10.6, RIVER.north.maxZ + 0.08, 7.2, RIVER.north.maxZ + 0.08);
  return b.build();
}

export const LAMP_POSITIONS = LAMPS;
