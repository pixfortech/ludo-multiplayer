// Legal-move calculation from the approved topology.

import { isHome, isOnSharedTrack, isSafeIndex, tokenTrackIndex, topologyOf } from "./board.js";
import { checkCapture } from "./captureEngine.js";
import { findPlayer } from "./state.js";
import type { EngineErrorCode, GameState, LegalMove, PlayerState, TokenState } from "./types.js";

export const OPENING_ROLL = 6;

function targetStep(token: TokenState, dice: number): number | null {
  if (token.step === null) return dice === OPENING_ROLL ? 0 : null;
  return token.step + dice;
}

/** Whether a specific token may move with `dice` (ignores whose turn it is). */
export function canTokenMove(state: GameState, playerId: string, tokenId: number, dice: number): boolean {
  const player = findPlayer(state, playerId);
  const token = player?.tokens.find((t) => t.id === tokenId);
  if (!player || !token) return false;
  return describeMove(state, player, token, dice) !== null;
}

function describeMove(state: GameState, player: PlayerState, token: TokenState, dice: number): LegalMove | null {
  const topology = topologyOf(state);
  if (isHome(topology, token.step)) return null; // finished tokens never move
  const to = targetStep(token, dice);
  if (to === null || to > topology.finishStep) return null; // base needs a 6; no overshoot
  const cell = isOnSharedTrack(topology, to) ? tokenTrackIndex(topology, player, to) : null;
  return {
    tokenId: token.id,
    from: token.step,
    to,
    opens: token.step === null,
    entersLane: token.step !== null && token.step <= topology.lastTrackStep && to > topology.lastTrackStep,
    reachesHome: to === topology.finishStep,
    landsOnSafeCell: cell !== null && isSafeIndex(topology, cell),
    captures: checkCapture(state, player.id, to),
  };
}

/** All legal moves for a player and dice value, in token order. */
export function getMovableTokens(state: GameState, playerId: string, dice: number): LegalMove[] {
  const player = findPlayer(state, playerId);
  if (!player) return [];
  return player.tokens.map((t) => describeMove(state, player, t, dice)).filter((m): m is LegalMove => m !== null);
}

export type MoveValidation = { ok: true; move: LegalMove } | { ok: false; error: EngineErrorCode; message: string };

/** Validates a move request against the authoritative state (turn, phase, dice and rules). */
export function validateMove(state: GameState, playerId: string, tokenId: number): MoveValidation {
  if (state.phase === "finished") return { ok: false, error: "game-finished", message: "The game is over" };
  const player = findPlayer(state, playerId);
  if (!player) return { ok: false, error: "unknown-player", message: `Unknown player ${playerId}` };
  if (state.players[state.currentPlayerIndex]!.id !== playerId) return { ok: false, error: "not-your-turn", message: "It is not this player's turn" };
  if (state.turn.phase !== "awaiting-move" || state.turn.dice === null) {
    return { ok: false, error: "not-awaiting-move", message: "Roll the dice before moving" };
  }
  const token = player.tokens.find((t) => t.id === tokenId);
  if (!token) return { ok: false, error: "unknown-token", message: `Unknown token ${tokenId}` };
  const move = describeMove(state, player, token, state.turn.dice);
  if (!move) return { ok: false, error: "illegal-move", message: `Token ${tokenId} cannot move ${state.turn.dice}` };
  return { ok: true, move };
}
