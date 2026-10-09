// The two player actions — roll and move — as pure transitions:
// (state, action) → { state, events }. Input states are never mutated.

import { tokenTrackIndex, topologyOf } from "./board.js";
import { checkCapture } from "./captureEngine.js";
import { isValidDieValue } from "./dice.js";
import { record } from "./history.js";
import { markFinishedIfComplete, resolveGameEnd } from "./homeEngine.js";
import { getMovableTokens, validateMove } from "./moveValidator.js";
import { cloneState, currentPlayer, findPlayer } from "./state.js";
import { MAX_CONSECUTIVE_SIXES, grantBonusRoll, passTurn } from "./turnEngine.js";
import type { ActionResult, BonusReason, EngineErrorCode, GameState, LegalMove } from "./types.js";

function reject(state: GameState, error: EngineErrorCode, message: string): ActionResult {
  return { ok: false, error, message, state };
}

function accept(before: GameState, draft: GameState): ActionResult {
  draft.stateVersion = before.stateVersion + 1;
  return { ok: true, state: draft, events: draft.history.slice(before.history.length) };
}

/**
 * Applies a legal move for the current player to a draft state, including
 * captures, home entry, finishing, bonus rolls and passing the turn.
 */
function applyMoveToDraft(draft: GameState, move: LegalMove, auto: boolean): void {
  const topology = topologyOf(draft);
  const player = currentPlayer(draft);
  const token = player.tokens.find((t) => t.id === move.tokenId)!;
  const dice = draft.turn.dice!;
  const from = token.step;

  // Captures are recomputed from the authoritative state, never trusted from the request.
  const captured = checkCapture(draft, player.id, move.to);
  token.step = move.to;
  record(draft, { type: auto ? "auto-move" : "move", playerId: player.id, tokenId: token.id, from, to: move.to, dice });
  if (auto) draft.lastAutoMove = { playerId: player.id, tokenId: token.id, from, to: move.to, dice };

  for (const victim of captured) {
    const victimToken = findPlayer(draft, victim.playerId)!.tokens.find((t) => t.id === victim.tokenId)!;
    victimToken.step = null;
    record(draft, {
      type: "capture",
      playerId: player.id,
      tokenId: token.id,
      cell: tokenTrackIndex(topology, player, move.to)!,
      victimPlayerId: victim.playerId,
      victimTokenId: victim.tokenId,
    });
  }

  const reachedHome = move.to === topology.finishStep;
  if (reachedHome) record(draft, { type: "home", playerId: player.id, tokenId: token.id });

  if (markFinishedIfComplete(draft, player)) {
    if (!resolveGameEnd(draft)) passTurn(draft, "player-finished");
    return;
  }

  const reasons: BonusReason[] = [];
  if (dice === 6) reasons.push("six");
  if (captured.length > 0) reasons.push("capture");
  if (reachedHome) reasons.push("home");
  if (reasons.length > 0) grantBonusRoll(draft, reasons);
  else passTurn(draft, "move-complete");
}

/**
 * Rolls for `playerId` with a server-drawn die `value` (1–6).
 * Handles three-sixes forfeit, auto-pass when no move exists, and auto-move
 * when exactly one token can move and the setting is on.
 */
export function rollDice(state: GameState, playerId: string, value: number): ActionResult {
  if (state.phase === "finished") return reject(state, "game-finished", "The game is over");
  if (!findPlayer(state, playerId)) return reject(state, "unknown-player", `Unknown player ${playerId}`);
  if (currentPlayer(state).id !== playerId) return reject(state, "not-your-turn", "It is not this player's turn");
  if (state.turn.phase !== "awaiting-roll") return reject(state, "not-awaiting-roll", "A move must be made before rolling again");
  if (!isValidDieValue(value)) return reject(state, "invalid-dice", `Dice value must be an integer 1–6, got ${String(value)}`);

  const draft = cloneState(state);
  draft.lastAutoMove = null;
  draft.lastRoll = { playerId, value };
  draft.turn.dice = value;
  draft.turn.consecutiveSixes = value === 6 ? draft.turn.consecutiveSixes + 1 : 0;
  record(draft, { type: "roll", playerId, value });

  if (draft.turn.consecutiveSixes >= MAX_CONSECUTIVE_SIXES) {
    record(draft, { type: "forfeit", playerId });
    passTurn(draft, "three-sixes");
    return accept(state, draft);
  }

  const legal = getMovableTokens(draft, playerId, value);
  if (legal.length === 0) {
    if (value === 6) {
      grantBonusRoll(draft, ["six"]); // a six always earns another roll, even with nothing to move
    } else {
      record(draft, { type: "auto-pass", playerId, dice: value });
      passTurn(draft, "no-legal-move");
    }
  } else if (legal.length === 1 && draft.settings.autoMove) {
    applyMoveToDraft(draft, legal[0]!, true);
  } else {
    draft.turn.phase = "awaiting-move";
    draft.turn.legalMoves = legal;
  }
  return accept(state, draft);
}

/** Moves one of the current player's tokens by the dice value in play. */
export function moveToken(state: GameState, playerId: string, tokenId: number): ActionResult {
  const validation = validateMove(state, playerId, tokenId);
  if (!validation.ok) return reject(state, validation.error, validation.message);
  const draft = cloneState(state);
  draft.lastAutoMove = null;
  applyMoveToDraft(draft, validation.move, false);
  return accept(state, draft);
}

/**
 * Pure transition: applies a move that is legal for the current player and
 * dice in play. Throws if it is not (callers should use `moveToken`, which
 * returns an error result instead).
 */
export function applyMove(state: GameState, move: Pick<LegalMove, "tokenId">): GameState {
  const result = moveToken(state, currentPlayer(state).id, move.tokenId);
  if (!result.ok) throw new Error(`applyMove: ${result.error} — ${result.message}`);
  return result.state;
}
