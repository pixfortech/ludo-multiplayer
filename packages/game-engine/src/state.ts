import { CLASSIC_DEFAULT_SEATS } from "./board.js";
import {
  SCHEMA_VERSION,
  TOKENS_PER_PLAYER,
  type GameConfig,
  type GameSettings,
  type GameState,
  type PlayerState,
} from "./types.js";

export const DEFAULT_SETTINGS: GameSettings = { autoMove: true, rankingMode: "winner-only" };

export class GameConfigError extends Error {
  override name = "GameConfigError";
}

/** Creates a new classic game (2–4 players). Throws GameConfigError on invalid setup. */
export function createGame(config: GameConfig): GameState {
  const count = config.players.length;
  const defaults = CLASSIC_DEFAULT_SEATS[count];
  if (!defaults) throw new GameConfigError(`Classic Ludo needs 2–4 players, got ${count}`);

  const ids = config.players.map((p) => p.id);
  if (ids.some((id) => typeof id !== "string" || id.trim() === "")) throw new GameConfigError("Player ids must be non-empty strings");
  if (new Set(ids).size !== count) throw new GameConfigError("Player ids must be unique");

  const explicit = config.players.every((p) => p.seat !== undefined);
  if (!explicit && config.players.some((p) => p.seat !== undefined)) {
    throw new GameConfigError("Give a seat to every player or to none");
  }
  const seats = explicit ? config.players.map((p) => p.seat!) : [...defaults];
  if (seats.some((s) => !Number.isInteger(s) || s < 0 || s > 3) || new Set(seats).size !== count) {
    throw new GameConfigError("Seats must be distinct integers 0–3");
  }

  const players: PlayerState[] = config.players
    .map((p, i) => ({
      id: p.id,
      seat: seats[i]!,
      tokens: Array.from({ length: TOKENS_PER_PLAYER }, (_, id) => ({ id, step: null })),
      finished: false,
    }))
    .sort((a, b) => a.seat - b.seat); // clockwise turn order

  const first = config.firstPlayerIndex ?? 0;
  if (!Number.isInteger(first) || first < 0 || first >= count) throw new GameConfigError(`Invalid firstPlayerIndex ${first}`);

  return {
    schemaVersion: SCHEMA_VERSION,
    stateVersion: 0,
    ruleset: "classic",
    board: { variant: "classic-square" },
    settings: { ...DEFAULT_SETTINGS, ...config.settings },
    players,
    currentPlayerIndex: first,
    phase: "playing",
    turn: { phase: "awaiting-roll", dice: null, consecutiveSixes: 0, legalMoves: [] },
    lastRoll: null,
    lastAutoMove: null,
    ranking: [],
    winnerId: null,
    history: [],
  };
}

/**
 * Copy for a new action: everything an action can change is copied; history
 * entries are append-only and never mutated, so they are shared by reference.
 * Actions therefore never mutate their input, and cost stays linear.
 */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: { ...state.board },
    settings: { ...state.settings },
    players: state.players.map((p) => ({ ...p, tokens: p.tokens.map((t) => ({ ...t })) })),
    turn: {
      ...state.turn,
      legalMoves: state.turn.legalMoves.map((m) => ({ ...m, captures: m.captures.map((c) => ({ ...c })) })),
    },
    lastRoll: state.lastRoll && { ...state.lastRoll },
    lastAutoMove: state.lastAutoMove && { ...state.lastAutoMove },
    ranking: [...state.ranking],
    history: [...state.history],
  };
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex]!;
}

export function findPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}
