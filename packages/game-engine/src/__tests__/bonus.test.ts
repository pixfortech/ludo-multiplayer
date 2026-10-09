// 12. Six bonus · 13. Three-six forfeit · 15. Home bonus
import { describe, expect, it } from "vitest";
import { moveToken, rollDice } from "../gameEngine.js";
import { current, newGame, place, roll, steps, types } from "./fixtures.js";

describe("six bonus", () => {
  it("a move made with a 6 keeps the turn", () => {
    const after = roll(place(newGame(), { crimson: [10, 56, 56, 56] }), 6);
    expect(current(after)).toBe("crimson");
    expect(after.history.at(-1)).toMatchObject({ type: "bonus-roll", reasons: ["six"] });
  });

  it("a non-6 move without capture or home passes the turn clockwise", () => {
    const after = roll(place(newGame(), { crimson: [10, 56, 56, 56] }), 3);
    expect(current(after)).toBe("blue");
    expect(after.history.at(-1)).toMatchObject({ type: "turn", playerId: "blue", reason: "move-complete" });
  });

  it("turn order follows seats clockwise and wraps", () => {
    let state = newGame();
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(current(state));
      state = roll(state, 2); // everyone in base: auto-pass
    }
    expect(order).toEqual(["crimson", "blue", "emerald", "golden", "crimson"]);
  });

  it("a 6 with no legal move still earns the bonus roll", () => {
    const result = rollDice(place(newGame(), { crimson: [53, 56, 56, 56] }), "crimson", 6); // 53 + 6 overshoots
    expect(types(result)).toEqual(["roll", "bonus-roll"]);
    expect(result.ok && current(result.state)).toBe("crimson");
  });
});

describe("three consecutive sixes", () => {
  it("the third six forfeits the turn without moving; earlier moves stand", () => {
    let state = place(newGame(), { crimson: [10, 56, 56, 56] });
    state = roll(state, 6); // 10 → 16, bonus
    state = roll(state, 6); // 16 → 22, bonus
    expect(steps(state, "crimson")[0]).toBe(22);
    expect(state.turn.consecutiveSixes).toBe(2);
    const result = rollDice(state, "crimson", 6);
    expect(types(result)).toEqual(["roll", "forfeit", "turn"]);
    expect(result.ok && steps(result.state, "crimson")[0]).toBe(22);
    expect(result.ok && current(result.state)).toBe("blue");
    expect(result.ok && result.state.turn.consecutiveSixes).toBe(0);
  });

  it("a non-6 bonus roll in between resets the count", () => {
    // Blue step 2 = absolute 15. Crimson: 6, 6, then a 3 that captures (bonus, count reset), then 6.
    let state = place(newGame(), { crimson: [0, 56, 56, 56], blue: [2, null, null, null] });
    state = roll(state, 6); // 0 → 6, count 1
    state = roll(state, 6); // 6 → 12, count 2
    state = roll(state, 3); // 12 → 15 captures blue: bonus, count 0
    expect(current(state)).toBe("crimson");
    expect(state.turn.consecutiveSixes).toBe(0);
    state = roll(state, 6); // 15 → 21: a six again, but only the first in a row
    expect(state.history.some((e) => e.type === "forfeit")).toBe(false);
    expect(state.turn.consecutiveSixes).toBe(1);
    expect(steps(state, "crimson")[0]).toBe(21);
  });

  it("the count resets when the turn passes, so the next player starts at zero", () => {
    let state = place(newGame(), { crimson: [10, 56, 56, 56], blue: [5, 56, 56, 56] });
    state = roll(state, 6);
    state = roll(state, 6);
    state = roll(state, 6); // forfeit → blue
    expect(current(state)).toBe("blue");
    state = roll(state, 6);
    expect(state.turn.consecutiveSixes).toBe(1);
    expect(current(state)).toBe("blue");
  });
});

describe("home bonus", () => {
  it("bringing a token home earns another roll", () => {
    const result = rollDice(place(newGame(), { crimson: [52, 56, 56, null] }), "crimson", 4);
    expect(types(result)).toEqual(["roll", "auto-move", "home", "bonus-roll"]);
    expect(result.ok && result.events.at(-1)).toMatchObject({ reasons: ["home"] });
  });

  it("reaching home with a 6 earns one roll for both reasons", () => {
    // A 6 could also open token 3, so the player chooses token 0 manually.
    const rolled = roll(place(newGame(), { crimson: [50, 56, 56, null] }), 6);
    expect(rolled.turn.phase).toBe("awaiting-move");
    const result = moveToken(rolled, "crimson", 0);
    expect(types(result)).toEqual(["move", "home", "bonus-roll"]);
    expect(result.ok && result.events.at(-1)).toMatchObject({ reasons: ["six", "home"] });
  });

  it("no bonus when that token ends the game", () => {
    const result = rollDice(place(newGame(), { crimson: [52, 56, 56, 56] }), "crimson", 4);
    expect(types(result)).toEqual(["roll", "auto-move", "home", "player-finished", "win", "game-over"]);
  });

  it("manual moves follow the same bonus rules", () => {
    const rolled = roll(place(newGame(4, { autoMove: false }), { crimson: [52, 20, null, null] }), 4);
    const result = moveToken(rolled, "crimson", 0);
    expect(types(result)).toEqual(["move", "home", "bonus-roll"]);
  });
});
