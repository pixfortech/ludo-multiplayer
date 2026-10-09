// 1. Dice
import { describe, expect, it } from "vitest";
import { createCryptoDice, createFixedDice, drawIndex, isValidDieValue } from "../dice.js";
import { rollDice } from "../gameEngine.js";
import { expectError, newGame } from "./fixtures.js";

describe("dice values", () => {
  it("accepts only integers 1–6", () => {
    for (const v of [1, 2, 3, 4, 5, 6]) expect(isValidDieValue(v)).toBe(true);
    for (const v of [0, 7, -1, 2.5, Number.NaN, "3", null, undefined]) expect(isValidDieValue(v)).toBe(false);
  });

  it("rollDice rejects invalid values without changing the state", () => {
    const state = newGame();
    for (const v of [0, 7, 3.5, Number.NaN]) {
      const result = rollDice(state, "crimson", v);
      expectError(result, "invalid-dice");
      expect(result.state).toBe(state);
    }
  });

  it("records the roll as the last roll and in history", () => {
    const result = rollDice(newGame(), "crimson", 4);
    expect(result.ok && result.state.lastRoll).toEqual({ playerId: "crimson", value: 4 });
    expect(result.ok && result.events[0]).toMatchObject({ type: "roll", playerId: "crimson", value: 4 });
  });
});

describe("fixed dice (tests and replays)", () => {
  it("returns the given sequence and then refuses", () => {
    const dice = createFixedDice([6, 1, 3]);
    expect([dice.roll(), dice.roll(), dice.roll()]).toEqual([6, 1, 3]);
    expect(dice.remaining()).toBe(0);
    expect(() => dice.roll()).toThrow(/exhausted/);
  });

  it("rejects invalid values up front", () => {
    expect(() => createFixedDice([1, 7])).toThrow(RangeError);
  });
});

describe("secure dice (server)", () => {
  it("produces every face 1–6 with roughly uniform frequency", () => {
    const dice = createCryptoDice();
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 60_000;
    for (let i = 0; i < n; i++) {
      const v = dice.roll();
      expect(isValidDieValue(v)).toBe(true);
      counts[v - 1]!++;
    }
    // Chi-square with 5 degrees of freedom; 30 is far beyond the 99.99th percentile (~25.7).
    const expected = n / 6;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(30);
  });

  it("rejects biased bytes (≥ 252) instead of wrapping them", () => {
    const bytes = [255, 252, 5];
    const fake = { getRandomValues: <T extends Uint8Array>(a: T) => ((a[0] = bytes.shift()!), a) };
    expect(createCryptoDice(fake).roll()).toBe(6); // 5 % 6 + 1
  });

  it("drawIndex picks a valid index for the first player", () => {
    for (let i = 0; i < 200; i++) {
      const index = drawIndex(4);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
    }
    expect(() => drawIndex(0)).toThrow(RangeError);
  });
});
