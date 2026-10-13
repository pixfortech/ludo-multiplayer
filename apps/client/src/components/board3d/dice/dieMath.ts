// The 3D die as plain math (three.js vectors and quaternions, no scene), so
// the rules are tested directly:
//  - which face carries which value: a standard die (opposite faces sum to
//    seven; 1, 2 and 3 run counter-clockwise round their shared corner), and
//    the orientation that shows a value on top;
//  - where the die rests in each base (on the side away from the start cell,
//    clear of the people and their path out), and where it is held before a
//    throw (over the base's outer edge);
//  - a throw: from wherever the die is, through a lift into the hand, a
//    bouncing, rolling arc, to its resting spot, ending exactly on the server's
//    value. Which way it turns and how it wobbles vary with a seed; the value
//    never does, and the die never decides one.

import { Quaternion, Vector3 } from "three";
import { baseSlotToWorld, tokenPositionToWorld, type WorldPoint } from "@ludo/board-layouts";

export const UP = new Vector3(0, 1, 0);

/** Each value's face normal in the die's own frame. */
export const FACE_NORMALS: Readonly<Record<number, Vector3>> = {
  1: new Vector3(0, 1, 0),
  6: new Vector3(0, -1, 0),
  3: new Vector3(1, 0, 0),
  4: new Vector3(-1, 0, 0),
  2: new Vector3(0, 0, 1),
  5: new Vector3(0, 0, -1),
};

/** The values on a box geometry's faces, in its face order (+x, −x, +y, −y, +z, −z). */
export const BOX_FACE_VALUES = [3, 4, 1, 6, 2, 5] as const;

/** The orientation showing `value` on top, turned `yaw` radians about the vertical. */
export function faceUp(value: number, yaw = 0): Quaternion {
  const n = FACE_NORMALS[value];
  if (!n) throw new RangeError(`A die has no face ${value}`);
  const tilt = new Quaternion().setFromUnitVectors(n, UP);
  return new Quaternion().setFromAxisAngle(UP, yaw).multiply(tilt);
}

/** The value on top for an orientation (the face whose normal points most nearly up). */
export function valueUp(q: Quaternion): number {
  let best = 1;
  let bestY = -2;
  for (const [v, n] of Object.entries(FACE_NORMALS)) {
    const y = n.clone().applyQuaternion(q).y;
    if (y > bestY) {
      bestY = y;
      best = Number(v);
    }
  }
  return best;
}

