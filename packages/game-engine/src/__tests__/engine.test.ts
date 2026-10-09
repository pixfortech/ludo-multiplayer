// Engine contract: setup validation, action errors, purity, determinism,
// serialisation, and seeded full-game simulations with rule invariants.
import { describe, expect, it } from "vitest";
import { isSafeIndex, tokenTrackIndex, topologyOf } from "../board.js";
import { applyMove, moveToken, rollDice } from "../gameEngine.js";
import { canTokenMove, getMovableTokens, validateMove } from "../moveValidator.js";
import { GameConfigError, createGame } from "../state.js";
import type { ActionResult, GameSettings, GameState } from "../types.js";
import { current, expectError, newGame, place, roll } from "./fixtures.js";

describe("createGame", () => {
  it("creates a 2–4 player classic game with all tokens in base", () => {
    const state = newGame(4);
    expect(state).toMatchObject({ phase: "playing", stateVersion: 0, currentPlayerIndex: 0, board: { variant: "classic-square" } });
    expect(state.players.flatMap((p) => p.tokens.map((t) => t.step))).toEqual(Array(16).fill(null));
    expect(state.settings).toEqual({ autoMove: true, rankingMode: "winner-only" });
  });

  it("seats two players diagonally opposite by default (seats 0 and 2)", () => {
    expect(newGame(2).players.map((p) => [p.id, p.seat])).toEqual([["crimson", 0], ["emerald", 2]]);
  });

  it("orders players clockwise by seat when seats are given", () => {
    const state = createGame({ players: [{ id: "g", seat: 3 }, { id: "c", seat: 0 }, { id: "b", seat: 1 }] });
    expect(state.players.map((p) => p.id)).toEqual(["c", "b", "g"]);
  });

  it("rejects invalid setups", () => {
    const bad = [
      { players: [{ id: "a" }] },
      { players: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }] },
      { players: [{ id: "a" }, { id: "a" }] },
      { players: [{ id: "" }, { id: "b" }] },
      { players: [{ id: "a", seat: 0 }, { id: "b" }] },
      { players: [{ id: "a", seat: 0 }, { id: "b", seat: 0 }] },
      { players: [{ id: "a", seat: 0 }, { id: "b", seat: 4 }] },
      { players: [{ id: "a" }, { id: "b" }], firstPlayerIndex: 2 },
    ];
    for (const config of bad) expect(() => createGame(config), JSON.stringify(config)).toThrow(GameConfigError);
  });
});

