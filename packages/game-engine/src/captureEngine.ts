// Capture rules: a token landing on a non-safe shared-track cell sends every
// opponent token on that cell back to base. Never on safe cells, never in
// home lanes or home, never against the mover's own tokens.

import { isOnSharedTrack, isSafeIndex, tokenTrackIndex, topologyOf } from "./board.js";
import type { CapturedToken, GameState } from "./types.js";

/**
 * Opponent tokens that would be captured if `playerId`'s token landed on
 * `toStep`. Pure: does not change the state.
 */
export function checkCapture(state: GameState, playerId: string, toStep: number): CapturedToken[] {
  const topology = topologyOf(state);
  const mover = state.players.find((p) => p.id === playerId);
  if (!mover || !isOnSharedTrack(topology, toStep)) return [];
  const cell = tokenTrackIndex(topology, mover, toStep);
  if (cell === null || isSafeIndex(topology, cell)) return [];

  const captured: CapturedToken[] = [];
  for (const opponent of state.players) {
    if (opponent.id === playerId) continue;
    for (const token of opponent.tokens) {
      if (tokenTrackIndex(topology, opponent, token.step) === cell) captured.push({ playerId: opponent.id, tokenId: token.id });
    }
  }
  return captured;
}
