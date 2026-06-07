import type { GameState, PlayerColor, Token } from "./gameTypes.js";
import { HOME_POSITION } from "./boardConfig.js";
import { validateMove, checkCapture, getMovableTokens } from "./moveValidator.js";
import { rollD6, isValidDie } from "./dice.js";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  players: { id: string; color: PlayerColor; name?: string }[],
  maxPlayers: number
): GameState {
  return {
    roomId,
    hostId: players[0]?.id ?? "",
    maxPlayers,
    players: players.map((p) => ({
      id: p.id,
      name: p.name ?? cap(p.color),
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
    lastAction: null,
    lastRollValue: null,
    lastRollBy: null,
  };
}

export function startGame(state: GameState): GameState {
  const first = state.players[0];
  return {
    ...state,
    phase: "playing",
    lastAction: first ? `Game started — ${cap(first.color)} goes first` : "Game started",
  };
}

export function rollDice(state: GameState, requestingPlayerId: string, forcedValue?: number): GameState {
  if (state.phase !== "playing") return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== requestingPlayerId) return state;
  if (state.diceRolled) return state;

  // `forcedValue` is a TEST-ONLY override and must be an integer 1–6. The socket
  // layer never passes it, so the runtime always uses the crypto die. An invalid
  // override is ignored and safely falls back to a real roll.
  const value =
    forcedValue !== undefined && isValidDie(forcedValue) ? forcedValue : rollD6();
  const consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;
  const who = cap(currentPlayer.color);

  // Record the roll for display/history. advanceTurn keeps these (it only clears
  // the actionable diceValue), so the client can still show what was rolled even
  // after an auto-pass instead of going blank.
  const roll = { lastRollValue: value, lastRollBy: currentPlayer.color };

  // Three consecutive sixes: forfeit the third roll and end the turn.
  if (consecutiveSixes === 3) {
    return advanceTurn({
      ...state,
      ...roll,
      diceValue: value,
      diceRolled: true,
      consecutiveSixes: 0,
      lastAction: `${who} rolled three 6s in a row — turn forfeited`,
    });
  }

  const movable = getMovableTokens(currentPlayer, value);

  // No movable tokens for this roll → pass the turn automatically.
  if (movable.length === 0) {
    return advanceTurn({
      ...state,
      ...roll,
      diceValue: value,
      diceRolled: true,
      consecutiveSixes,
      lastAction: `${who} rolled ${value} but has no legal moves — turn passes`,
    });
  }

  const lastAction =
    value === 6 ? `${who} rolled a 6 — bonus turn` : `${who} rolled ${value}`;

  return { ...state, ...roll, diceValue: value, diceRolled: true, consecutiveSixes, lastAction };
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
  const who = cap(player.color);

  let leftBase = false;
  // Leave base
  if (token.state === "base") {
    token.state = "active";
    token.position = 0;
    leftBase = true;
  } else {
    token.position += dice;
  }

  // Reached home (exact entry is enforced by validateMove/canTokenMove)
  let reachedHome = false;
  if (token.position >= HOME_POSITION) {
    token.position = HOME_POSITION;
    token.state = "home";
    reachedHome = true;
  }

  // Capture only applies to tokens still on the shared track.
  let capturedColor: PlayerColor | null = null;
  if (token.state === "active") {
    const captured = checkCapture({ ...state, players }, player.color, token.position);
    if (captured) {
      const opp = players.find((p) => p.color === captured.color)!;
      const capturedToken = opp.tokens.find((t) => t.id === captured.tokenId)!;
      capturedToken.state = "base";
      capturedToken.position = -1;
      capturedColor = captured.color;
    }
  }

  // Extra turn is granted for rolling a 6 OR capturing an opponent token.
  const keepTurn = dice === 6 || capturedColor !== null;

  let lastAction: string;
  if (capturedColor) lastAction = `${who} captured ${cap(capturedColor)}! Roll again`;
  else if (reachedHome) lastAction = `${who} sent a token home`;
  else if (leftBase) lastAction = `${who} brought a token out of base`;
  else lastAction = `${who} moved a token ${dice}`;

  const nextState: GameState = { ...state, players, diceRolled: true, lastAction };

  // Win: all four tokens home.
  if (player.tokens.every((t) => t.state === "home")) {
    return { ...nextState, phase: "finished", winner: player.color, lastAction: `${who} wins the game!` };
  }

  // Extra turn (6 rolled or capture made) — same player rolls again.
  if (keepTurn) {
    return { ...nextState, diceRolled: false, diceValue: null };
  }

  // No bonus — advance turn and announce the next player clearly.
  const advanced = advanceTurn(nextState);
  const next = advanced.players[advanced.currentPlayerIndex];
  return { ...advanced, lastAction: next ? `${lastAction} · ${cap(next.color)}'s turn` : lastAction };
}

/**
 * Marks a player connected/disconnected without removing them, so a refresh or
 * brief drop can be resumed. Used by the socket layer on disconnect/resume.
 */
export function setConnected(state: GameState, playerId: string, connected: boolean): GameState {
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  return { ...state, players };
}

/**
 * Removes a player (on explicit leave) and keeps the game state valid:
 * - currentPlayerIndex is adjusted so it always points at a real player;
 * - if the current player leaves, the turn moves cleanly to the next player;
 * - the host is reassigned if the host left;
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

  const hostId = state.hostId === playerId ? players[0].id : state.hostId;

  let next: GameState = { ...state, players, currentPlayerIndex, hostId };

  if (turnReset) {
    next = { ...next, diceValue: null, diceRolled: false, consecutiveSixes: 0 };
  }

  // Not enough players to continue an in-progress game: end safely.
  if (players.length < 2 && state.phase === "playing") {
    next = { ...next, phase: "finished", winner: players[0].color, lastAction: `${cap(players[0].color)} wins (opponents left)` };
  }

  return next;
}

function advanceTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  // Note: lastRollValue / lastRollBy are intentionally NOT reset here — they are
  // display/history only, so the just-rolled number stays visible after the turn
  // advances (e.g. an auto-pass on no legal moves). Only the actionable diceValue
  // is cleared.
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
