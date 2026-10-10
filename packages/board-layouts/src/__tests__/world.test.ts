import { describe, expect, it } from "vitest";
import {
  CLASSIC_FINISH,
  CLASSIC_FINISH_STEP,
  CLASSIC_HOME_LANES,
  CLASSIC_START_INDEX,
  CLASSIC_TRACK,
  WORLD_BOARD_SIZE,
  baseSlotToWorld,
  cellToWorld,
  classicSeatPath,
  classicStepCell,
  gridToWorld,
  tokenPositionToWorld,
} from "../index.js";

/** A quarter turn clockwise about the board centre, seen from above (+Y up, rows along +Z). */
const quarterTurn = (p: { x: number; z: number }) => ({ x: -p.z, z: p.x });
const close = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

describe("world coordinates", () => {
  it("centres the 15 × 15 board on the origin, one unit per cell", () => {
    expect(WORLD_BOARD_SIZE).toBe(15);
    expect(cellToWorld(7, 7)).toEqual({ x: 0, z: 0 });
    expect(cellToWorld(0, 0)).toEqual({ x: -7, z: -7 });
    expect(cellToWorld(14, 14)).toEqual({ x: 7, z: 7 });
    expect(gridToWorld(0, 0)).toEqual({ x: -7.5, z: -7.5 });
  });

  it("places columns along +X and rows along +Z (the 2D board seen from above)", () => {
    expect(cellToWorld(6, 1).x).toBeLessThan(cellToWorld(6, 2).x);
    expect(cellToWorld(1, 6).z).toBeLessThan(cellToWorld(2, 6).z);
  });

  it("puts every step of every seat on its layout cell, and nowhere else", () => {
    for (let seat = 0; seat < 4; seat++) {
      const path = classicSeatPath(seat);
      for (let step = 0; step <= CLASSIC_FINISH_STEP; step++) {
        const cell = classicStepCell(seat, step)!;
        const expected = step <= 50 ? path.track[step]! : step < CLASSIC_FINISH_STEP ? path.lane[step - 51]! : path.finish;
        expect(cell).toEqual(expected);
        expect(tokenPositionToWorld(seat, step)).toEqual(cellToWorld(expected.row, expected.col));
      }
      expect(classicStepCell(seat, null)).toBeNull();
      expect(() => classicStepCell(seat, 57)).toThrow(RangeError);
    }
  });

  it("starts each seat on its start cell, lanes on the lane cells, finishes on its centre triangle", () => {
    for (let seat = 0; seat < 4; seat++) {
      const start = CLASSIC_TRACK[CLASSIC_START_INDEX[seat]!]!;
      expect(tokenPositionToWorld(seat, 0)).toEqual(cellToWorld(start.row, start.col));
      CLASSIC_HOME_LANES[seat]!.forEach((c, i) => expect(tokenPositionToWorld(seat, 51 + i)).toEqual(cellToWorld(c.row, c.col)));
      expect(tokenPositionToWorld(seat, 56)).toEqual(cellToWorld(CLASSIC_FINISH[seat]!.row, CLASSIC_FINISH[seat]!.col));
    }
  });

  it("puts base slots in each seat's corner, 2 × 2 cells apart", () => {
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let seat = 0; seat < 4; seat++) {
      const slots = [0, 1, 2, 3].map((s) => baseSlotToWorld(seat, s));
      for (const p of slots) {
        expect(Math.sign(p.x)).toBe(corners[seat]![0]);
        expect(Math.sign(p.z)).toBe(corners[seat]![1]);
        expect(Math.abs(p.x)).toBeGreaterThanOrEqual(2.5);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(5.5);
      }
      expect(slots[1]!.x - slots[0]!.x).toBe(2);
      expect(slots[2]!.z - slots[0]!.z).toBe(2);
      expect(tokenPositionToWorld(seat, null, 3)).toEqual(slots[3]);
    }
  });

  it("is four-fold symmetric: each seat's whole route is the previous seat's turned a quarter clockwise", () => {
    for (let seat = 1; seat < 4; seat++)
      for (let step = 0; step <= CLASSIC_FINISH_STEP; step++) close(tokenPositionToWorld(seat, step), quarterTurn(tokenPositionToWorld(seat - 1, step)));
    for (let seat = 1; seat < 4; seat++) for (let slot = 0; slot < 4; slot++) expect([0, 1, 2, 3].some((s) => {
      const a = baseSlotToWorld(seat, s);
      const b = quarterTurn(baseSlotToWorld(seat - 1, slot));
      return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
    })).toBe(true);
  });

  it("moves exactly one cell per track step (clockwise, with the diagonal corner crossings)", () => {
    for (let step = 0; step < 50; step++) {
      const a = tokenPositionToWorld(0, step);
      const b = tokenPositionToWorld(0, step + 1);
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      expect(d === 1 || Math.abs(d - Math.SQRT2) < 1e-9, `step ${step} → ${step + 1}`).toBe(true);
    }
  });
});
