import { describe, expect, it } from "vitest";
import {
  CLASSIC_FINISH,
  CLASSIC_HOME_LANES,
  CLASSIC_SAFE_INDICES,
  CLASSIC_START_INDEX,
  CLASSIC_TRACK,
  cellKey,
  classicAbsoluteIndex,
  classicBaseSlots,
  classicSeatPath,
} from "@ludo/board-layouts";
import { BOARD_PX, CELL, PAD, baseSlotPoint, cellCentre, hopSteps, piecePosition, stepCell } from "../geometry";
import { placeTokens, tokenKey } from "../placement";

describe("board geometry from @ludo/board-layouts", () => {
  it("covers the 15 × 15 grid inside the frame", () => {
    expect(BOARD_PX).toBe(15 * CELL + 2 * PAD);
    expect(cellCentre({ row: 0, col: 0 })).toEqual({ x: PAD + CELL / 2, y: PAD + CELL / 2 });
    expect(cellCentre({ row: 14, col: 14 })).toEqual({ x: BOARD_PX - PAD - CELL / 2, y: BOARD_PX - PAD - CELL / 2 });
  });

  it("puts every seat's step 0 on its own start cell", () => {
    for (let seat = 0; seat < 4; seat++) {
      expect(stepCell(seat, 0)).toEqual(CLASSIC_TRACK[CLASSIC_START_INDEX[seat]!]);
    }
    expect(stepCell(0, 0)).toEqual({ row: 6, col: 1 });
    expect(stepCell(2, 0)).toEqual({ row: 8, col: 13 });
  });

  it("follows the layout's clockwise track for every step, with no separate movement map", () => {
    for (let seat = 0; seat < 4; seat++) {
      for (let step = 0; step <= 50; step++) {
        expect(stepCell(seat, step)).toEqual(CLASSIC_TRACK[classicAbsoluteIndex(seat, step)]);
        expect(stepCell(seat, step)).toEqual(classicSeatPath(seat).track[step]);
      }
    }
  });

  it("maps steps 51–55 to the seat's home lane and 56 to its finish", () => {
    for (let seat = 0; seat < 4; seat++) {
      for (let i = 0; i < 5; i++) expect(stepCell(seat, 51 + i)).toEqual(CLASSIC_HOME_LANES[seat]![i]);
      expect(stepCell(seat, 56)).toEqual(CLASSIC_FINISH[seat]);
    }
  });

  it("keeps tokens in base on their own slots", () => {
    expect(stepCell(1, null)).toBeNull();
    for (let slot = 0; slot < 4; slot++) {
      const s = classicBaseSlots(3)[slot]!;
      expect(baseSlotPoint(3, slot)).toEqual({ x: PAD + s.x * CELL, y: PAD + s.y * CELL });
      expect(piecePosition(3, null, slot)).toEqual(baseSlotPoint(3, slot));
    }
  });

  it("has exactly eight safe cells: four starts and four stars", () => {
    expect(CLASSIC_SAFE_INDICES).toHaveLength(8);
    for (const start of CLASSIC_START_INDEX) expect(CLASSIC_SAFE_INDICES).toContain(start);
  });

  it("lists the hops between two committed positions along the seat's own path", () => {
    expect(hopSteps(null, 0)).toEqual([0]);
    expect(hopSteps(10, 14)).toEqual([11, 12, 13, 14]);
    expect(hopSteps(48, 53)).toEqual([49, 50, 51, 52, 53]);
    expect(hopSteps(30, 4)).toEqual([4]); // not a forward move (e.g. a snapshot jump): go straight there
  });
});

describe("token placement", () => {
  const t = (playerId: string, seat: number, tokenId: number, step: number | null) => ({ playerId, seat, tokenId, step });

  it("places a lone token at its cell centre and base tokens on their slots", () => {
    const placed = placeTokens([t("a", 0, 0, 5), t("a", 0, 1, null)]);
    const onTrack = placed.find((p) => p.key === "a:0");
    const inBase = placed.find((p) => p.key === "a:1");
    expect(onTrack).toMatchObject({ key: tokenKey("a", 0), ...cellCentre(classicSeatPath(0).track[5]!), stackSize: 1 });
    expect(inBase).toMatchObject({ key: "a:1", ...baseSlotPoint(0, 1), stackSize: 1 });
  });

  it("offsets two tokens on one cell diagonally and shrinks them", () => {
    const placed = placeTokens([t("a", 0, 0, 8), t("a", 0, 1, 8)]);
    const centre = cellCentre(stepCell(0, 8)!);
    const offsets = placed.map((p) => [p.x - centre.x, p.y - centre.y]);
    expect(offsets[0]![0]).toBeCloseTo(-CELL * 0.18);
    expect(offsets[0]![1]).toBeCloseTo(-CELL * 0.18);
    expect(offsets[1]![0]).toBeCloseTo(CELL * 0.18);
    expect(offsets[1]![1]).toBeCloseTo(CELL * 0.18);
    expect(placed[0]!.size).toBeCloseTo(CELL * 0.72);
    expect(placed.every((p) => p.stackSize === 2)).toBe(true);
  });

  it("clusters mixed colours on a shared safe cell, ordered by seat, without overlapping", () => {
    // Seat 0's step 13 and seat 1's step 0 are the same cell (seat 1's start).
    expect(cellKey(stepCell(0, 13)!)).toBe(cellKey(stepCell(1, 0)!));
    const placed = placeTokens([t("b", 1, 2, 0), t("a", 0, 0, 13), t("b", 1, 0, 0)]);
    expect(placed.map((p) => p.key)).toEqual(["a:0", "b:0", "b:2"]);
    const points = new Set(placed.map((p) => `${p.x},${p.y}`));
    expect(points.size).toBe(3);
    expect(placed[0]!.size).toBeCloseTo(CELL * 0.6);
  });

  it("marks finished tokens and clusters them in the seat's finish wedge", () => {
    const placed = placeTokens([t("a", 0, 0, 56), t("a", 0, 3, 56)]);
    expect(placed.every((p) => p.finished)).toBe(true);
    const centre = cellCentre(CLASSIC_FINISH[0]!);
    expect(placed[0]!.x).toBeLessThan(centre.x);
    expect(placed[1]!.x).toBeGreaterThan(centre.x);
    const [alone] = placeTokens([t("a", 0, 0, 56)]);
    expect(alone!.size).toBeCloseTo(CELL * 0.82 * 0.72);
  });

  it("keeps tokens in the home lane apart from other seats' track tokens", () => {
    const placed = placeTokens([t("a", 0, 0, 52), t("b", 1, 0, 52)]);
    expect(placed[0]!.stackSize).toBe(1);
    expect(placed[1]!.stackSize).toBe(1);
    expect(placed[0]!.x === placed[1]!.x && placed[0]!.y === placed[1]!.y).toBe(false);
  });
});
