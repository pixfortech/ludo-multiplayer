import type { GameState, Player, Token, MoveResult, PlayerColor } from "./gameTypes.js";
import {
  HOME_POSITION,
  HOME_COLUMN_START,
  localStepToAbsolute,
  isSafeCell,
} from "./boardConfig.js";

export function canTokenMove(token: Token, dice: number): boolean {
  if (token.state === "home") return false;
  if (token.state === "base") return dice === 6;
  // active token: must not overshoot home
  return token.position + dice <= HOME_POSITION;
}

export function getMovableTokens(player: Player, dice: number): Token[] {
  return player.tokens.filter((t) => canTokenMove(t, dice));
}

export function validateMove(
  state: GameState,
  tokenId: number
): MoveResult {
  if (!state.diceRolled || state.diceValue === null) {
    return { valid: false, reason: "Dice not rolled yet" };
  }

  const player = state.players[state.currentPlayerIndex];
  const token = player.tokens.find((t) => t.id === tokenId);

  if (!token) return { valid: false, reason: "Token not found" };
  if (!canTokenMove(token, state.diceValue)) {
    return { valid: false, reason: "Token cannot move with this dice value" };
  }

  return { valid: true };
}

/**
 * Computes capture: checks if an opponent token occupies the same absolute
 * main-track cell after the move. Returns the captured token info if so.
 */
export function checkCapture(
  state: GameState,
  movingColor: PlayerColor,
  newLocalStep: number
): { color: PlayerColor; tokenId: number } | undefined {
  if (newLocalStep >= HOME_COLUMN_START) return undefined;

  const newAbsolute = localStepToAbsolute(movingColor, newLocalStep);
  if (newAbsolute === -1 || isSafeCell(newAbsolute)) return undefined;

  for (const player of state.players) {
    if (player.color === movingColor) continue;
    for (const token of player.tokens) {
      if (token.state !== "active") continue;
      const oppAbsolute = localStepToAbsolute(player.color, token.position);
      if (oppAbsolute === newAbsolute) {
        return { color: player.color, tokenId: token.id };
      }
    }
  }
  return undefined;
}
