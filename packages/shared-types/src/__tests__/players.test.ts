import { describe, expect, it } from "vitest";
import {
  BOARD_SHAPE_BY_PLAYER_COUNT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COUNTS,
  isPlayerCount,
  ruleFamilyFor,
} from "../index.js";

describe("player counts", () => {
  it("covers every count from 2 to 15 exactly once", () => {
    expect(PLAYER_COUNTS[0]).toBe(MIN_PLAYERS);
    expect(PLAYER_COUNTS.at(-1)).toBe(MAX_PLAYERS);
    expect(new Set(PLAYER_COUNTS).size).toBe(MAX_PLAYERS - MIN_PLAYERS + 1);
  });

  it("isPlayerCount accepts only integers in range", () => {
    expect(isPlayerCount(2)).toBe(true);
    expect(isPlayerCount(15)).toBe(true);
    for (const bad of [1, 16, 0, -4, 4.5, "4", null, undefined]) {
      expect(isPlayerCount(bad)).toBe(false);
    }
  });

  it("maps each count to its board shape", () => {
    expect(BOARD_SHAPE_BY_PLAYER_COUNT[2]).toBe("rectangle");
    expect(BOARD_SHAPE_BY_PLAYER_COUNT[3]).toBe("triangle");
    expect(BOARD_SHAPE_BY_PLAYER_COUNT[4]).toBe("square");
    expect(BOARD_SHAPE_BY_PLAYER_COUNT[15]).toBe("pentadecagon");
    expect(new Set(Object.values(BOARD_SHAPE_BY_PLAYER_COUNT)).size).toBe(PLAYER_COUNTS.length);
  });

  it("uses classic rules up to 4 players and expanded rules from 5", () => {
    expect(ruleFamilyFor(4)).toBe("classic");
    expect(ruleFamilyFor(5)).toBe("expanded");
  });
});
