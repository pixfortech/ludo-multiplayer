// Classic board — REVIEWED coordinates.
//
// Every literal below was written by hand from the traditional board and then
// checked cell by cell against the rendered journey diagrams
// (docs/design/generated/png/classic-path-seat*.png). These tests do NOT
// derive expectations from the layout code; they pin the layout to the
// reviewed reference. Changing any value here requires a new approval.
//
// Cells are "r<row>c<col>" on the 15×15 grid, row 0 at the top.

import { describe, expect, it } from "vitest";
import { CLASSIC_HOME_LANES, CLASSIC_TOPOLOGY, CLASSIC_TRACK, classicSeatPath } from "../index.js";
import { cellKey, type Cell } from "../layoutTypes.js";

interface ReviewedSeat {
  name: string;
  start: string;
  firstFive: string[]; // steps 1–5
  /** Corner cells where the route changes direction: [step, cell]. */
  turns: [number, string][];
  lastFive: string[]; // steps 46–50
  entry: string; // step 50
  lane: string[]; // steps 51–55
  home: string; // step 56 (centre triangle cell)
  behindStart: string; // never visited by this seat
  /** Safe cells this seat passes: [step, cell]. */
  safe: [number, string][];
}

const REVIEWED: ReviewedSeat[] = [
  {
    name: "Crimson (top-left)",
    start: "r6c1",
    firstFive: ["r6c2", "r6c3", "r6c4", "r6c5", "r5c6"],
    turns: [[4, "r6c5"], [10, "r0c6"], [12, "r0c8"], [17, "r5c8"], [23, "r6c14"], [25, "r8c14"], [30, "r8c9"], [36, "r14c8"], [38, "r14c6"], [43, "r9c6"], [49, "r8c0"], [50, "r7c0"]],
    lastFive: ["r8c3", "r8c2", "r8c1", "r8c0", "r7c0"],
    entry: "r7c0",
    lane: ["r7c1", "r7c2", "r7c3", "r7c4", "r7c5"],
    home: "r7c6",
    behindStart: "r6c0",
    safe: [[0, "r6c1"], [8, "r2c6"], [13, "r1c8"], [21, "r6c12"], [26, "r8c13"], [34, "r12c8"], [39, "r13c6"], [47, "r8c2"]],
  },
  {
    name: "Royal Blue (top-right)",
    start: "r1c8",
    firstFive: ["r2c8", "r3c8", "r4c8", "r5c8", "r6c9"],
    turns: [[4, "r5c8"], [10, "r6c14"], [12, "r8c14"], [17, "r8c9"], [23, "r14c8"], [25, "r14c6"], [30, "r9c6"], [36, "r8c0"], [38, "r6c0"], [43, "r6c5"], [49, "r0c6"], [50, "r0c7"]],
    lastFive: ["r3c6", "r2c6", "r1c6", "r0c6", "r0c7"],
    entry: "r0c7",
    lane: ["r1c7", "r2c7", "r3c7", "r4c7", "r5c7"],
    home: "r6c7",
    behindStart: "r0c8",
    safe: [[0, "r1c8"], [8, "r6c12"], [13, "r8c13"], [21, "r12c8"], [26, "r13c6"], [34, "r8c2"], [39, "r6c1"], [47, "r2c6"]],
  },
  {
    name: "Emerald (bottom-right)",
    start: "r8c13",
    firstFive: ["r8c12", "r8c11", "r8c10", "r8c9", "r9c8"],
    turns: [[4, "r8c9"], [10, "r14c8"], [12, "r14c6"], [17, "r9c6"], [23, "r8c0"], [25, "r6c0"], [30, "r6c5"], [36, "r0c6"], [38, "r0c8"], [43, "r5c8"], [49, "r6c14"], [50, "r7c14"]],
    lastFive: ["r6c11", "r6c12", "r6c13", "r6c14", "r7c14"],
    entry: "r7c14",
    lane: ["r7c13", "r7c12", "r7c11", "r7c10", "r7c9"],
    home: "r7c8",
    behindStart: "r8c14",
    safe: [[0, "r8c13"], [8, "r12c8"], [13, "r13c6"], [21, "r8c2"], [26, "r6c1"], [34, "r2c6"], [39, "r1c8"], [47, "r6c12"]],
  },
  {
    name: "Golden Yellow (bottom-left)",
    start: "r13c6",
    firstFive: ["r12c6", "r11c6", "r10c6", "r9c6", "r8c5"],
    turns: [[4, "r9c6"], [10, "r8c0"], [12, "r6c0"], [17, "r6c5"], [23, "r0c6"], [25, "r0c8"], [30, "r5c8"], [36, "r6c14"], [38, "r8c14"], [43, "r8c9"], [49, "r14c8"], [50, "r14c7"]],
    lastFive: ["r11c8", "r12c8", "r13c8", "r14c8", "r14c7"],
    entry: "r14c7",
    lane: ["r13c7", "r12c7", "r11c7", "r10c7", "r9c7"],
    home: "r8c7",
    behindStart: "r14c6",
    safe: [[0, "r13c6"], [8, "r8c2"], [13, "r6c1"], [21, "r2c6"], [26, "r1c8"], [34, "r6c12"], [39, "r8c13"], [47, "r12c8"]],
  },
];

