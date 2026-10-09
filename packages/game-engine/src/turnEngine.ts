// Turn transitions: bonus rolls and passing play clockwise. These helpers
// mutate a draft state that the engine has already cloned.

import { record } from "./history.js";
import type { BonusReason, GameState, PassReason } from "./types.js";

export const MAX_CONSECUTIVE_SIXES = 3;

/** Next player clockwise (seat order) who still has tokens to bring home. */
export function nextActivePlayerIndex(state: GameState, fromIndex: number): number {
  const count = state.players.length;
  for (let offset = 1; offset <= count; offset++) {
    const index = (fromIndex + offset) % count;
    if (!state.players[index]!.finished) return index;
  }
  return fromIndex;
}

export function passTurn(draft: GameState, reason: PassReason): void {
  draft.currentPlayerIndex = nextActivePlayerIndex(draft, draft.currentPlayerIndex);
  draft.turn = { phase: "awaiting-roll", dice: null, consecutiveSixes: 0, legalMoves: [] };
  record(draft, { type: "turn", playerId: draft.players[draft.currentPlayerIndex]!.id, reason });
}

/** Same player rolls again; the consecutive-six count is kept for the three-sixes rule. */
export function grantBonusRoll(draft: GameState, reasons: BonusReason[]): void {
  draft.turn = { phase: "awaiting-roll", dice: null, consecutiveSixes: draft.turn.consecutiveSixes, legalMoves: [] };
  record(draft, { type: "bonus-roll", playerId: draft.players[draft.currentPlayerIndex]!.id, reasons });
}
