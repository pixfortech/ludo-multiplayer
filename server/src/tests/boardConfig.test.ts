import { describe, it, expect } from "vitest";
import {
  TRACK_LENGTH,
  HOME_COLUMN_START,
  HOME_POSITION,
  START_OFFSETS,
  SAFE_CELLS,
  isSafeCell,
  localStepToAbsolute,
} from "../game/boardConfig.js";
import { checkCapture } from "../game/moveValidator.js";
import { createInitialState, startGame } from "../game/gameEngine.js";
import type { GameState, PlayerColor } from "../game/gameTypes.js";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

describe("Board constants", () => {
  it("uses a 52-cell shared track with home column 52..57 and home at 58", () => {
    expect(TRACK_LENGTH).toBe(52);
    expect(HOME_COLUMN_START).toBe(52);
    expect(HOME_POSITION).toBe(58);
  });

  it("start offsets are one quarter-loop apart (red 0, blue 13, green 26, yellow 39)", () => {
    expect(START_OFFSETS).toEqual({ red: 0, blue: 13, green: 26, yellow: 39 });
  });
});

describe("Safe cells", () => {
  // This set MUST equal the client's SAFE_ABS (client/.../boardLayout.ts).
  it("are exactly the 8 canonical safe indices", () => {
    expect([...SAFE_CELLS].sort((a, b) => a - b)).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
  });

  it("include every colour's start cell", () => {
    for (const color of COLORS) expect(SAFE_CELLS.has(START_OFFSETS[color])).toBe(true);
  });

  it("include the star cell 8 steps after each start", () => {
    for (const color of COLORS) expect(SAFE_CELLS.has((START_OFFSETS[color] + 8) % 52)).toBe(true);
  });

  it("isSafeCell is true on safe indices and false on a normal cell", () => {
    for (const abs of [0, 8, 13, 21, 26, 34, 39, 47]) expect(isSafeCell(abs)).toBe(true);
    for (const abs of [1, 5, 10, 20, 30, 40, 50]) expect(isSafeCell(abs)).toBe(false);
  });
});

describe("localStepToAbsolute", () => {
  it("maps local step 0 to each colour's start offset", () => {
    for (const color of COLORS) {
      expect(localStepToAbsolute(color, 0)).toBe(START_OFFSETS[color]);
    }
  });

  it("wraps around the 52-cell loop", () => {
    // Red (offset 0) at step 51 → abs 51; blue (offset 13) at step 51 → abs 12.
    expect(localStepToAbsolute("red", 51)).toBe(51);
    expect(localStepToAbsolute("blue", 51)).toBe(12);
    expect(localStepToAbsolute("green", 51)).toBe(25);
    expect(localStepToAbsolute("yellow", 51)).toBe(38);
  });

  it("returns -1 for the home column (steps 52..58) for every colour", () => {
    for (const color of COLORS) {
      for (let step = HOME_COLUMN_START; step <= HOME_POSITION; step++) {
        expect(localStepToAbsolute(color, step)).toBe(-1);
      }
    }
  });

  it("each colour's last shared-track step (51) stays on the 0..51 ring", () => {
    for (const color of COLORS) {
      const abs = localStepToAbsolute(color, 51);
      expect(abs).toBeGreaterThanOrEqual(0);
      expect(abs).toBeLessThan(52);
    }
  });
});

describe("Capture respects safe cells and home lanes", () => {
  function twoPlayers(): GameState {
    return startGame(createInitialState("r", [{ id: "p1", color: "red" }, { id: "p2", color: "blue" }], 2));
  }

  it("captures an opponent on a shared, non-safe cell", () => {
    const state = twoPlayers();
    // Red lands on local 3 → abs 3 (not safe). Blue sits there: (13 + step) % 52 = 3 → step 42.
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 42 };
    const cap = checkCapture(state, "red", 3);
    expect(cap).toEqual({ color: "blue", tokenId: 0 });
  });

  it("does NOT capture on a safe cell", () => {
    const state = twoPlayers();
    // Red lands on local 8 → abs 8 (a star/safe cell). Blue on abs 8: (13+step)%52=8 → step 47.
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 47 };
    expect(checkCapture(state, "red", 8)).toBeUndefined();
  });

  it("never captures while inside the home column (step >= 52)", () => {
    const state = twoPlayers();
    state.players[1].tokens[0] = { id: 0, color: "blue", state: "active", position: 5 };
    for (let step = HOME_COLUMN_START; step <= HOME_POSITION; step++) {
      expect(checkCapture(state, "red", step)).toBeUndefined();
    }
  });

  it("never captures an own-colour token", () => {
    const state = twoPlayers();
    // Another red token on the same absolute cell must not be captured.
    state.players[0].tokens[1] = { id: 1, color: "red", state: "active", position: 3 };
    expect(checkCapture(state, "red", 3)).toBeUndefined();
  });
});
