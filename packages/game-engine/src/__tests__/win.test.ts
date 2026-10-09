// 18. Win condition · 19. Finished-game no-action
import { describe, expect, it } from "vitest";
import { moveToken, rollDice } from "../gameEngine.js";
import { validateMove } from "../moveValidator.js";
import { nextActivePlayerIndex } from "../turnEngine.js";
import { current, expectError, newGame, place, roll, types } from "./fixtures.js";

describe("win (winner-only, the default)", () => {
  it("a player wins when the fourth token reaches home, and the game ends", () => {
    const result = rollDice(place(newGame(), { crimson: [52, 56, 56, 56] }), "crimson", 4);
    expect(types(result)).toEqual(["roll", "auto-move", "home", "player-finished", "win", "game-over"]);
    if (!result.ok) return;
    expect(result.state.phase).toBe("finished");
    expect(result.state.winnerId).toBe("crimson");
    expect(result.state.ranking).toEqual(["crimson"]);
    expect(result.state.players[0]!.finished).toBe(true);
  });

  it("three tokens home is not a win", () => {
    const rolled = roll(place(newGame(), { crimson: [52, 56, 56, 10] }), 4); // token 0 or token 3 may move
    const result = moveToken(rolled, "crimson", 0); // token 0 reaches home: three of four home
    expect(types(result)).toEqual(["move", "home", "bonus-roll"]);
    expect(result.ok && result.state.phase).toBe("playing");
    expect(result.ok && result.state.winnerId).toBeNull();
  });
});

describe("finished game accepts no actions", () => {
  const finished = (() => {
    const r = rollDice(place(newGame(), { crimson: [52, 56, 56, 56] }), "crimson", 4);
    if (!r.ok) throw new Error("setup failed");
    return r.state;
  })();

  it("rejects rolls from anyone", () => {
    for (const id of ["crimson", "blue", "emerald", "golden"]) {
      const result = rollDice(finished, id, 6);
      expectError(result, "game-finished");
      expect(result.state).toBe(finished);
    }
  });

  it("rejects moves and move validation", () => {
    expectError(moveToken(finished, "crimson", 0), "game-finished");
    expect(validateMove(finished, "blue", 0)).toMatchObject({ ok: false, error: "game-finished" });
  });
});

describe("full ranking", () => {
  it("play continues after the first finisher, who is skipped from then on", () => {
    let state = place(newGame(3, { rankingMode: "full-ranking" }), { crimson: [52, 56, 56, 56], blue: [10, 56, 56, 56] });
    state = roll(state, 4); // crimson finishes, 1st place
    expect(state.phase).toBe("playing");
    expect(state.winnerId).toBe("crimson");
    expect(state.ranking).toEqual(["crimson"]);
    expect(current(state)).toBe("blue");
    expect(state.history.at(-1)).toMatchObject({ type: "turn", reason: "player-finished" });
    state = roll(state, 1); // blue 10 → 11, passes
    expect(current(state)).toBe("emerald");
    state = roll(state, 1); // emerald all in base: auto-pass, skips crimson
    expect(current(state)).toBe("blue");
  });

  it("ends when one player is left, who takes last place", () => {
    let state = place(newGame(3, { rankingMode: "full-ranking" }), { crimson: [52, 56, 56, 56], blue: [52, 56, 56, 56] });
    state = roll(state, 4); // crimson 1st
    state = roll(state, 4); // blue 2nd → only emerald left
    expect(state.phase).toBe("finished");
    expect(state.ranking).toEqual(["crimson", "blue", "emerald"]);
    expect(state.winnerId).toBe("crimson");
    expect(state.history.at(-1)).toMatchObject({ type: "game-over", ranking: ["crimson", "blue", "emerald"] });
  });

  it("nextActivePlayerIndex skips finished players", () => {
    const state = newGame(4);
    state.players[1]!.finished = true;
    expect(nextActivePlayerIndex(state, 0)).toBe(2);
  });
});
