// @ludo/game-engine — the single source of truth for classic Ludo rules.
//
// Pure TypeScript: (state, action) → { state, events }. No I/O, no clocks and
// no hidden randomness; the server draws dice from a DiceSource and passes the
// value in. Board geometry comes only from @ludo/board-layouts/topology.
// Rules: docs/rules/classic-ludo.md · behaviour: docs/architecture/game-engine.md

import { MAX_PLAYERS, MIN_PLAYERS } from "@ludo/shared-types";

export const ENGINE_INFO = {
  name: "@ludo/game-engine",
  supportedPlayers: { min: MIN_PLAYERS, max: MAX_PLAYERS },
  /** Player counts with implemented gameplay (classic square). */
  playablePlayers: { min: 2, max: 4 },
} as const;

export * from "./types.js";
export { DIE_FACES, createCryptoDice, createFixedDice, drawIndex, isValidDieValue, type DiceSource } from "./dice.js";
export { CLASSIC_DEFAULT_SEATS, isHome, isInLane, isOnSharedTrack, tokenTrackIndex, topologyOf } from "./board.js";
export { DEFAULT_SETTINGS, GameConfigError, cloneState, createGame, currentPlayer, findPlayer } from "./state.js";
export { OPENING_ROLL, canTokenMove, getMovableTokens, validateMove, type MoveValidation } from "./moveValidator.js";
export { checkCapture } from "./captureEngine.js";
export { MAX_CONSECUTIVE_SIXES, nextActivePlayerIndex } from "./turnEngine.js";
export { applyMove, moveToken, rollDice } from "./gameEngine.js";
