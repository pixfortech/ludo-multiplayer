import { describe, expect, it } from "vitest";
import {
  CLASSIC_BASE_ORIGIN,
  CLASSIC_GRID,
  CLASSIC_HOME_LANES,
  CLASSIC_SAFE_INDICES,
  CLASSIC_START_INDEX,
  CLASSIC_TRACK,
  CLASSIC_TRACK_LENGTH,
  classicHomeEntryIndex,
  classicSeatPath,
} from "../classicSquareLayout.js";
import { cellKey, type Cell } from "../layoutTypes.js";

const chebyshev = (a: Cell, b: Cell) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
const manhattan = (a: Cell, b: Cell) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
/** Rotate a cell 90° clockwise about the board centre. */
const rotateCw = (cell: Cell): Cell => ({ row: cell.col, col: CLASSIC_GRID - 1 - cell.row });
const inBase = (cell: Cell) =>
  CLASSIC_BASE_ORIGIN.some((o) => cell.row >= o.row && cell.row < o.row + 6 && cell.col >= o.col && cell.col < o.col + 6);
const inCentre = (cell: Cell) => cell.row >= 6 && cell.row <= 8 && cell.col >= 6 && cell.col <= 8;

describe("classic shared track", () => {
  it("has 52 unique cells on the grid, outside bases and centre", () => {
    expect(CLASSIC_TRACK).toHaveLength(CLASSIC_TRACK_LENGTH);
    expect(new Set(CLASSIC_TRACK.map(cellKey)).size).toBe(52);
    for (const cell of CLASSIC_TRACK) {
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(CLASSIC_GRID);
      expect(inBase(cell) || inCentre(cell), cellKey(cell)).toBe(false);
    }
  });

  it("is a closed loop of single steps with exactly 4 diagonal corner crossings", () => {
    let diagonals = 0;
    for (let i = 0; i < 52; i++) {
      const a = CLASSIC_TRACK[i]!;
      const b = CLASSIC_TRACK[(i + 1) % 52]!;
      expect(chebyshev(a, b), `${i}→${i + 1}`).toBe(1);
      if (manhattan(a, b) === 2) diagonals++;
    }
    expect(diagonals).toBe(4);
  });

  it("runs CLOCKWISE on screen (positive shoelace area with y pointing down)", () => {
    let twiceArea = 0;
    for (let i = 0; i < 52; i++) {
      const a = CLASSIC_TRACK[i]!;
      const b = CLASSIC_TRACK[(i + 1) % 52]!;
      twiceArea += a.col * b.row - b.col * a.row;
    }
    expect(twiceArea).toBeGreaterThan(0);
    // And concretely: seat 1 leaves its start heading right, then up the top arm.
    expect(CLASSIC_TRACK.slice(0, 2)).toEqual([{ row: 6, col: 1 }, { row: 6, col: 2 }]);
    expect(CLASSIC_TRACK[5]).toEqual({ row: 5, col: 6 });
  });

  it("places starts, stars and safe cells where the traditional board has them", () => {
    expect(CLASSIC_START_INDEX.map((i) => cellKey(CLASSIC_TRACK[i]!))).toEqual(["r6c1", "r1c8", "r8c13", "r13c6"]);
    expect(CLASSIC_SAFE_INDICES).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
    const stars = [8, 21, 34, 47].map((i) => cellKey(CLASSIC_TRACK[i]!));
    expect(stars).toEqual(["r2c6", "r6c12", "r12c8", "r8c2"]);
  });
});

describe("seat paths", () => {
  it("is 4-fold rotationally symmetric: rotating seat k's path 90° clockwise gives seat k+1's", () => {
    for (let seat = 0; seat < 3; seat++) {
      const a = classicSeatPath(seat);
      const b = classicSeatPath(seat + 1);
      expect(a.track.map(rotateCw)).toEqual(b.track);
      expect(a.lane.map(rotateCw)).toEqual(b.lane);
      expect(rotateCw(a.finish)).toEqual(b.finish);
    }
  });

  it("gives every seat 51 track steps, 5 lane steps and a finish, all adjacent in order", () => {
    for (let seat = 0; seat < 4; seat++) {
      const { track, lane, finish } = classicSeatPath(seat);
      expect(track).toHaveLength(51);
      expect(lane).toHaveLength(5);
      const full = [...track, ...lane, finish];
      for (let i = 0; i + 1 < full.length; i++) {
        expect(chebyshev(full[i]!, full[i + 1]!), `seat ${seat} step ${i}`).toBe(1);
      }
      // Turning into the lane is a straight orthogonal step from the arm tip.
      expect(manhattan(track[50]!, lane[0]!)).toBe(1);
    }
  });

  it("turns into the lane at the arm tip, never passing the cell just behind its own start", () => {
    expect([0, 1, 2, 3].map((s) => cellKey(CLASSIC_TRACK[classicHomeEntryIndex(s)]!))).toEqual(["r7c0", "r0c7", "r7c14", "r14c7"]);
    for (let seat = 0; seat < 4; seat++) {
      const behindStart = CLASSIC_TRACK[(CLASSIC_START_INDEX[seat]! + 51) % 52]!;
      expect(classicSeatPath(seat).track.map(cellKey)).not.toContain(cellKey(behindStart));
    }
  });

  it("keeps home lanes private: no lane cell is on the track or in another lane", () => {
    const trackKeys = new Set(CLASSIC_TRACK.map(cellKey));
    const laneKeys = CLASSIC_HOME_LANES.flat().map(cellKey);
    expect(new Set(laneKeys).size).toBe(20);
    for (const key of laneKeys) expect(trackKeys.has(key)).toBe(false);
  });

  it("rejects invalid seats", () => {
    expect(() => classicSeatPath(4)).toThrow(RangeError);
    expect(() => classicSeatPath(-1)).toThrow(RangeError);
  });
});
