// Kolkata's ambient life as data: who moves where, how fast, and the small
// procedural models (each built facing +X, centred on the origin, standing on
// y = 0, so a heading from loopPoint turns it along its route). Positions are
// a pure function of time, so a skipped or throttled frame never makes anything
// jump, and the tests can check every mover's whole route against the scenery.

import type { BufferGeometry } from "three";
import { Builder } from "../kit";
import type { EnvironmentQuality } from "../ambient";
import { FERRY_LOOPS, TAXI_LANES, TRAM_LOOP, WALK_LOOPS, loopLength, loopPoint, type Loop } from "./layout";

export type MoverKind = "taxi" | "tram" | "ferry" | "pedestrian";

export interface Mover {
  kind: MoverKind;
  loop: Loop;
  /** Arc length at time 0. */
  offset: number;
  /** World units per second along the loop. */
  speed: number;
  seed: number;
}

/** Each kind's footprint (length along its heading, width across) and height, for the clearance tests. */
export const MOVER_SIZE: Readonly<Record<MoverKind, { length: number; width: number; height: number }>> = {
  taxi: { length: 0.66, width: 0.3, height: 0.42 },
  tram: { length: 2.1, width: 0.52, height: 0.86 },
  ferry: { length: 1.4, width: 0.52, height: 0.62 },
  pedestrian: { length: 0.12, width: 0.12, height: 0.42 },
};

const SPEED: Readonly<Record<MoverKind, number>> = { taxi: 1.5, tram: 0.6, ferry: 0.4, pedestrian: 0.22 };

/** Spreads `count` movers round-robin over `loops`, evenly spaced on each, all at one speed per loop (so they never catch each other up). */
function spread(kind: MoverKind, loops: readonly Loop[], count: number, speedFor: (loop: Loop) => number = () => SPEED[kind]): Mover[] {
  const perLoop = loops.map((_, i) => Math.floor(count / loops.length) + (i < count % loops.length ? 1 : 0));
  return loops.flatMap((loop, li) => {
    const n = perLoop[li]!;
    const L = loopLength(loop);
    return Array.from({ length: n }, (_, k) => ({ kind, loop, offset: ((k + 0.37 * li) / n) * L, speed: speedFor(loop), seed: li * 31 + k }));
  });
}

/** Everything that moves, for a quality level. */
export function moversFor(q: Pick<EnvironmentQuality, "taxis" | "trams" | "ferries" | "pedestrians">): Mover[] {
  return [
    // The inner lane runs a touch faster than the outer, so the traffic never looks synchronised.
    ...spread("taxi", TAXI_LANES, q.taxis, (l) => (l === TAXI_LANES[0] ? SPEED.taxi : SPEED.taxi * 0.86)),
    ...spread("tram", [TRAM_LOOP], q.trams),
    ...spread("ferry", FERRY_LOOPS, q.ferries),
    // Walkers: the longer paths get more people; each keeps one pace so nobody walks through anyone ahead.
    ...spread("pedestrian", WALK_LOOPS, q.pedestrians, (l) => SPEED.pedestrian * (0.85 + (WALK_LOOPS.indexOf(l) % 3) * 0.12)),
  ];
}

/** Where a mover is at time `t` (seconds), and which way it faces. */
export function moverAt(m: Mover, t: number): { x: number; z: number; heading: number } {
  return loopPoint(m.loop, m.offset + m.speed * t);
}

// ── Models ─────────────────────────────────────────────────────────────────

const TYRE = "#1F1D1B";
const CHROME = "#C9C6BE";
const GLASS = "#3A4650";

