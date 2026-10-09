// Typed, client-safe gameplay errors (same shape as RoomError).

import type { EngineErrorCode } from "@ludo/game-engine";
import type { ErrorDetails, GameplayErrorCode } from "@ludo/shared-types";

export class GameplayError extends Error {
  override name = "GameplayError";
  constructor(
    readonly code: GameplayErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
  }

  toJSON(): { code: GameplayErrorCode; message: string; details: ErrorDetails } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

const ENGINE_ERRORS: Record<Exclude<EngineErrorCode, "invalid-dice">, [GameplayErrorCode, string]> = {
  "game-finished": ["game-finished", "The game is over"],
  "unknown-player": ["not-a-player", "You are not playing in this game"],
  "not-your-turn": ["not-your-turn", "It is not your turn"],
  "not-awaiting-roll": ["not-awaiting-roll", "Choose a token to move before rolling again"],
  "not-awaiting-move": ["not-awaiting-move", "Roll the dice first"],
  "unknown-token": ["unknown-token", "That token does not exist"],
  "illegal-move": ["illegal-move", "That token cannot move with this roll"],
};

/** Engine rejections become client errors; an invalid die would be a server bug and is not hidden. */
export function fromEngineError(code: EngineErrorCode, stateVersion: number): Error {
  if (code === "invalid-dice") return new Error("The server produced an invalid die value");
  const [mapped, message] = ENGINE_ERRORS[code];
  return new GameplayError(mapped, message, { stateVersion });
}
