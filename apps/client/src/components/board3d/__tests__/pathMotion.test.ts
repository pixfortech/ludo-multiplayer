// Following a move's path by elapsed time: every cell in order, the right place at any moment however late the
// frame, never off the path, and exactly on the last cell when the move's time is up.
import { describe, expect, it } from "vitest";
import { hopSteps, piecePosition, svgToWorld } from "../../board/geometry";
import type { MovePath } from "../../game/playbackPlan";
import { followPath, samplePath, type PathPoint } from "../pathMotion";
import { floorFor } from "../Tokens3D";

const cell = (seat: number, step: number): PathPoint => ({ at: svgToWorld(piecePosition(seat, step)), floor: floorFor(step) });

function move(seat: number, from: number, to: number, ms = 340, startedAt = 1000): MovePath {
  const segments = hopSteps(from, to).map((step, i, all) => ({ step, kind: (i === all.length - 1 ? "land" : "hop") as "land" | "hop", ms }));
  return { id: 1, seat, from, segments, ms: segments.length * ms, startedAt };
}

/** Distance from p to the segment a–b. */
function offSegment(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
}

describe("following a move's path", () => {
  it("visits every cell in order, each at its time, and stands on the last when the time is up", () => {
    // Seat 0 from step 3 to 9: six cells, round the corner of its arm.
    const path = followPath(move(0, 3, 9), cell(0, 3), cell);
    expect(path.segments.map((s) => s.step)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(path.total).toBe(6 * 340);
    for (let i = 0; i < 6; i++) {
      const at = samplePath(path, 1000 + i * 340 + 1);
      expect(at.index).toBe(i);
      expect(at.to).toEqual(cell(0, 4 + i).at);
    }
    const end = samplePath(path, 1000 + 6 * 340);
    expect(end).toMatchObject({ done: true, progress: 1, index: 5 });
    expect(end.to).toEqual(cell(0, 9).at);
  });

  it("a late frame lands where the elapsed time says (part-way along a later cell), always on the path", () => {
    const path = followPath(move(1, 10, 16), cell(1, 10), cell);
    // A frame 1.1 s late: three and a bit cells in, on the fourth.
    const at = samplePath(path, 1000 + 1100);
    expect(at.index).toBe(3);
    expect(at.progress).toBeCloseTo((1100 - 3 * 340) / 340, 9);
    // Every sampled point (any frame timing) lies on the segment between two consecutive cells.
    for (let t = 0; t <= path.total; t += 37) {
      const s = samplePath(path, 1000 + t);
      const p = { x: s.from.x + (s.to.x - s.from.x) * s.progress, z: s.from.z + (s.to.z - s.from.z) * s.progress };
      expect(offSegment(p, s.from, s.to)).toBeLessThan(1e-9);
    }
  });

  it("never runs backwards, and a frame long after the end (a hidden tab) is simply the end", () => {
    const path = followPath(move(2, 20, 26), cell(2, 20), cell);
    let last = -1;
    for (let t = 0; t < path.total; t += 5) {
      const s = samplePath(path, 1000 + t);
      const along = s.index + s.progress;
      expect(along).toBeGreaterThanOrEqual(last);
      last = along;
    }
    expect(samplePath(path, 1000 + 60_000)).toMatchObject({ done: true, to: cell(2, 26).at });
    // Before it started (a clock read just before the start): the first cell, at its beginning.
    expect(samplePath(path, 900)).toMatchObject({ index: 0, progress: 0, from: cell(2, 20).at });
  });

  it("starts from where the token stands (its base slot for a six's departure)", () => {
    const base: PathPoint = { at: { x: -5.2, z: -5.2 }, floor: floorFor(null) };
    const open: MovePath = { id: 2, seat: 0, from: null, segments: [{ step: 0, kind: "open", ms: 800 }], ms: 800, startedAt: 0 };
    const path = followPath(open, base, cell);
    expect(samplePath(path, 10)).toMatchObject({ kind: "open", from: base.at, fromFloor: floorFor(null), to: cell(0, 0).at, toFloor: floorFor(0) });
  });
});
