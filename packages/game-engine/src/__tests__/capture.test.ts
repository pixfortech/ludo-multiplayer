// 9. Capture · 10. Safe-cell no-capture · 11. Home-lane no-capture · 14. Capture bonus
import { describe, expect, it } from "vitest";
import { checkCapture } from "../captureEngine.js";
import { moveToken, rollDice } from "../gameEngine.js";
import { current, newGame, place, roll, steps, types } from "./fixtures.js";

// Absolute cell = (start + step) % 52 with starts 0 / 13 / 26 / 39.
// Crimson step 5 = absolute 5 (r5c6). Blue step 44 = (13 + 44) % 52 = 5.

describe("capture", () => {
  it("landing on an opponent on a non-safe shared cell sends it back to base", () => {
    const result = rollDice(place(newGame(), { crimson: [2, null, null, null], blue: [44, null, null, null] }), "crimson", 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(steps(result.state, "crimson")[0]).toBe(5);
    expect(steps(result.state, "blue")[0]).toBeNull();
    expect(result.events.find((e) => e.type === "capture")).toMatchObject({
      playerId: "crimson",
      tokenId: 0,
      cell: 5,
      victimPlayerId: "blue",
      victimTokenId: 0,
    });
  });

  it("captures every opponent token on the cell (stacked and from different players)", () => {
    // Emerald step 31 = (26 + 31) % 52 = 5. Blue tokens 0 and 1 both at absolute 5.
    const state = place(newGame(), { crimson: [2, null, null, null], blue: [44, 44, null, null], emerald: [31, null, null, null] });
    const after = roll(state, 3);
    expect(steps(after, "blue").slice(0, 2)).toEqual([null, null]);
    expect(steps(after, "emerald")[0]).toBeNull();
    expect(after.history.filter((e) => e.type === "capture")).toHaveLength(3);
  });

  it("never captures the mover's own tokens: they share the cell", () => {
    const rolled = roll(place(newGame(4, { autoMove: false }), { crimson: [2, 5, null, null] }), 3);
    const result = moveToken(rolled, "crimson", 0); // 2 → 5, where token 1 already stands
    expect(types(result)).toEqual(["move", "turn"]); // no capture, no bonus
    expect(result.ok && steps(result.state, "crimson").slice(0, 2)).toEqual([5, 5]);
  });

  it("checkCapture lists victims without changing the state", () => {
    const state = place(newGame(), { blue: [44, null, null, null] });
    const snapshot = JSON.stringify(state);
    expect(checkCapture(state, "crimson", 5)).toEqual([{ playerId: "blue", tokenId: 0 }]);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("safe cells", () => {
  it("no capture on a star cell (crimson step 8 = absolute 8)", () => {
    // Blue step 47 = (13 + 47) % 52 = 8.
    const after = roll(place(newGame(), { crimson: [5, null, null, null], blue: [47, null, null, null] }), 3);
    expect(steps(after, "crimson")[0]).toBe(8);
    expect(steps(after, "blue")[0]).toBe(47);
    expect(checkCapture(after, "crimson", 8)).toEqual([]);
  });

  it("no capture on another player's start cell (absolute 13)", () => {
    // Blue on its own start (step 0 = absolute 13); crimson lands on its step 13.
    const after = roll(place(newGame(), { crimson: [10, null, null, null], blue: [0, null, null, null] }), 3);
    expect(steps(after, "crimson")[0]).toBe(13);
    expect(steps(after, "blue")[0]).toBe(0);
  });

  it("every safe index protects: starts 0/13/26/39 and stars 8/21/34/47", () => {
    for (const abs of [0, 8, 13, 21, 26, 34, 39, 47]) {
      const blueStep = (abs - 13 + 52) % 52;
      if (blueStep > 50) continue; // blue never stands on the cell behind its own start
      const state = place(newGame(), { blue: [blueStep, null, null, null] });
      expect(checkCapture(state, "crimson", abs), `absolute ${abs}`).toEqual([]);
    }
  });
});

describe("home lanes", () => {
  it("nothing can be captured in a home lane or at home", () => {
    const state = place(newGame(), { blue: [44, 52, 56, null] });
    for (const step of [51, 52, 53, 54, 55, 56]) expect(checkCapture(state, "crimson", step)).toEqual([]);
  });

  it("an opponent standing on the turn-in cell is still capturable, but lane cells are not shared", () => {
    // Crimson turn-in = absolute 50; blue step 37 = (13 + 37) % 52 = 50.
    const after = roll(place(newGame(), { crimson: [47, null, null, null], blue: [37, null, null, null] }), 3);
    expect(steps(after, "blue")[0]).toBeNull();
  });
});

describe("capture bonus", () => {
  it("a capture with a non-6 keeps the turn for one more roll", () => {
    const result = rollDice(place(newGame(), { crimson: [2, null, null, null], blue: [44, null, null, null] }), "crimson", 3);
    expect(types(result)).toEqual(["roll", "auto-move", "capture", "bonus-roll"]);
    expect(result.ok && current(result.state)).toBe("crimson");
  });

  it("capturing several tokens still earns exactly one bonus roll", () => {
    const after = roll(place(newGame(), { crimson: [2, null, null, null], blue: [44, 44, null, null] }), 3);
    const bonus = after.history.filter((e) => e.type === "bonus-roll");
    expect(bonus).toHaveLength(1);
    expect(after.turn).toMatchObject({ phase: "awaiting-roll", dice: null });
  });

  it("a 6 that also captures earns one bonus roll, not two", () => {
    // Crimson 0 → 6 (absolute 6, not safe); blue step 45 = (13 + 45) % 52 = 6.
    const result = rollDice(place(newGame(), { crimson: [0, 56, 56, 56], blue: [45, null, null, null] }), "crimson", 6);
    expect(types(result)).toEqual(["roll", "auto-move", "capture", "bonus-roll"]);
    expect(result.ok && result.events.at(-1)).toMatchObject({ type: "bonus-roll", reasons: ["six", "capture"] });
    expect(result.ok && result.state.turn.consecutiveSixes).toBe(1);
  });
});
