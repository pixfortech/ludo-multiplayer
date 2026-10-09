// 2. Opening rule · 3. Base-token behaviour
import { describe, expect, it } from "vitest";
import { tokenTrackIndex, topologyOf } from "../board.js";
import { getMovableTokens } from "../moveValidator.js";
import { rollDice } from "../gameEngine.js";
import { current, move, newGame, place, roll, steps, types } from "./fixtures.js";

describe("opening", () => {
  it("a token leaves base only on a 6", () => {
    const state = newGame();
    for (const v of [1, 2, 3, 4, 5]) expect(getMovableTokens(state, "crimson", v)).toEqual([]);
    expect(getMovableTokens(state, "crimson", 6)).toHaveLength(4);
  });

  it("an opened token stands on its start cell (step 0)", () => {
    let state = place(newGame(), { crimson: [null, 56, 56, 56] });
    state = roll(state, 6); // exactly one token can move → auto-open
    expect(steps(state, "crimson")[0]).toBe(0);
    const topology = topologyOf(state);
    expect(tokenTrackIndex(topology, state.players[0]!, 0)).toBe(0); // crimson start = absolute 0 (r6c1)
  });

  it("each seat opens onto its own start cell", () => {
    const topology = topologyOf(newGame());
    const state = newGame();
    expect(state.players.map((p) => tokenTrackIndex(topology, p, 0))).toEqual([0, 13, 26, 39]);
  });

  it("with auto-move on and exactly one token able to open, it opens automatically", () => {
    const result = rollDice(place(newGame(), { crimson: [null, 56, 56, 56] }), "crimson", 6);
    expect(types(result)).toEqual(["roll", "auto-move", "bonus-roll"]);
  });

  it("with several tokens able to move, the player must choose", () => {
    const state = roll(newGame(), 6); // four tokens in base
    expect(state.turn.phase).toBe("awaiting-move");
    expect(state.turn.legalMoves.map((m) => m.tokenId)).toEqual([0, 1, 2, 3]);
    expect(state.turn.legalMoves.every((m) => m.opens && m.to === 0)).toBe(true);
    const moved = move(state, 2);
    expect(steps(moved, "crimson")).toEqual([null, null, 0, null]);
  });

  it("with auto-move off, even a single option waits for the player", () => {
    const state = roll(place(newGame(4, { autoMove: false }), { crimson: [null, 56, 56, 56] }), 6);
    expect(state.turn.phase).toBe("awaiting-move");
    expect(state.turn.legalMoves).toHaveLength(1);
  });

  it("opening onto a start cell occupied by an opponent captures nothing (start cells are safe)", () => {
    // Blue at its step 39 sits on absolute 0 = crimson's start.
    let state = place(newGame(), { crimson: [null, 56, 56, 56], blue: [39] });
    state = roll(state, 6);
    expect(steps(state, "crimson")[0]).toBe(0);
    expect(steps(state, "blue")[0]).toBe(39);
  });

  it("opening with a 6 earns a bonus roll", () => {
    const state = roll(place(newGame(), { crimson: [null, 56, 56, 56] }), 6);
    expect(current(state)).toBe("crimson");
    expect(state.turn.phase).toBe("awaiting-roll");
  });
});

describe("base tokens", () => {
  it("stay in base and are not listed as movable on a non-6", () => {
    const state = place(newGame(), { crimson: [10, null, null, null] });
    expect(getMovableTokens(state, "crimson", 3).map((m) => m.tokenId)).toEqual([0]);
  });

  it("with every token in base, a non-6 passes the turn automatically", () => {
    const result = rollDice(newGame(), "crimson", 4);
    expect(types(result)).toEqual(["roll", "auto-pass", "turn"]);
    expect(result.ok && current(result.state)).toBe("blue");
  });

  it("a 6 offers both opening a base token and moving an active one", () => {
    const state = roll(place(newGame(), { crimson: [10, null, 56, 56] }), 6);
    expect(state.turn.legalMoves.map((m) => [m.tokenId, m.from, m.to])).toEqual([
      [0, 10, 16],
      [1, null, 0],
    ]);
  });
});
