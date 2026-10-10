// How a 3D token travels between two placements: the same motion kinds and
// durations as the 2D board (board/tokenMotion.ts, chosen by useBoardPlayback),
// sampled per frame. Pure, so the shapes are tested: every motion starts
// exactly where the token was and ends exactly on its new placement.

import type { WorldPoint } from "@ludo/board-layouts";
import { MOTION } from "@ludo/design-tokens";
import type { MotionKind } from "../game/useBoardPlayback";
import { CAPTURE_IMPACT_MS } from "../board/tokenMotion";

export interface MotionSample extends WorldPoint {
  /** Height above the board, world units. */
  lift: number;
  /** Uniform scale of the body. */
  scale: number;
  /** Vertical squash (1 = none). */
  squash: number;
  /** Tilt about the travel axis, radians (the capture jolt). */
  tilt: number;
  opacity: number;
}

/** CSS cubic-bezier easing, solved numerically. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < x) lo = mid;
      else hi = mid;
    }
    return by((lo + hi) / 2);
  };
}

const EASE_STANDARD = cubicBezier(0.2, 0, 0, 1);
const EASE_TRAVEL = cubicBezier(0.45, 0, 0.25, 1);
const IMPACT = CAPTURE_IMPACT_MS / (CAPTURE_IMPACT_MS + MOTION.duration.capture);
const HOP_LIFT = 0.25;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const still = (p: WorldPoint): MotionSample => ({ ...p, lift: 0, scale: 1, squash: 1, tilt: 0, opacity: 1 });

/** A point on the quadratic arc from a to b, bowed `bow` units to the left of travel. */
function arc(a: WorldPoint, b: WorldPoint, t: number, bow: number): WorldPoint {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const cx = (a.x + b.x) / 2 - (dz / length) * bow;
  const cz = (a.z + b.z) / 2 + (dx / length) * bow;
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, z: u * u * a.z + 2 * u * t * cz + t * t * b.z };
}

const straight = (a: WorldPoint, b: WorldPoint, t: number): WorldPoint => ({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });

/** The token at progress `t` (0..1) of a motion from `from` to `to`. */
export function sampleMotion(kind: MotionKind, from: WorldPoint, to: WorldPoint, t: number): MotionSample {
  const p = Math.max(0, Math.min(1, t));
  if (p >= 1) return still(to);
  switch (kind) {
    case "slide":
      return still(straight(from, to, EASE_STANDARD(p)));
    case "hop": {
      const k = EASE_TRAVEL(p);
      const up = Math.sin(Math.PI * p);
      return { ...straight(from, to, k), lift: HOP_LIFT * up, scale: 1 + 0.06 * up, squash: 1, tilt: 0, opacity: 1 };
    }
    case "land":
    case "home": {
      // Arrives at 72%, then a short squash-and-settle.
      if (p < 0.72) {
        const q = p / 0.72;
        const up = Math.sin(Math.PI * q);
        return { ...straight(from, to, EASE_TRAVEL(q)), lift: HOP_LIFT * up, scale: 1 + 0.06 * up, squash: 1, tilt: 0, opacity: 1 };
      }
      const s = (p - 0.72) / 0.28;
      return { ...to, lift: 0, scale: 1, squash: 1 - 0.07 * Math.sin(Math.PI * s) * (1 - s), tilt: 0, opacity: 1 };
    }
    case "open": {
      const k = EASE_TRAVEL(p);
      const up = Math.sin(Math.PI * Math.min(1, p / 0.9));
      return { ...arc(from, to, k, 0.6), lift: HOP_LIFT * 1.4 * up, scale: 1 + 0.1 * up, squash: 1, tilt: 0, opacity: 1 };
    }
    case "capture": {
      if (p < IMPACT) {
        // The jolt where it stood.
        const j = p / IMPACT;
        return { ...from, lift: 0, scale: 1 + 0.12 * Math.sin(Math.PI * j), squash: 1, tilt: 0.14 * Math.sin(2 * Math.PI * j), opacity: 1 };
      }
      const q = EASE_STANDARD((p - IMPACT) / (1 - IMPACT));
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      const up = Math.sin(Math.PI * q);
      return { ...arc(from, to, q, Math.min(3, distance * 0.25)), lift: Math.min(2.2, 0.6 + distance * 0.12) * up, scale: 1 - 0.2 * up, squash: 1, tilt: 0, opacity: 1 - 0.55 * up };
    }
  }
}
