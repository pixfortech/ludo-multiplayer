// 4. Shared-track movement · 5. Home-lane entry · 6. Exact home · 7. Overshoot · 8. Home-token immovability
import { describe, expect, it } from "vitest";
import { tokenTrackIndex, topologyOf } from "../board.js";
import { moveToken, rollDice } from "../gameEngine.js";
import { canTokenMove, getMovableTokens, validateMove } from "../moveValidator.js";
import { current, expectError, move, newGame, place, roll, steps, types } from "./fixtures.js";

describe("shared-track movement", () => {
  it("moves a token forward by exactly the dice value", () => {
    const state = roll(place(newGame(), { crimson: [10, null, null, null] }), 4);
    expect(steps(state, "crimson")[0]).toBe(14);
  });

  it("wraps from absolute 51 to 0 for seats that pass the top-left corner", () => {
    const state = newGame();
    const topology = topologyOf(state);
    const blue = state.players[1]!;
    expect(tokenTrackIndex(topology, blue, 38)).toBe(51); // r6c0
    expect(tokenTrackIndex(topology, blue, 39)).toBe(0); // r6c1, crimson's start
  });

  it("moves through the wrap-around on a real move", () => {
    let state = place(newGame(4, {}, 1), { blue: [36, null, null, null] }); // blue to play
    state = roll(state, 4); // 36 → 40 crosses absolute 51 → 0 → 1
    const topology = topologyOf(state);
    expect(steps(state, "blue")[0]).toBe(40);
    expect(tokenTrackIndex(topology, state.players[1]!, 40)).toBe(1);
  });

  it("several active tokens each get their own legal move", () => {
    const state = roll(place(newGame(), { crimson: [3, 20, null, null] }), 2);
    expect(state.turn.legalMoves.map((m) => [m.tokenId, m.from, m.to])).toEqual([
      [0, 3, 5],
      [1, 20, 22],
    ]);
  });
});

describe("home-lane entry", () => {
  it("steps past the turn-in cell (50) continue into the private lane", () => {
    const state = roll(place(newGame(), { crimson: [48, null, null, null] }), 4); // 48 → 52
    expect(steps(state, "crimson")[0]).toBe(52);
    expect(tokenTrackIndex(topologyOf(state), state.players[0]!, 52)).toBeNull(); // off the shared track
  });

  it("flags the lane entry on the legal move", () => {
    const [m] = getMovableTokens(place(newGame(), { crimson: [49, null, null, null] }), "crimson", 3);
    expect(m).toMatchObject({ from: 49, to: 52, entersLane: true, reachesHome: false });
  });

  it("a token never walks past its own turn-in cell onto the cell behind its start", () => {
    // Step 50 is the last shared step; 51 is the first lane cell, not absolute 51.
    const topology = topologyOf(newGame());
    expect(topology.lastTrackStep).toBe(50);
    expect(tokenTrackIndex(topology, newGame().players[0]!, 51)).toBeNull();
  });
});

describe("exact home", () => {
  it("an exact roll reaches home (step 56)", () => {
    const state = roll(place(newGame(), { crimson: [52, null, null, null] }), 4);
    expect(steps(state, "crimson")[0]).toBe(56);
  });

  it("the legal move reports reaching home", () => {
    const [m] = getMovableTokens(place(newGame(), { crimson: [50, null, null, null] }), "crimson", 6);
    expect(m).toMatchObject({ from: 50, to: 56, reachesHome: true });
  });
});

describe("overshoot", () => {
  it("a roll that would pass home is not a legal move", () => {
    const state = place(newGame(), { crimson: [53, null, null, null] });
    for (const v of [4, 5, 6]) expect(canTokenMove(state, "crimson", 0, v)).toBe(false);
    for (const v of [1, 2, 3]) expect(canTokenMove(state, "crimson", 0, v)).toBe(true);
  });

  it("with the only active token unable to move, a non-6 passes the turn", () => {
    const result = rollDice(place(newGame(), { crimson: [54, null, null, null] }), "crimson", 5);
    expect(types(result)).toEqual(["roll", "auto-pass", "turn"]);
    expect(result.ok && steps(result.state, "crimson")[0]).toBe(54);
  });

  it("an explicit request to overshoot is rejected", () => {
    const state = roll(place(newGame(), { crimson: [54, 10, null, null] }), 3); // token 1 can move, token 0 cannot
    expect(state.turn.phase).toBe("awaiting-roll"); // auto-moved token 1 (only legal move)
    const manual = roll(place(newGame(4, { autoMove: false }), { crimson: [54, 10, null, null] }), 3);
    expectError(moveToken(manual, "crimson", 0), "illegal-move");
    expect(validateMove(manual, "crimson", 1)).toMatchObject({ ok: true });
  });
});

describe("home-token immovability", () => {
  it("a token at home is never movable", () => {
    const state = place(newGame(), { crimson: [56, 20, null, null] });
    for (let v = 1; v <= 6; v++) expect(canTokenMove(state, "crimson", 0, v)).toBe(false);
  });

  it("requests to move a home token are rejected", () => {
    const state = roll(place(newGame(4, { autoMove: false }), { crimson: [56, 20, null, null] }), 2);
    expectError(moveToken(state, "crimson", 0), "illegal-move");
    expect(current(move(state, 1))).toBe("blue");
  });
});
