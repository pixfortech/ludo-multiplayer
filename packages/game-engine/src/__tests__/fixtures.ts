// Test helpers. Scenario setup places tokens directly on a fresh state; every
// rule under test then runs through the public actions (rollDice / moveToken).

import { expect } from "vitest";
import { cloneState, createGame } from "../state.js";
import { moveToken, rollDice } from "../gameEngine.js";
import type { ActionResult, GameSettings, GameState } from "../types.js";

/** Seat order: crimson (0, top-left), blue (1), emerald (2), golden (3). */
export const IDS = ["crimson", "blue", "emerald", "golden"] as const;

export function newGame(players = 4, settings: Partial<GameSettings> = {}, firstPlayerIndex = 0): GameState {
  const ids = players === 2 ? ["crimson", "emerald"] : IDS.slice(0, players);
  return createGame({ players: ids.map((id) => ({ id })), settings, firstPlayerIndex });
}

/** Returns a copy with the given token steps (null = base) for each player id. */
export function place(state: GameState, steps: Partial<Record<string, (number | null)[]>>): GameState {
  const next = cloneState(state);
  for (const [id, values] of Object.entries(steps)) {
    const player = next.players.find((p) => p.id === id)!;
    values!.forEach((step, i) => (player.tokens[i]!.step = step));
  }
  return next;
}

export function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}: ${result.message}`);
  return result.state;
}

/** Rolls for the current player and expects success. */
export function roll(state: GameState, value: number): GameState {
  return ok(rollDice(state, state.players[state.currentPlayerIndex]!.id, value));
}

/** Moves a token of the current player and expects success. */
export function move(state: GameState, tokenId: number): GameState {
  return ok(moveToken(state, state.players[state.currentPlayerIndex]!.id, tokenId));
}

export const current = (state: GameState) => state.players[state.currentPlayerIndex]!.id;
export const steps = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.tokens.map((t) => t.step);
export const types = (result: ActionResult) => (result.ok ? result.events.map((e) => e.type) : []);

export function expectError(result: ActionResult, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe(code);
}
