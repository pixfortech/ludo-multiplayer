// Keyframes for a token's travel between two drawn positions (presentation
// only; docs/design/motion.md). Pure, so the shapes can be tested. Only
// transform and opacity are animated: the board never re-lays out.
//
//   hop / land: a straight glide to the next cell of the path, the body lifting
//               in a low arc (≈ 0.25 cell) while its shadow stays on the board;
//               "land" ends with a short settle.
//   open:       rises from the base slot and arcs onto the start cell.
//   home:       glides into the finish wedge and settles.
//   capture:    a short impact where it stood (a jolt and settle), then it
//               shrinks, fades and arcs back to its base slot over the board.
//   slide:      reduced motion: straight to the destination, no lift.

import { MOTION } from "@ludo/design-tokens";
import type { MotionKind } from "../game/useBoardPlayback";
import type { Point } from "./geometry";

/** A captured token's impact before it leaves; its capture motion lasts CAPTURE_IMPACT_MS + MOTION.duration.capture. */
export const CAPTURE_IMPACT_MS = 140;
const IMPACT = CAPTURE_IMPACT_MS / (CAPTURE_IMPACT_MS + MOTION.duration.capture);

export type Keyframes = Keyframe[];

export interface TokenKeyframes {
  /** Position of the whole token (outer group). */
  travel: Keyframes;
  /** The token body (lift, settle, shrink). */
  body: Keyframes;
  /** The contact shadow (stays on the board, shrinks while the body is up). */
  shadow: Keyframes;
  easing: string;
}

export const EASE_STANDARD = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_TRAVEL = "cubic-bezier(0.45, 0, 0.25, 1)";

const at = (p: Point) => `translate(${round(p.x)}px, ${round(p.y)}px)`;
const round = (n: number) => Math.round(n * 100) / 100;

/** A point on the quadratic curve from `a` to `b`, bowed `bow` units to the left of travel. */
function arcPoint(a: Point, b: Point, t: number, bow: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const control = { x: (a.x + b.x) / 2 - (dy / length) * bow, y: (a.y + b.y) / 2 + (dx / length) * bow };
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
}

export function tokenKeyframes(kind: MotionKind, from: Point, to: Point, cell: number): TokenKeyframes {
  const lift = cell * 0.25;
  const still: Keyframes = [{ transform: "none" }, { transform: "none" }];
  switch (kind) {
    case "slide":
      return { travel: [{ transform: at(from) }, { transform: at(to) }], body: still, shadow: still, easing: EASE_STANDARD };
    case "hop":
      return {
        travel: [{ transform: at(from) }, { transform: at(to) }],
        body: [
          { transform: "translateY(0px) scale(1)" },
          { transform: `translateY(${-lift}px) scale(1.06)`, offset: 0.5 },
          { transform: "translateY(0px) scale(1)" },
        ],
        shadow: [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.78)", opacity: 0.55, offset: 0.5 }, { transform: "scale(1)", opacity: 1 }],
        easing: EASE_TRAVEL,
      };
    case "land":
    case "home":
      return {
        travel: [{ transform: at(from) }, { transform: at(to), offset: 0.72 }, { transform: at(to) }],
        body: [
          { transform: "translateY(0px) scale(1)" },
          { transform: `translateY(${-lift}px) scale(1.06)`, offset: 0.36 },
          { transform: "translateY(0px) scale(1.04, 0.95)", offset: 0.72 },
          { transform: "translateY(0px) scale(0.99, 1.01)", offset: 0.86 },
          { transform: "translateY(0px) scale(1)" },
        ],
        shadow: [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.78)", opacity: 0.55, offset: 0.36 }, { transform: "scale(1.05)", opacity: 1, offset: 0.72 }, { transform: "scale(1)", opacity: 1 }],
        easing: "linear",
      };
    case "open": {
      const mid = arcPoint(from, to, 0.5, cell * 0.6);
      return {
        travel: [{ transform: at(from) }, { transform: at(mid), offset: 0.5 }, { transform: at(to) }],
        body: [
          { transform: "translateY(0px) scale(1)" },
          { transform: `translateY(${-lift * 1.4}px) scale(1.1)`, offset: 0.45 },
          { transform: "translateY(0px) scale(1.04, 0.95)", offset: 0.85 },
          { transform: "translateY(0px) scale(1)" },
        ],
        shadow: [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.7)", opacity: 0.45, offset: 0.45 }, { transform: "scale(1)", opacity: 1 }],
        easing: EASE_TRAVEL,
      };
    }
    case "capture": {
      const bow = Math.min(cell * 3, Math.hypot(to.x - from.x, to.y - from.y) * 0.25);
      const travel = (t: number) => IMPACT + t * (1 - IMPACT);
      const points = [0.25, 0.5, 0.75].map((t) => arcPoint(from, to, t, bow));
      return {
        travel: [{ transform: at(from) }, { transform: at(from), offset: IMPACT }, ...points.map((p, i) => ({ transform: at(p), offset: travel((i + 1) / 4) })), { transform: at(to) }],
        body: [
          { transform: "scale(1) rotate(0deg)", opacity: 1 },
          { transform: "scale(1.12) rotate(-7deg)", opacity: 1, offset: IMPACT * 0.35 },
          { transform: "scale(0.95) rotate(5deg)", opacity: 1, offset: IMPACT * 0.7 },
          { transform: "scale(1) rotate(0deg)", opacity: 1, offset: IMPACT },
          { transform: "scale(0.8) rotate(0deg)", opacity: 0.35, offset: travel(0.25) },
          { transform: "scale(0.8) rotate(0deg)", opacity: 0.35, offset: travel(0.8) },
          { transform: "scale(1) rotate(0deg)", opacity: 1 },
        ],
        shadow: [{ opacity: 1 }, { opacity: 1, offset: IMPACT }, { opacity: 0, offset: travel(0.2) }, { opacity: 0, offset: travel(0.85) }, { opacity: 1 }],
        easing: EASE_STANDARD,
      };
    }
  }
}
