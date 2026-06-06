import type { GameState, PlayerColor, Token } from "./gameTypes.js";
import { HOME_POSITION } from "./boardConfig.js";
import { validateMove, checkCapture, getMovableTokens } from "./moveValidator.js";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

function makeTokens(color: PlayerColor): Token[] {
  return [0, 1, 2, 3].map((id) => ({
    id,
    color,
    state: "base" as const,
    position: -1,
  }));
}

export function createInitialState(
  roomId: string,
  players: { id: string; color: PlayerColor }[],
  maxPlayers: number
): GameState {
  return {
    roomId,
    maxPlayers,
    players: players.map((p) => ({
      id: p.id,
      color: p.color,
      tokens: makeTokens(p.color),
      connected: true,
    })),
    currentPlayerIndex: 0,
    phase: "waiting",
    diceValue: null,
    diceRolled: false,
    consecutiveSixes: 0,
    winner: null,
    turnCount: 0,
  };
}

export function startGame(state: GameState): GameState {
  return { ...state, phase: "playing" };
}

export function rollDice(state: GameState, requestingPlayerId: string): GameState {
  if (state.phase !== "playing") return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== requestingPlayerId) return state;
  if (state.diceRolled) return state;

  const value = Math.floor(Math.random() * 6) + 1;
  const consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;

  // Three consecutive sixes: forfeit the third roll and end the turn.
  if (consecutiveSixes === 3) {
    return advanceTurn({ ...state, diceValue: value, diceRolled: true, consecutiveSixes: 0 });
  }

  const newState: GameState = { ...state, diceValue: value, diceRolled: true, consecutiveSixes };

  // No movable tokens for this roll → pass the turn automatically.
  const movable = getMovableTokens(currentPlayer, value);
  if (movable.length === 0) {
    return advanceTurn(newState);
  }

  return newState;
}

export function moveToken(state: GameState, requestingPlayerId: string, tokenId: number): GameState {
  if (state.phase !== "playing") return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== requestingPlayerId) return state;

  const result = validateMove(state, tokenId);
  if (!result.valid) return state;

  const dice = state.diceValue!;
  const players = state.players.map((p) => ({ ...p, tokens: p.tokens.map((t) => ({ ...t })) }));
  const player = players[state.currentPlayerIndex];
  const token = player.tokens.find((t) => t.id === tokenId)!;

  // Leave base
  if (token.state === "base") {
    token.state = "active";
    token.position = 0;
  } else {
    token.position += dice;
  }

  // Reached home (exact entry is enforced by validateMove/canTokenMove)
  if (token.position >= HOME_POSITION) {
    token.position = HOME_POSITION;
    token.state = "home";
  }

  // Capture only applies to tokens still on the shared track.
  if (token.state === "active") {
    const captured = checkCapture({ ...state, players }, player.color, token.position);
    if (captured) {
      const opp = players.find((p) => p.color === captured.color)!;
      const capturedToken = opp.tokens.find((t) => t.id === captured.tokenId)!;
      capturedToken.state = "base";
      capturedToken.position = -1;
    }
  }

  const nextState: GameState = { ...state, players, diceRolled: true };

  // Win: all four tokens home.
  if (player.tokens.every((t) => t.state === "home")) {
    return { ...nextState, phase: "finished", winner: player.color };
  }

  // Rolling a 6 grants another turn.
  if (dice === 6) {
    return { ...nextState, diceRolled: false, diceValue: null };
  }

  return advanceTurn(nextState);
}

/**
 * Removes a player (on disconnect/leave) and keeps the game state valid:
 * - currentPlayerIndex is adjusted so it always points at a real player;
 * - if the current player leaves, the turn moves cleanly to the next player;
 * - if fewer than two players remain mid-game, the game ends safely (walkover)
 *   so rollDice/moveToken can never operate on a broken state.
 */
export function removePlayer(state: GameState, playerId: string): GameState {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return state;

  const players = state.players.filter((p) => p.id !== playerId);

  // Empty room — caller deletes it; return a safe, in-bounds index.
  if (players.length === 0) {
    return { ...state, players, currentPlayerIndex: 0 };
  }

  let currentPlayerIndex = state.currentPlayerIndex;
  let turnReset = false;

  if (idx < state.currentPlayerIndex) {
    // A player before the current one left: shift left to keep pointing at the same player.
    currentPlayerIndex = state.currentPlayerIndex - 1;
  } else if (idx === state.currentPlayerIndex) {
    // The current player left: the next player now sits at this index (wrap if needed).
    currentPlayerIndex = state.currentPlayerIndex % players.length;
    turnReset = true;
  }
  // idx > current: earlier indices are unchanged, so no adjustment is needed.

  // Defensive clamp — the index can never point outside the array.
  currentPlayerIndex = Math.max(0, Math.min(currentPlayerIndex, players.length - 1));

  let next: GameState = { ...state, players, currentPlayerIndex };

  if (turnReset) {
    next = { ...next, diceValue: null, diceRolled: false, consecutiveSixes: 0 };
  }

  // Not enough players to continue an in-progress game: end safely.
  if (players.length < 2 && state.phase === "playing") {
    next = { ...next, phase: "finished", winner: players[0].color };
  }

  return next;
}

function advanceTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    diceValue: null,
    diceRolled: false,
    consecutiveSixes: 0,
    turnCount: state.turnCount + 1,
  };
}

export function assignColors(count: number): PlayerColor[] {
  return COLORS.slice(0, count);
}
