// Validation for persisted game state. The server stores the engine's state
// as a JSON snapshot; before a saved game resumes, the snapshot must pass this
// check so a corrupted or tampered row can never become a live game.
// Structural checks plus the engine's own invariants. No rules are changed here.

import { isSafeIndex, tokenTrackIndex, topologyOf } from "./board.js";
import { SCHEMA_VERSION, TOKENS_PER_PLAYER, type GameState } from "./types.js";

export class GameStateValidationError extends Error {
  override name = "GameStateValidationError";
  constructor(readonly issues: string[]) {
    super(`Invalid game state: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ""}`);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Serialises a state for storage (plain JSON). */
export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Parses and validates a stored snapshot (string or already-parsed JSON).
 * Throws GameStateValidationError listing every problem found.
 */
export function deserializeGameState(raw: unknown): GameState {
  const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  const issues: string[] = [];
  const fail = (m: string) => issues.push(m);

  if (!isRecord(value)) throw new GameStateValidationError(["state must be an object"]);
  const s = value;
  if (s.schemaVersion !== SCHEMA_VERSION) fail(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!isInt(s.stateVersion, 0, Number.MAX_SAFE_INTEGER)) fail("stateVersion must be a non-negative integer");
  if (s.ruleset !== "classic") fail("ruleset must be classic");
  if (!isRecord(s.board) || s.board.variant !== "classic-square") fail("board.variant must be classic-square");
  if (!isRecord(s.settings) || typeof s.settings.autoMove !== "boolean" || !["winner-only", "full-ranking"].includes(s.settings.rankingMode as string)) {
    fail("settings are invalid");
  }
  if (!["playing", "finished"].includes(s.phase as string)) fail("phase is invalid");

  const players = Array.isArray(s.players) ? s.players : [];
  if (!Array.isArray(s.players) || players.length < 2 || players.length > 4) fail("players must be an array of 2–4");
  const ids = new Set<string>();
  const seats = new Set<number>();
  players.forEach((p: unknown, i) => {
    if (!isRecord(p)) return fail(`players[${i}] must be an object`);
    if (typeof p.id !== "string" || p.id === "") fail(`players[${i}].id is invalid`);
    else ids.add(p.id);
    if (!isInt(p.seat, 0, 3)) fail(`players[${i}].seat must be 0–3`);
    else seats.add(p.seat);
    if (typeof p.finished !== "boolean") fail(`players[${i}].finished must be boolean`);
    if (!Array.isArray(p.tokens) || p.tokens.length !== TOKENS_PER_PLAYER) return fail(`players[${i}].tokens must have ${TOKENS_PER_PLAYER} entries`);
    p.tokens.forEach((t: unknown, j) => {
      if (!isRecord(t) || t.id !== j || !(t.step === null || isInt(t.step, 0, 56))) fail(`players[${i}].tokens[${j}] is invalid`);
    });
  });
  if (ids.size !== players.length) fail("player ids must be unique");
  if (seats.size !== players.length) fail("player seats must be unique");
  if (players.some((p, i) => i > 0 && isRecord(p) && isRecord(players[i - 1]) && (p.seat as number) <= (players[i - 1]!.seat as number))) {
    fail("players must be in clockwise seat order");
  }
  if (!isInt(s.currentPlayerIndex, 0, Math.max(0, players.length - 1))) fail("currentPlayerIndex is out of range");

  const turn = s.turn;
  if (!isRecord(turn)) fail("turn must be an object");
  else {
    if (!["awaiting-roll", "awaiting-move"].includes(turn.phase as string)) fail("turn.phase is invalid");
    if (!(turn.dice === null || isInt(turn.dice, 1, 6))) fail("turn.dice must be null or 1–6");
    if (!isInt(turn.consecutiveSixes, 0, 2)) fail("turn.consecutiveSixes must be 0–2");
    if (!Array.isArray(turn.legalMoves)) fail("turn.legalMoves must be an array");
    if (turn.phase === "awaiting-move" && (turn.dice === null || !Array.isArray(turn.legalMoves) || turn.legalMoves.length === 0)) {
      fail("awaiting-move needs dice and legal moves");
    }
  }
  if (!(s.lastRoll === null || (isRecord(s.lastRoll) && typeof s.lastRoll.playerId === "string" && isInt(s.lastRoll.value, 1, 6)))) fail("lastRoll is invalid");
  if (!(s.lastAutoMove === null || isRecord(s.lastAutoMove))) fail("lastAutoMove is invalid");
  if (!Array.isArray(s.ranking) || s.ranking.some((id) => typeof id !== "string" || !ids.has(id))) fail("ranking must list known player ids");
  if (!(s.winnerId === null || (typeof s.winnerId === "string" && ids.has(s.winnerId)))) fail("winnerId must be null or a known player");
  if (!Array.isArray(s.history) || s.history.some((e, i) => !isRecord(e) || e.seq !== i + 1 || typeof e.type !== "string")) {
    fail("history must be contiguous entries");
  }

  if (issues.length > 0) throw new GameStateValidationError(issues);
  const state = value as unknown as GameState;

  // Engine invariants on a structurally valid state.
  const topology = topologyOf(state);
  const occupants = new Map<number, Set<string>>();
  for (const player of state.players) {
    const allHome = player.tokens.every((t) => t.step === topology.finishStep);
    if (player.finished !== allHome) fail(`player ${player.id}: finished flag disagrees with tokens`);
    for (const token of player.tokens) {
      const cell = tokenTrackIndex(topology, player, token.step);
      if (cell !== null && !isSafeIndex(topology, cell)) occupants.set(cell, (occupants.get(cell) ?? new Set()).add(player.id));
    }
  }
  for (const [cell, owners] of occupants) if (owners.size > 1) fail(`two colours share non-safe cell ${cell}`);
  if (state.phase === "playing" && state.players[state.currentPlayerIndex]!.finished) fail("current player has already finished");

  if (issues.length > 0) throw new GameStateValidationError(issues);
  return state;
}