/** A small deterministic generator (mulberry32) for the throw's variation: never for a value. */
export function variation(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far the die rests from the base's centre (world units; slots are 1.41 away diagonally). */
const REST_OFFSET = 1.4;

/**
 * Where the die rests in `seat`'s base: on the side of the inner square away from the start cell, between
 * two slots, so no one leaving the base walks through it. `out` points from there toward the board's edge.
 */
export function restSpot(seat: number): { at: WorldPoint; out: WorldPoint } {
  const slots = [0, 1, 2, 3].map((s) => baseSlotToWorld(seat, s));
  const centre = { x: slots.reduce((a, s) => a + s.x, 0) / 4, z: slots.reduce((a, s) => a + s.z, 0) / 4 };
  const start = tokenPositionToWorld(seat, 0);
  const dx = start.x - centre.x;
  const dz = start.z - centre.z;
  const out = Math.abs(dx) > Math.abs(dz) ? { x: -Math.sign(dx), z: 0 } : { x: 0, z: -Math.sign(dz) };
  return { at: { x: centre.x + out.x * REST_OFFSET, z: centre.z + out.z * REST_OFFSET }, out };
}

/** Where the die is held before it is thrown: up over the base's outer edge, behind its resting spot. */
export function handSpot(seat: number, floor: number, size: number): Vector3 {
  const { at, out } = restSpot(seat);
  return new Vector3(at.x + out.x * 1.15, floor + size * 0.5 + 1.25, at.z + out.z * 1.15);
}

/** The die's size on the board (world units): a little under a cell, larger on small screens so it stays legible. */
export function dieSize(boardPx: number): number {
  const pxPerUnit = boardPx / 16.2;
  return Math.min(1, Math.max(0.78, 30 / Math.max(1, pxPerUnit)));
}

export interface ThrowOptions {
  /** The value it must land on (the server's). */
  value: number;
  /** Where it is now, and how it is turned. */
  from: Vector3;
  q0: Quaternion;
  /** Where it is held for the throw, and where it comes to rest (its centre). */
  hand: Vector3;
  to: Vector3;
  size: number;
  seed: number;
  /** Extra whole turns while it tumbles (2 for a throw, 1 for a short toss to the next player). */
  turns?: number;
  /** Peak of the arc above the resting height (defaults to a throw's). */
  peak?: number;
}

export interface Throw {
  from: Vector3;
  hand: Vector3;
  to: Vector3;
  /** Share of the time spent moving into the hand (0 when it is already there). */
  lift: number;
  q0: Quaternion;
  /** The final orientation: `value` on top. */
  q1: Quaternion;
  /** It turns about `axis` by `angle` (radians) in all: exactly q0 → q1, plus whole turns. */
  axis: Vector3;
  angle: number;
  /** A small wobble about the direction of travel, zero at both ends. */
  wobbleAxis: Vector3;
  wobble: number;
  /** Peak heights above the resting height: the arc, then two bounces. */
  peaks: [number, number, number];
}

/**
 * Plans a throw that ends exactly on `value`. Of the orientations showing `value` on top (any turn about
 * the vertical), it picks the one reached by rolling forward along the direction of travel, so the tumble
 * reads as the die rolling the way it moves.
 */
export function planThrow(o: ThrowOptions): Throw {
  const rnd = variation(o.seed);
  const travel = new Vector3().subVectors(o.to, o.hand).setY(0);
  const dir = travel.lengthSq() > 1e-6 ? travel.normalize() : new Vector3(0, 0, 1);
  const rollAxis = new Vector3().crossVectors(UP, dir).normalize();
  const offset = rnd() * Math.PI * 2;
  let best: { q1: Quaternion; axis: Vector3; angle: number; score: number } | null = null;
  for (let i = 0; i < 24; i++) {
    const q1 = faceUp(o.value, offset + (i / 24) * Math.PI * 2);
    const d = q1.clone().multiply(o.q0.clone().invert());
    if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w); // the shorter way: angle in [0, π]
    const s = Math.sqrt(Math.max(0, 1 - d.w * d.w));
    let angle = 2 * Math.acos(Math.min(1, d.w));
    let axis = s < 1e-6 ? rollAxis.clone() : new Vector3(d.x / s, d.y / s, d.z / s);
    if (axis.dot(rollAxis) < 0) {
      // The same rotation, about the opposite axis the long way round: always forward.
      axis = axis.negate();
      angle = 2 * Math.PI - angle;
    }
    const score = axis.dot(rollAxis) + rnd() * 0.05;
    if (!best || score > best.score) best = { q1, axis, angle, score };
  }
  const liftDistance = o.from.distanceTo(o.hand);
  const peak = o.peak ?? o.size * (1.5 + rnd() * 0.5);
  return {
    from: o.from.clone(),
    hand: o.hand.clone(),
    to: o.to.clone(),
    lift: liftDistance < 0.05 ? 0 : Math.min(0.3, 0.12 + liftDistance * 0.05),
    q0: o.q0.clone(),
    q1: best!.q1,
    axis: best!.axis,
    angle: best!.angle + (o.turns ?? 2) * 2 * Math.PI,
    wobbleAxis: dir,
    wobble: (0.2 + rnd() * 0.2) * (rnd() < 0.5 ? -1 : 1),
    peaks: [peak, o.size * 0.42, o.size * 0.14],
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => x * x * (3 - 2 * x);

/** A parabola from height `y0` (τ = 0) to 0 (τ = 1) with its highest point at `peak` (≥ y0). */
function arc(y0: number, peak: number, tau: number): number {
  const p = Math.max(peak, y0);
  const b = 2 * (p - y0) + 2 * Math.sqrt(Math.max(0, (p - y0) * p));
  const a = -b - y0;
  return Math.max(0, a * tau * tau + b * tau + y0);
}

/** The die's height above its resting height, `u` of the way through the throw proper (after the lift). */
export function bounceHeight(t: Throw, u: number): number {
  const startY = t.hand.y - t.to.y;
  if (u < 0.5) return arc(startY, t.peaks[0], u / 0.5);
  if (u < 0.75) return arc(0, t.peaks[1], (u - 0.5) / 0.25);
  if (u < 0.88) return arc(0, t.peaks[2], (u - 0.75) / 0.13);
  return 0;
}

/** Where the die is and how it is turned at `k` (0 → 1) of the throw. At k = 1: exactly `to`, `value` on top. */
export function sampleThrow(t: Throw, k: number, out: { position: Vector3; quaternion: Quaternion }): void {
  const x = clamp01(k);
  if (t.lift > 0 && x < t.lift) {
    out.position.lerpVectors(t.from, t.hand, easeInOut(x / t.lift));
  } else {
    const u = t.lift >= 1 ? 1 : (x - t.lift) / (1 - t.lift);
    const h = 1 - Math.pow(1 - u, 2.2); // decelerating along the ground
    out.position.set(t.hand.x + (t.to.x - t.hand.x) * h, t.to.y + bounceHeight(t, u), t.hand.z + (t.to.z - t.hand.z) * h);
  }
  if (x >= 1) {
    out.position.copy(t.to);
    out.quaternion.copy(t.q1);
    return;
  }
  const s = 1 - Math.pow(1 - x, 2.4); // most of the turning in the air, the last of it rolling to a stop
  const roll = new Quaternion().setFromAxisAngle(t.axis, t.angle * s);
  const wobble = new Quaternion().setFromAxisAngle(t.wobbleAxis, t.wobble * Math.sin(Math.PI * x) * Math.sin(3 * Math.PI * x));
  out.quaternion.copy(wobble).multiply(roll).multiply(t.q0);
}

/**
 * Where a die mounting now starts (a first load, another view or quality level): in the base of the seat whose
 * turn it is, showing the server's latest value. A throw still in the air is not over: `resumeMs` is the time it
 * has left, so the die carries on and lands on its value; a throw that has ended is simply shown at rest.
 */
export function mountedDie(
  die: { seat: number | null; value: number | null; throw: { value: number; seat: number; ms: number; at: number } | null },
  now: number,
): { seat: number; value: number; resumeMs: number | null } {
  const t = die.throw;
  const remaining = t ? t.ms - (now - t.at) : 0;
  if (t && remaining > 40) return { seat: t.seat, value: t.value, resumeMs: remaining };
  return { seat: die.seat ?? t?.seat ?? 0, value: t?.value ?? die.value ?? 1, resumeMs: null };
}