/** A yellow Ambassador taxi: the rounded, upright 1950s saloon of Kolkata's streets. */
export function buildTaxi(): BufferGeometry {
  const b = new Builder();
  const yellow = "#F2BE22";
  // Wheels, body, the bonnet and boot sloping off the cabin, and the domed roof.
  for (const x of [-0.2, 0.2]) for (const z of [-0.13, 0.13]) b.box([0.13, 0.12, 0.04], [x, 0.06, z], TYRE);
  b.box([0.62, 0.13, 0.28], [0, 0.135, 0], yellow);
  b.box([0.58, 0.03, 0.26], [0, 0.215, 0], yellow);
  b.box([0.34, 0.1, 0.25], [-0.03, 0.28, 0], GLASS);
  b.box([0.3, 0.035, 0.24], [-0.03, 0.345, 0], yellow);
  b.box([0.03, 0.1, 0.27], [-0.03, 0.28, 0], yellow); // the B-pillar
  // Chrome bumpers and grille, headlamps, and the roof sign.
  for (const s of [-1, 1]) b.box([0.025, 0.04, 0.29], [s * 0.315, 0.09, 0], CHROME);
  b.box([0.01, 0.06, 0.14], [0.312, 0.15, 0], CHROME);
  for (const z of [-0.09, 0.09]) b.box([0.012, 0.035, 0.035], [0.314, 0.16, z], "#FFF4D0");
  b.box([0.08, 0.04, 0.12], [-0.03, 0.38, 0], "#E8E1CF");
  return b.build();
}

/** A Kolkata tram car: the blue-and-white single-deck car with a trolley pole. */
export function buildTram(): BufferGeometry {
  const b = new Builder();
  const cream = "#EEE6D2";
  const blue = "#2F5F9E";
  b.box([2.0, 0.08, 0.46], [0, 0.07, 0], "#3B3835"); // the underframe and bogies
  for (const x of [-0.65, 0.65]) b.box([0.42, 0.1, 0.4], [x, 0.05, 0], TYRE);
  b.box([2.06, 0.22, 0.5], [0, 0.22, 0], blue);
  b.box([2.06, 0.22, 0.5], [0, 0.44, 0], cream);
  // A band of windows down each side, and the cab windows at both ends.
  b.box([1.8, 0.14, 0.505], [0, 0.45, 0], GLASS);
  for (let i = 0; i < 7; i++) b.box([0.03, 0.15, 0.51], [-0.86 + i * 0.287, 0.45, 0], cream);
  for (const s of [-1, 1]) b.box([0.01, 0.14, 0.36], [s * 1.031, 0.45, 0], GLASS);
  b.box([2.0, 0.05, 0.46], [0, 0.575, 0], "#D9D1BE"); // the roof
  b.box([1.6, 0.04, 0.3], [0, 0.615, 0], "#B9B1A0");
  // The trolley pole, raised to the overhead wire.
  b.beam([-0.4, 0.64, 0], [0.25, 0.84, 0], 0.025, "#3B3835");
  b.box([0.08, 0.02, 0.04], [0.26, 0.85, 0], "#3B3835");
  return b.build();
}

/** A Hooghly ferry: a wooden-hulled river launch with a covered deck. */
export function buildFerry(): BufferGeometry {
  const b = new Builder();
  b.box([1.24, 0.16, 0.48], [0, 0.08, 0], "#6A4A34");
  b.box([0.14, 0.14, 0.3], [0.68, 0.09, 0], "#6A4A34"); // the bow
  b.box([1.26, 0.04, 0.5], [0, 0.18, 0], "#F1E9D8");
  b.box([0.78, 0.2, 0.42], [-0.08, 0.3, 0], "#F1E9D8");
  b.box([0.74, 0.08, 0.425], [-0.08, 0.33, 0], GLASS);
  b.box([0.86, 0.04, 0.48], [-0.08, 0.42, 0], "#2F6B8A");
  b.cylinder(-0.38, 0, 0.035, 0.035, 0.44, 0.16, "#2E2925", 6); // the funnel
  return b.build();
}

/** A walker: legs, a body (tinted per person: saris, kurtas, shirts) and a head. Body and head are separate meshes so only the clothes are tinted. */
export function buildPedestrian(): { body: BufferGeometry; head: BufferGeometry } {
  const body = new Builder()
    .cylinder(0, 0, 0.022, 0.03, 0, 0.14, "#3B3835", 6)
    .cylinder(0, 0, 0.045, 0.058, 0.13, 0.2, "#FFFFFF", 8)
    .build();
  const head = new Builder().sphere([0, 0.375, 0], 0.04, "#8A5A3C", 8).box([0.07, 0.02, 0.07], [-0.005, 0.405, 0], "#1F1A17").build();
  return { body, head };
}

/** Clothes: saris, kurtas and shirts in Kolkata's colours. */
export const CLOTHES = ["#C8312B", "#F2C230", "#2E6E9E", "#F4EEE2", "#3E7A55", "#D96A2B", "#8C3A6B", "#E8B4A0", "#45526B", "#B6852F"] as const;
