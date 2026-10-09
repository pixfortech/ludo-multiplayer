// Persisted-state validation (used by the server before resuming a saved game).
import { describe, expect, it } from "vitest";
import { GameStateValidationError, deserializeGameState, serializeGameState } from "../sessionSerializer.js";
import { newGame, place, roll } from "./fixtures.js";

describe("session serializer", () => {
  it("round-trips a live mid-game state exactly", () => {
    const state = roll(place(newGame(4, { autoMove: false }), { crimson: [10, 20, null, null] }), 3);
    expect(deserializeGameState(serializeGameState(state))).toEqual(state);
    expect(deserializeGameState(JSON.parse(serializeGameState(state)))).toEqual(state);
  });

  it("accepts a finished game", () => {
    const finished = roll(place(newGame(), { crimson: [52, 56, 56, 56] }), 4);
    expect(deserializeGameState(serializeGameState(finished)).phase).toBe("finished");
  });

  const mutations: [string, (s: Record<string, unknown>) => void][] = [
    ["wrong schema version", (s) => (s.schemaVersion = 2)],
    ["negative stateVersion", (s) => (s.stateVersion = -1)],
    ["unknown ruleset", (s) => (s.ruleset = "pachisi")],
    ["one player", (s) => (s.players = (s.players as unknown[]).slice(0, 1))],
    ["token step out of range", (s) => ((s.players as { tokens: { step: number }[] }[])[0]!.tokens[0]!.step = 57)],
    ["three tokens", (s) => (s.players as { tokens: unknown[] }[])[0]!.tokens.pop()],
    ["duplicate seat", (s) => ((s.players as { seat: number }[])[1]!.seat = 0)],
    ["current player out of range", (s) => (s.currentPlayerIndex = 9)],
    ["dice out of range", (s) => ((s.turn as { dice: number }).dice = 7)],
    ["awaiting move without moves", (s) => ((s.turn as { phase: string }).phase = "awaiting-move")],
    ["unknown winner", (s) => (s.winnerId = "nobody")],
    ["broken history sequence", (s) => (s.history = [{ seq: 2, type: "roll" }])],
    ["finished flag disagrees", (s) => ((s.players as { finished: boolean }[])[0]!.finished = true)],
    [
      "two colours on one non-safe cell",
      (s) => {
        const players = s.players as { tokens: { step: number | null }[] }[];
        players[0]!.tokens[0]!.step = 5; // crimson step 5 = absolute 5
        players[1]!.tokens[0]!.step = 44; // blue step 44 = absolute 5
      },
    ],
  ];

  for (const [label, mutate] of mutations) {
    it(`rejects a snapshot with ${label}`, () => {
      const raw = JSON.parse(serializeGameState(newGame())) as Record<string, unknown>;
      mutate(raw);
      expect(() => deserializeGameState(raw)).toThrow(GameStateValidationError);
    });
  }

  it("rejects non-objects and invalid JSON", () => {
    expect(() => deserializeGameState(null)).toThrow(GameStateValidationError);
    expect(() => deserializeGameState("[1,2]")).toThrow(GameStateValidationError);
    expect(() => deserializeGameState("{not json")).toThrow(SyntaxError);
  });
});
