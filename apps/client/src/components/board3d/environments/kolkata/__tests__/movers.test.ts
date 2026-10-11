// Kolkata's ambient life: the right number of movers per quality, routes that
// never pass through the scenery (every triangle of every static model, the
// lamps and the trees), vehicles that never run into each other, and motion
// that is a smooth function of time.
import { describe, expect, it } from "vitest";
import type { BufferAttribute, BufferGeometry } from "three";
import { ENV_QUALITY } from "../../ambient";
import { buildBiswaBanglaGate, buildHowrahBridge, buildHowrahStation, buildShaheedMinar, buildVictoriaMemorial, buildWritersBuilding } from "../landmarks";
import { buildContemporaryDistrict, buildCulturalDistrict, buildHeritageDistrict, buildMaidanFurniture, buildRailings, buildRiversideDistrict } from "../districts";
import { BOARD_CLEAR, GROUND_Y, LAMPS, TREES, loopLength } from "../layout";
import { MOVER_SIZE, buildFerry, buildPedestrian, buildTaxi, buildTram, moverAt, moversFor, type Mover } from "../movers";

interface Aabb3 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function triangleBoxes(g: BufferGeometry, label: string): (Aabb3 & { label: string })[] {
  const pos = g.getAttribute("position") as BufferAttribute;
  const out: (Aabb3 & { label: string })[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const xs = [pos.getX(i), pos.getX(i + 1), pos.getX(i + 2)];
    const ys = [pos.getY(i), pos.getY(i + 1), pos.getY(i + 2)];
    const zs = [pos.getZ(i), pos.getZ(i + 1), pos.getZ(i + 2)];
    const maxY = Math.max(...ys);
    // Ground-level surfaces (courtyards, pools, the tops of the ghat steps) are walked and driven over.
    if (maxY < GROUND_Y + 0.05) continue;
    out.push({ label, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY, minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  }
  return out;
}

const contemporary = buildContemporaryDistrict("high");
const SCENERY = [
  ...triangleBoxes(buildHowrahBridge("high"), "howrah-bridge"),
  ...triangleBoxes(buildHowrahStation("high"), "howrah-station"),
  ...triangleBoxes(buildVictoriaMemorial("high"), "victoria-memorial"),
  ...triangleBoxes(buildWritersBuilding("high"), "writers-building"),
  ...triangleBoxes(buildShaheedMinar("high"), "shaheed-minar"),
  ...triangleBoxes(buildBiswaBanglaGate("high"), "biswa-bangla-gate"),
  ...triangleBoxes(buildHeritageDistrict("high"), "heritage-houses"),
  ...triangleBoxes(buildRiversideDistrict("high"), "ghats"),
  ...triangleBoxes(buildCulturalDistrict("high"), "book-stalls"),
  ...triangleBoxes(buildMaidanFurniture(), "maidan"),
  ...triangleBoxes(buildRailings("high"), "railings"),
  ...triangleBoxes(contemporary.solid, "contemporary-towers"),
  ...triangleBoxes(contemporary.glass, "contemporary-towers"),
  ...LAMPS.map((l) => ({ label: `lamp ${l.x},${l.z}`, minX: l.x - 0.09, maxX: l.x + 0.09, minZ: l.z - 0.09, maxZ: l.z + 0.09, minY: GROUND_Y, maxY: GROUND_Y + 1.2 })),
  ...TREES.flatMap((t) => [
    { label: `tree ${t.x},${t.z}`, minX: t.x - 0.11 * t.scale, maxX: t.x + 0.11 * t.scale, minZ: t.z - 0.11 * t.scale, maxZ: t.z + 0.11 * t.scale, minY: GROUND_Y, maxY: GROUND_Y + 0.9 * t.scale },
    {
      label: `canopy ${t.x},${t.z}`,
      minX: t.x - 0.75 * t.scale,
      maxX: t.x + 0.75 * t.scale,
      minZ: t.z - 0.75 * t.scale,
      maxZ: t.z + 0.75 * t.scale,
      minY: GROUND_Y + (1.25 - 0.62) * 0.85 * t.scale,
      maxY: GROUND_Y + (1.25 + 0.62) * 1.15 * t.scale,
    },
  ]),
];

/** The axis-aligned box a mover covers at an instant. */
function footprint(m: Mover, t: number): Aabb3 {
  const p = moverAt(m, t);
  const s = MOVER_SIZE[m.kind];
  const c = Math.abs(Math.cos(p.heading));
  const n = Math.abs(Math.sin(p.heading));
  const ex = (c * s.length + n * s.width) / 2;
  const ez = (n * s.length + c * s.width) / 2;
  return { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez, minY: m.loop.y + 0.01, maxY: m.loop.y + s.height };
}

/** Whether two movers' actual (rotated) footprints meet: a separating-axis test on the two rectangles. */
function collide(a: Mover, b: Mover, t: number): boolean {
  const rect = (m: Mover) => {
    const p = moverAt(m, t);
    const s = MOVER_SIZE[m.kind];
    // heading θ faces (cos θ, −sin θ) in (x, z).
    const f = { x: Math.cos(p.heading), z: -Math.sin(p.heading) };
    const r = { x: -f.z, z: f.x };
    return { c: { x: p.x, z: p.z }, axes: [f, r], half: [s.length / 2, s.width / 2] };
  };
  const A = rect(a);
  const B = rect(b);
  for (const axis of [...A.axes, ...B.axes]) {
    const project = (R: typeof A) => R.axes.reduce((sum, ax, i) => sum + Math.abs(ax.x * axis.x + ax.z * axis.z) * R.half[i]!, 0);
    const d = Math.abs((B.c.x - A.c.x) * axis.x + (B.c.z - A.c.z) * axis.z);
    if (d > project(A) + project(B)) return false;
  }
  return true;
}

const overlaps = (a: Aabb3, b: Aabb3) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ && a.minY < b.maxY && a.maxY > b.minY;

describe("Kolkata ambient life", () => {
  it("runs each quality's budget of taxis, trams, ferries and walkers", () => {
    for (const q of Object.values(ENV_QUALITY)) {
      const movers = moversFor(q);
      const count = (k: Mover["kind"]) => movers.filter((m) => m.kind === k).length;
      expect([count("taxi"), count("tram"), count("ferry"), count("pedestrian")]).toEqual([q.taxis, q.trams, q.ferries, q.pedestrians]);
    }
  });

  it("never drives, sails or walks through the scenery, nor onto the board", () => {
    for (const m of moversFor(ENV_QUALITY.high)) {
      // One full lap, in small steps.
      const lap = loopLength(m.loop) / m.speed;
      const local = SCENERY.filter((b) => b.maxX > m.loop.minX - 1.5 && b.minX < m.loop.maxX + 1.5 && b.maxZ > m.loop.minZ - 1.5 && b.minZ < m.loop.maxZ + 1.5);
      for (let t = 0; t < lap; t += 0.04 / m.speed) {
        const f = footprint(m, t);
        const hit = local.find((b) => overlaps(f, b));
        if (hit) expect.fail(`${m.kind} on ${m.loop.id} meets ${hit.label} at (${((f.minX + f.maxX) / 2).toFixed(2)}, ${((f.minZ + f.maxZ) / 2).toFixed(2)})`);
        const onBoard = f.maxX > -BOARD_CLEAR && f.minX < BOARD_CLEAR && f.maxZ > -BOARD_CLEAR && f.minZ < BOARD_CLEAR;
        if (onBoard) expect.fail(`${m.kind} on ${m.loop.id} reaches the board`);
      }
    }
  });

  it("keeps vehicles apart: no taxi, tram or ferry ever runs into another", () => {
    const vehicles = moversFor(ENV_QUALITY.high).filter((m) => m.kind !== "pedestrian");
    for (let t = 0; t < 600; t += 0.1) {
      for (let i = 0; i < vehicles.length; i++)
        for (let j = i + 1; j < vehicles.length; j++)
          if (collide(vehicles[i]!, vehicles[j]!, t)) expect.fail(`${vehicles[i]!.kind} (${vehicles[i]!.loop.id}) meets ${vehicles[j]!.kind} (${vehicles[j]!.loop.id}) at t=${t.toFixed(1)}`);
    }
  });

  it("moves smoothly: position is a continuous function of time (a dropped frame never makes anything jump)", () => {
    for (const m of moversFor(ENV_QUALITY.medium)) {
      for (let t = 0; t < 60; t += 0.25) {
        const a = moverAt(m, t);
        const b = moverAt(m, t + 0.05);
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(m.speed * 0.05 * 1.001 + 1e-9);
      }
    }
  });

  it("builds compact models with vertex colours, standing on y = 0 and facing +X", () => {
    const { body, head } = buildPedestrian();
    for (const [kind, g] of [
      ["taxi", buildTaxi()],
      ["tram", buildTram()],
      ["ferry", buildFerry()],
      ["pedestrian", body],
      ["pedestrian", head],
    ] as const) {
      const bb = g.boundingBox!;
      const s = MOVER_SIZE[kind];
      expect(bb.min.y, kind).toBeGreaterThanOrEqual(-1e-6);
      expect(bb.max.y, kind).toBeLessThanOrEqual(s.height + 1e-6);
      expect(bb.max.x - bb.min.x, `${kind} length`).toBeLessThanOrEqual(s.length + 1e-6);
      expect(bb.max.z - bb.min.z, `${kind} width`).toBeLessThanOrEqual(s.width + 1e-6);
      expect(g.getAttribute("color"), kind).toBeTruthy();
      expect(g.getAttribute("position").count / 3, `${kind} triangles`).toBeLessThan(800);
    }
  });
});