/** Steps where the direction of travel changes (corners count at both ends of a diagonal). Same for every seat. */
const REVIEWED_DIRECTION_CHANGES = [4, 5, 10, 12, 17, 18, 23, 25, 30, 31, 36, 38, 43, 44, 49, 50];
/** The four diagonal corner crossings (step → step + 1). */
const REVIEWED_DIAGONALS = [4, 17, 30, 43];

const journey = (seat: number): Cell[] => {
  const { track, lane, finish } = classicSeatPath(seat);
  return [...track, ...lane, finish];
};
const keys = (cells: readonly Cell[]) => cells.map(cellKey);
const delta = (a: Cell, b: Cell) => [Math.sign(b.row - a.row), Math.sign(b.col - a.col)].join(",");

describe.each(REVIEWED.map((r, seat) => [r.name, seat, r] as const))("reviewed journey: %s", (_name, seat, r) => {
  const path = classicSeatPath(seat);
  const all = journey(seat);

  it("starts on the reviewed cell and makes the reviewed first five moves", () => {
    expect(cellKey(path.track[0]!)).toBe(r.start);
    expect(keys(path.track.slice(1, 6))).toEqual(r.firstFive);
  });

  it("turns at exactly the reviewed corner cells", () => {
    for (const [step, cell] of r.turns) expect(cellKey(path.track[step]!), `step ${step}`).toBe(cell);
    const changes: number[] = [];
    for (let i = 1; i + 1 < all.length - 1; i++) {
      if (delta(all[i - 1]!, all[i]!) !== delta(all[i]!, all[i + 1]!)) changes.push(i);
    }
    expect(changes).toEqual(REVIEWED_DIRECTION_CHANGES);
  });

  it("ends the shared track on the reviewed last five cells and enters at the reviewed home entry", () => {
    expect(keys(path.track.slice(46, 51))).toEqual(r.lastFive);
    expect(cellKey(path.track[50]!)).toBe(r.entry);
  });

  it("walks the reviewed five-cell home lane into the reviewed home cell", () => {
    expect(keys(path.lane)).toEqual(r.lane);
    expect(cellKey(path.finish)).toBe(r.home);
  });

  it("passes the reviewed safe cells at the reviewed steps", () => {
    for (const [step, cell] of r.safe) {
      expect(cellKey(path.track[step]!), `step ${step}`).toBe(cell);
      const abs = CLASSIC_TRACK.findIndex((c) => cellKey(c) === cell);
      expect(CLASSIC_TOPOLOGY.safeIndices, cell).toContain(abs);
    }
  });

  it("covers exactly 56 dice steps from start to home: 50 track + 5 lane + 1 into home", () => {
    expect(all).toHaveLength(57); // positions 0..56
    expect(CLASSIC_TOPOLOGY.finishStep).toBe(56);
  });

  it("takes no shortcuts: every step is to an adjacent cell, diagonal only at the four corners", () => {
    const diagonals: number[] = [];
    for (let i = 0; i + 1 < all.length; i++) {
      const dr = Math.abs(all[i + 1]!.row - all[i]!.row);
      const dc = Math.abs(all[i + 1]!.col - all[i]!.col);
      expect(Math.max(dr, dc), `step ${i}→${i + 1}`).toBe(1);
      if (dr + dc === 2) diagonals.push(i);
    }
    expect(diagonals).toEqual(REVIEWED_DIAGONALS);
  });

  it("makes no extra loop: 51 distinct track cells, never the cell behind its own start", () => {
    expect(new Set(keys(path.track)).size).toBe(51);
    expect(keys(path.track)).not.toContain(r.behindStart);
  });

  it("never enters an opponent's home lane, and only enters its own after the entry cell", () => {
    const opponentLanes = CLASSIC_HOME_LANES.filter((_, s) => s !== seat).flat().map(cellKey);
    for (const cell of keys(all)) expect(opponentLanes).not.toContain(cell);
    const ownLane = new Set(r.lane);
    expect(keys(path.track).some((c) => ownLane.has(c))).toBe(false);
  });
});

describe("all four seats", () => {
  it("have equal total movement distance", () => {
    expect(new Set([0, 1, 2, 3].map((s) => journey(s).length))).toEqual(new Set([57]));
  });

  it("place starts in clockwise seat order: top-left, top-right, bottom-right, bottom-left", () => {
    expect(REVIEWED.map((r) => r.start)).toEqual(["r6c1", "r1c8", "r8c13", "r13c6"]);
    expect([0, 13, 26, 39].map((i) => cellKey(CLASSIC_TRACK[i]!))).toEqual(["r6c1", "r1c8", "r8c13", "r13c6"]);
  });

  it("share one set of 8 safe cells", () => {
    expect(CLASSIC_TOPOLOGY.safeIndices.map((i) => cellKey(CLASSIC_TRACK[i]!)).sort()).toEqual(
      ["r6c1", "r2c6", "r1c8", "r6c12", "r8c13", "r12c8", "r13c6", "r8c2"].sort(),
    );
  });
});
