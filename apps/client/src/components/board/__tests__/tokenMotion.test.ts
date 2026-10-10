import { describe, expect, it } from "vitest";
import { tokenKeyframes } from "../tokenMotion";
import { CELL } from "../geometry";

const from = { x: 100, y: 200 };
const to = { x: 140, y: 200 };
const xy = (frame: Keyframe) => (String(frame.transform).match(/-?[\d.]+/g) ?? []).map(Number);

describe("token travel keyframes", () => {
  for (const kind of ["hop", "land", "open", "home", "capture", "slide"] as const) {
    it(`${kind}: starts where the token was and ends exactly on its new cell`, () => {
      const frames = tokenKeyframes(kind, from, to, CELL);
      expect(xy(frames.travel[0]!)).toEqual([100, 200]);
      expect(xy(frames.travel.at(-1)!)).toEqual([140, 200]);
      expect(String(frames.body.at(-1)!.transform ?? "none")).toMatch(/none|translateY\(0px\) scale\(1\)|scale\(1\)/);
    });
  }

  it("lifts the body about a quarter cell on a hop while the shadow shrinks", () => {
    const frames = tokenKeyframes("hop", from, to, CELL);
    expect(frames.body[1]!.transform).toBe(`translateY(${-CELL * 0.25}px) scale(1.06)`);
    expect(frames.shadow[1]).toMatchObject({ opacity: 0.55 });
  });

  it("lands with a short settle", () => {
    const frames = tokenKeyframes("land", from, to, CELL);
    expect(frames.body.some((f) => String(f.transform).includes("scale(1.04, 0.95)"))).toBe(true);
  });

  it("a captured token reacts in place first, then returns along a curve, shrunk and faded", () => {
    const base = { x: 100, y: 600 };
    const frames = tokenKeyframes("capture", from, base, CELL);
    // The impact: still on its cell, with a jolt, before it leaves.
    expect(xy(frames.travel[1]!)).toEqual([100, 200]);
    expect(frames.travel[1]!.offset).toBeGreaterThan(0.15);
    expect(frames.body[1]!.transform).toContain("scale(1.12)");
    // Then home along a bowed path, small and faded.
    const mid = xy(frames.travel[3]!);
    expect(mid[0]).not.toBeCloseTo(100);
    expect(frames.body.find((f) => f.opacity === 0.35)).toMatchObject({ transform: "scale(0.8) rotate(0deg)" });
  });

  it("does not lift or bounce under reduced motion", () => {
    const frames = tokenKeyframes("slide", from, to, CELL);
    expect(frames.travel).toHaveLength(2);
    expect(frames.body.every((f) => f.transform === "none")).toBe(true);
  });
});
