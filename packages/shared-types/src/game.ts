// Game state as sent to room members. This is the public wire contract; the
// server builds it from the engine state with an explicit allow-list (and a
// compile-time check that the engine still matches it). Positions use the
// approved indexing: step null = base, 0–50 shared track, 51–55 home lane,
// 56 home.

import type { RankingMode } from "./settings.js";

export interface TokenView {
  id: number;
  step: number | null;
}

export interface GamePlayerView {
  id: string;
  seat: number;
  tokens: TokenView[];
  finished: boolean;
}

export interface LegalMoveView {
  tokenId: number;
  from: number | null;
  to: number;
  opens: boolean;
  entersLane: boolean;
  reachesHome: boolean;
  landsOnSafeCell: boolean;
  captures: { playerId: string; tokenId: number }[];
}

export interface GameTurnView {
  phase: "awaiting-roll" | "awaiting-move";
  dice: number | null;
  consecutiveSixes: number;
  /** Computed by the server; clients offer exactly these tokens. */
  legalMoves: LegalMoveView[];
}

export type GameHistoryEntry =
  | { seq: number; type: "roll"; playerId: string; value: number }
  | { seq: number; type: "move" | "auto-move"; playerId: string; tokenId: number; from: number | null; to: number; dice: number }
  | { seq: number; type: "capture"; playerId: string; tokenId: number; cell: number; victimPlayerId: string; victimTokenId: number }
  | { seq: number; type: "home"; playerId: string; tokenId: number }
  | { seq: number; type: "bonus-roll"; playerId: string; reasons: ("six" | "capture" | "home")[] }
  | { seq: number; type: "auto-pass"; playerId: string; dice: number }
  | { seq: number; type: "forfeit"; playerId: string }
  | { seq: number; type: "turn"; playerId: string; reason: "move-complete" | "no-legal-move" | "three-sixes" | "player-finished" }
  | { seq: number; type: "player-finished"; playerId: string; place: number }
  | { seq: number; type: "win"; playerId: string }
  | { seq: number; type: "game-over"; ranking: string[] };

/** Number of most recent history entries included in every state update. */
export const RECENT_HISTORY_ENTRIES = 20;

export interface GameStateView {
  /** Monotonic: +1 per committed action. Clients discard anything older than what they hold. */
  stateVersion: number;
  phase: "playing" | "finished";
  settings: { autoMove: boolean; rankingMode: RankingMode };
  /** Clockwise turn order (ascending seat). */
  players: GamePlayerView[];
  currentPlayerIndex: number;
  /** null once the game is over. */
  currentPlayerId: string | null;
  turn: GameTurnView;
  lastRoll: { playerId: string; value: number } | null;
  lastAutoMove: { playerId: string; tokenId: number; from: number | null; to: number; dice: number } | null;
  ranking: string[];
  winnerId: string | null;
  /** The last RECENT_HISTORY_ENTRIES entries; page older ones with game:getHistory. */
  recentHistory: GameHistoryEntry[];
  /** Total entries in the authoritative history. */
  historyLength: number;
}

export type GameActionType = "game:start" | "game:roll" | "game:move";

/** One committed action and everything it caused, in order. */
export interface GameActionView {
  /** Position in the room's action log (1 = game start). */
  seq: number;
  type: GameActionType;
  /** Who acted (null for system actions). */
  playerId: string | null;
  /** The state version this action produced. */
  stateVersion: number;
  /** ISO time of the commit. */
  at: string;
  /** Server-drawn die value for a roll. */
  dice: number | null;
  /** Token chosen for a move. */
  tokenId: number | null;
  /** History entries the action produced (rolls, moves, captures, bonuses, turn changes, …). */
  entries: GameHistoryEntry[];
}
