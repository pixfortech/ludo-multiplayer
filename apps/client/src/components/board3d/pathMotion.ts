// A move followed on the 3D board: the whole authorised path (every cell, in order) and where the token is on it
// at any moment, from the time elapsed since the move started. Pure, so the timing is tested directly.
//
// Every frame asks "where is it now?", never "what is the next cell?": a frame that comes late (a busy or slow
// device) lands the token where the elapsed time says, part-way along a later segment if need be. It never stands
// still waiting to catch up, never jumps past a cell's corner (each segment runs between two cell centres, so
// any point it is drawn at lies on the path), and it arrives exactly when the move's time is up.

import type { WorldPoint } from "@ludo/board-layouts";
import type { MotionKind, MovePath } from "../game/playbackPlan";

export interface PathPoint {
  at: WorldPoint;
  floor: number;
}

export interface FollowedSegment {
  kind: MotionKind;
  ms: number;
  step: number;
  to: WorldPoint;
  floor: number;
}

export interface FollowedPath {
  id: number;
  origin: PathPoint;
  segments: FollowedSegment[];
  /** The whole move (ms). */
  total: number;
  startedAt: number;
}

export interface PathSample {
  /** The segment it is on (0-based), its kind and ends. */
  index: number;
  kind: MotionKind;
  from: WorldPoint;
  to: WorldPoint;
  fromFloor: number;
  toFloor: number;
  ms: number;
  /** Progress along this segment, 0–1. */
  progress: number;
  /** The whole move is over: it stands on the last cell. */
  done: boolean;
}

/** The path to follow, from where the token stands now. `cell` gives the world point and floor of a step. */
export function followPath(path: MovePath, origin: PathPoint, cell: (seat: number, step: number) => PathPoint): FollowedPath {
  const segments = path.segments.map((s) => {
    const c = cell(path.seat, s.step);
    return { kind: s.kind, ms: Math.max(1, s.ms), step: s.step, to: c.at, floor: c.floor };
  });
  return { id: path.id, origin, segments, total: segments.reduce((sum, s) => sum + s.ms, 0), startedAt: path.startedAt };
}

/** Where on the path the token is `now` (performance.now()). */
export function samplePath(p: FollowedPath, now: number): PathSample {
  const elapsed = Math.max(0, now - p.startedAt);
  let start = 0;
  for (let i = 0; i < p.segments.length; i++) {
    const seg = p.segments[i]!;
    const from = i === 0 ? p.origin : { at: p.segments[i - 1]!.to, floor: p.segments[i - 1]!.floor };
    if (elapsed < start + seg.ms) {
      return { index: i, kind: seg.kind, from: from.at, to: seg.to, fromFloor: from.floor, toFloor: seg.floor, ms: seg.ms, progress: (elapsed - start) / seg.ms, done: false };
    }
    start += seg.ms;
  }
  const last = p.segments[p.segments.length - 1]!;
  const before = p.segments.length > 1 ? p.segments[p.segments.length - 2]! : null;
  return {
    index: p.segments.length - 1,
    kind: last.kind,
    from: before ? before.to : p.origin.at,
    to: last.to,
    fromFloor: before ? before.floor : p.origin.floor,
    toFloor: last.floor,
    ms: last.ms,
    progress: 1,
    done: true,
  };
}
