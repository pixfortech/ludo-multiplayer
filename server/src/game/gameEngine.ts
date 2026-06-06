import type { GameState, Player, PlayerColor, Token } from "./gameTypes.js";
import { HOME_POSITION } from "./boardConfig.js";
import { validateMove, checkCapture, getMovableTokens } from "./moveValidator.js";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

function makeTokens(color: PlayerColor): Token[] {
  return [0, 1, 2, 3].map((id) => ({
    id,
    color,
    state: "base",
    position: -1,
  }));
}

export function createInitialState(roomId: string, players: { id: string; color: PlayerColor }[]): GameState {
  return {
    roomId,
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
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== requestingPlayerId) return state;
  if (state.phase !== "playing") return state;
  if (state.diceRolled) return state;

  const value = Math.floor(Math.random() * 6) + 1;
  const consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;

  // Three consecutive sixes: forfeit turn
  if (consecutiveSixes === 3) {
    return advanceTurn({ ...state, diceValue: value, diceRolled: true, consecutiveSixes: 0 });
  }

  const newState: GameState = { ...state, diceValue: value, diceRolled: true, consecutiveSixes };

  // Auto-advance if no movable tokens
  const movable = getMovableTokens(currentPlayer, value);
  if (movable.length === 0) {
    return advanceTurn(newState);
  }

  return newState;
}

export function moveToken(state: GameState, requestingPlayerId: string, tokenId: number): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== requestingPlayerId) return state;

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

  // Reached home
  if (token.position >= HOME_POSITION) {
    token.position = HOME_POSITION;
    token.state = "home";
  }

  // Check capture (only for active tokens not yet home)
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

  // Check win
  if (player.tokens.every((t) => t.state === "home")) {
    return { ...nextState, phase: "finished", winner: player.color };
  }

  // Extra turn on 6 (unless three sixes already handled upstream)
  if (dice === 6) {
    return { ...nextState, diceRolled: false, diceValue: null };
  }

  return advanceTurn(nextState);
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
