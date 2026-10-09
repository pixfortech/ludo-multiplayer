// 16. Auto-pass · 17. Auto-move
import { describe, expect, it } from "vitest";
import { rollDice } from "../gameEngine.js";
import { current, move, newGame, place, roll, steps, types } from "./fixtures.js";

describe("auto-pass", () => {
  it("with no legal move, the turn passes automatically after the roll", () => {
    const result = rollDice(newGame(), "crimson", 3);
    expect(types(result)).toEqual(["roll", "auto-pass", "turn"]);
    expect(result.ok && result.events[1]).toMatchObject({ type: "auto-pass", playerId: "crimson", dice: 3 });
    expect(result.ok && result.events[2]).toMatchObject({ type: "turn", playerId: "blue", reason: "no-legal-move" });
  });

  it("auto-pass applies when every active token would overshoot and the rest are home", () => {
    const result = rollDice(place(newGame(), { crimson: [55, 54, 56, 56] }), "crimson", 3);
    expect(types(result)).toEqual(["roll", "auto-pass", "turn"]);
  });

  it("the roll is still recorded as the last roll", () => {
    const result = rollDice(newGame(), "crimson", 2);
    expect(result.ok && result.state.lastRoll).toEqual({ playerId: "crimson", value: 2 });
    expect(result.ok && result.state.turn.dice).toBeNull();
  });
});

describe("auto-move", () => {
  it("moves the only movable token and records it as an auto-move", () => {
    const result = rollDice(place(newGame(), { crimson: [10, null, null, null] }), "crimson", 4);
    expect(types(result)).toEqual(["roll", "auto-move", "turn"]);
    expect(result.ok && result.state.lastAutoMove).toEqual({ playerId: "crimson", tokenId: 0, from: 10, to: 14, dice: 4 });
  });

  it("clears the auto-move marker on the next action", () => {
    const after = roll(place(newGame(), { crimson: [10, null, null, null] }), 4);
    expect(after.lastAutoMove).not.toBeNull();
    expect(roll(after, 2).lastAutoMove).toBeNull(); // blue's roll
  });

  it("respects every rule: capture and its bonus", () => {
    const result = rollDice(place(newGame(), { crimson: [2, null, null, null], blue: [44, null, null, null] }), "crimson", 3);
    expect(types(result)).toEqual(["roll", "auto-move", "capture", "bonus-roll"]);
  });

  it("respects the exact-home rule by only choosing a legal token", () => {
    // Token 0 at 54 cannot use a 3 (overshoot); token 1 at 20 can → it is the single legal move.
    const result = rollDice(place(newGame(), { crimson: [54, 20, null, null] }), "crimson", 3);
    expect(result.ok && steps(result.state, "crimson").slice(0, 2)).toEqual([54, 23]);
  });

  it("does not trigger when several tokens can move", () => {
    const after = roll(place(newGame(), { crimson: [10, 20, null, null] }), 3);
    expect(after.turn.phase).toBe("awaiting-move");
    expect(after.lastAutoMove).toBeNull();
    expect(current(move(after, 1))).toBe("blue");
  });

  it("can be switched off", () => {
    const after = roll(place(newGame(4, { autoMove: false }), { crimson: [10, null, null, null] }), 4);
    expect(after.turn.phase).toBe("awaiting-move");
    expect(after.turn.legalMoves).toHaveLength(1);
  });
});