describe("action errors", () => {
  it("rejects actions out of turn or out of phase, returning the same state", () => {
    const state = newGame();
    const cases: [ActionResult, string][] = [
      [rollDice(state, "blue", 3), "not-your-turn"],
      [rollDice(state, "nobody", 3), "unknown-player"],
      [moveToken(state, "crimson", 0), "not-awaiting-move"],
      [moveToken(roll(state, 6), "crimson", 9), "unknown-token"],
      [rollDice(roll(state, 6), "crimson", 4), "not-awaiting-roll"],
      [moveToken(roll(state, 6), "blue", 0), "not-your-turn"],
    ];
    for (const [result, code] of cases) expectError(result, code);
    const rejected = rollDice(state, "blue", 3);
    expect(rejected.state).toBe(state);
    expect(rejected.state.stateVersion).toBe(0);
  });

  it("applyMove throws for a move that is not legal now", () => {
    expect(() => applyMove(newGame(), { tokenId: 0 })).toThrow(/not-awaiting-move/);
    const rolled = roll(newGame(), 6);
    expect(applyMove(rolled, { tokenId: 1 }).players[0]!.tokens[1]!.step).toBe(0);
  });

  it("helpers agree with each other", () => {
    const rolled = roll(place(newGame(4, { autoMove: false }), { crimson: [53, 10, null, 56] }), 3);
    expect(getMovableTokens(rolled, "crimson", 3).map((m) => m.tokenId)).toEqual([0, 1]);
    expect(canTokenMove(rolled, "crimson", 2, 3)).toBe(false);
    expect(validateMove(rolled, "crimson", 3)).toMatchObject({ ok: false, error: "illegal-move" });
    expect(validateMove(rolled, "crimson", 1)).toMatchObject({ ok: true, move: { from: 10, to: 13, landsOnSafeCell: true } });
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe("purity and determinism", () => {
  it("never mutates the input state", () => {
    const state = deepFreeze(place(newGame(4, { autoMove: false }), { crimson: [2, 10, null, null], blue: [44, null, null, null] }));
    const snapshot = JSON.stringify(state);
    const rolled = rollDice(state, "crimson", 3);
    expect(rolled.ok).toBe(true);
    if (rolled.ok) moveToken(deepFreeze(rolled.state), "crimson", 0);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("increments stateVersion once per accepted action and reports exactly the new history", () => {
    const first = rollDice(newGame(), "crimson", 6);
    expect(first.ok && first.state.stateVersion).toBe(1);
    if (!first.ok) return;
    const second = moveToken(first.state, "crimson", 0);
    expect(second.ok && second.state.stateVersion).toBe(2);
    if (!second.ok) return;
    expect(second.events).toEqual(second.state.history.slice(first.state.history.length));
    expect(second.state.history.map((e) => e.seq)).toEqual(second.state.history.map((_, i) => i + 1));
  });

  it("is deterministic: the same actions always produce the same state", () => {
    const play = () => {
      let s = newGame();
      for (const v of [6, 3, 2, 6, 5, 1, 4]) {
        const r = rollDice(s, current(s), v);
        if (!r.ok) throw new Error(r.error);
        s = r.state.turn.phase === "awaiting-move" ? applyMove(r.state, { tokenId: r.state.turn.legalMoves[0]!.tokenId }) : r.state;
      }
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });

  it("survives a JSON round trip (persistence-ready) and continues identically", () => {
    const state = roll(place(newGame(), { crimson: [10, 20, null, null] }), 4);
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(restored).toEqual(state);
    expect(JSON.stringify(applyMove(restored, { tokenId: 1 }))).toBe(JSON.stringify(applyMove(state, { tokenId: 1 })));
  });
});

/** Small seeded PRNG (mulberry32) so simulations are reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(state: GameState): void {
  const topology = topologyOf(state);
  const occupants = new Map<number, Set<string>>();
  for (const player of state.players) {
    for (const token of player.tokens) {
      if (token.step !== null) {
        expect(token.step).toBeGreaterThanOrEqual(0);
        expect(token.step).toBeLessThanOrEqual(topology.finishStep);
      }
      const cell = tokenTrackIndex(topology, player, token.step);
      if (cell !== null && !isSafeIndex(topology, cell)) {
        occupants.set(cell, (occupants.get(cell) ?? new Set()).add(player.id));
      }
    }
    expect(player.finished).toBe(player.tokens.every((t) => t.step === topology.finishStep));
  }
  // Two different colours never share a non-safe cell: the later arrival always captures.
  for (const ids of occupants.values()) expect(ids.size).toBe(1);
}

describe("seeded full-game simulations", () => {
  const configs: [number, Partial<GameSettings>][] = [
    [2, {}],
    [3, { autoMove: false }],
    [4, {}],
    [4, { rankingMode: "full-ranking" }],
    [3, { rankingMode: "full-ranking", autoMove: false }],
  ];

  for (const [players, settings] of configs) {
    it(`${players} players ${JSON.stringify(settings)}: 25 games end correctly with invariants intact`, () => {
      for (let game = 0; game < 25; game++) {
        const random = prng(players * 1000 + game);
        let state = newGame(players, settings, game % players);
        let actions = 0;
        while (state.phase === "playing") {
          const before = state.stateVersion;
          const result =
            state.turn.phase === "awaiting-roll"
              ? rollDice(state, current(state), 1 + Math.floor(random() * 6))
              : moveToken(state, current(state), state.turn.legalMoves[Math.floor(random() * state.turn.legalMoves.length)]!.tokenId);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          state = result.state;
          expect(state.stateVersion).toBe(before + 1);
          checkInvariants(state);
          expect(++actions).toBeLessThan(20_000);
        }
        const expectedRanking = settings.rankingMode === "full-ranking" ? players : 1;
        expect(state.ranking).toHaveLength(expectedRanking);
        expect(new Set(state.ranking).size).toBe(expectedRanking);
        expect(state.winnerId).toBe(state.ranking[0]);
        expect(state.history.at(-1)!.type).toBe("game-over");
      }
    }, 30_000);
  }
});
