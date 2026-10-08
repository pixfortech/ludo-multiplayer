import { describe, expect, it } from "vitest";
import { PLAYER_COUNTS } from "@ludo/shared-types";
import {
  CLASSIC_TOPOLOGY,
  LANE_LENGTH,
  absoluteTrackIndex,
  isSafeIndex,
  stepZone,
  topologyFor,
  type BoardTopology,
} from "../topology.js";
import { CLASSIC_SAFE_INDICES, CLASSIC_START_INDEX, CLASSIC_TRACK } from "../classicSquareLayout.js";

const ALL: [string, BoardTopology][] = [
  ...PLAYER_COUNTS.map((n) => [`${n} players`, topologyFor(n)] as [string, BoardTopology]),
  ["2 players on the square", topologyFor(2, { twoPlayerBoard: "square" })],
];

describe.each(ALL)("topology: %s", (_label, t) => {
  it("is internally consistent", () => {
    expect(t.trackLength).toBe(t.boardSeats * t.segmentLength);
    expect(t.lastTrackStep).toBe(t.trackLength - 2);
    expect(t.laneLength).toBe(LANE_LENGTH);
    expect(t.finishStep).toBe(t.lastTrackStep + t.laneLength + 1);
  });

  it("spaces starts evenly, so every seat's journey is identical in length and shape", () => {
    t.startIndex.forEach((start, seat) => expect(start).toBe(seat * t.segmentLength));
  });

  it("makes every start safe and keeps the safe pattern identical for every seat", () => {
    for (const start of t.startIndex) expect(t.safeIndices).toContain(start);
    const rotated = t.safeIndices.map((i) => (i + t.segmentLength) % t.trackLength).sort((a, b) => a - b);
    expect(rotated).toEqual(t.safeIndices);
  });

  it("keeps safe-cell density between 10% and 20%", () => {
    const density = t.safeIndices.length / t.trackLength;
    expect(density).toBeGreaterThanOrEqual(0.1);
    expect(density).toBeLessThanOrEqual(0.2);
  });

  it("maps track steps to the ring and leaves it after the turn-in cell", () => {
    for (const seat of t.activeSeats) {
      expect(absoluteTrackIndex(t, seat, 0)).toBe(t.startIndex[seat]);
      const turnIn = absoluteTrackIndex(t, seat, t.lastTrackStep)!;
      // The turn-in cell is two cells before the seat's own start: the seat never passes behind its start.
      expect((turnIn + 2) % t.trackLength).toBe(t.startIndex[seat]);
      expect(absoluteTrackIndex(t, seat, t.lastTrackStep + 1)).toBeNull();
    }
    expect(stepZone(t, t.lastTrackStep)).toBe("track");
    expect(stepZone(t, t.lastTrackStep + 1)).toBe("lane");
    expect(stepZone(t, t.finishStep)).toBe("finish");
  });
});

describe("specific boards", () => {
  it("classic square: 52 cells, starts 0/13/26/39, safe 0 8 13 21 26 34 39 47, finish at 56", () => {
    expect(CLASSIC_TOPOLOGY.trackLength).toBe(52);
    expect(CLASSIC_TOPOLOGY.startIndex).toEqual([0, 13, 26, 39]);
    expect(CLASSIC_TOPOLOGY.safeIndices).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
    expect(CLASSIC_TOPOLOGY.finishStep).toBe(56);
  });

  it("classic geometry consumes the topology (no duplicated indices)", () => {
    expect(CLASSIC_TRACK).toHaveLength(CLASSIC_TOPOLOGY.trackLength);
    expect(CLASSIC_START_INDEX).toBe(CLASSIC_TOPOLOGY.startIndex);
    expect(CLASSIC_SAFE_INDICES).toBe(CLASSIC_TOPOLOGY.safeIndices);
  });

  it("2-player rectangle keeps classic pace and classic's safe indices", () => {
    const t = topologyFor(2);
    expect(t.variant).toBe("rectangle");
    expect(t.trackLength).toBe(52);
    expect(t.startIndex).toEqual([0, 26]);
    expect(t.safeIndices).toEqual(CLASSIC_TOPOLOGY.safeIndices);
  });

  it("2-player square option seats players diagonally opposite", () => {
    expect(topologyFor(2, { twoPlayerBoard: "square" }).activeSeats).toEqual([0, 2]);
  });

  it("3-player triangle: 51 cells, six symmetric safe cells", () => {
    const t = topologyFor(3);
    expect(t.trackLength).toBe(51);
    expect(t.safeIndices).toEqual([0, 8, 17, 25, 34, 42]);
    expect(t.finishStep).toBe(55);
  });

  it("ring boards keep laps between 60 and 75 cells", () => {
    for (let n = 5; n <= 15; n++) {
      const t = topologyFor(n as 5);
      expect(t.variant).toBe("ring");
      expect(t.sides).toBe(n);
      expect(t.trackLength).toBeGreaterThanOrEqual(60);
      expect(t.trackLength).toBeLessThanOrEqual(75);
    }
  });

  it("rejects unsupported counts, seats and steps", () => {
    expect(() => topologyFor(16 as 15)).toThrow(RangeError);
    expect(() => absoluteTrackIndex(CLASSIC_TOPOLOGY, 4, 0)).toThrow(RangeError);
    expect(() => absoluteTrackIndex(CLASSIC_TOPOLOGY, 0, -1)).toThrow(RangeError);
    expect(isSafeIndex(CLASSIC_TOPOLOGY, 8)).toBe(true);
    expect(isSafeIndex(CLASSIC_TOPOLOGY, 9)).toBe(false);
  });
});
