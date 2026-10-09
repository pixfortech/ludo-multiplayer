// Engine state, actions, results and history. All plain JSON (serialisable,
// clonable, safe to send to clients). Positions follow the approved indexing
// model: a token is in base (`step: null`) or at step 0–56, where step 0 is
// its start cell, 0–50 the shared track, 51–55 its home lane and 56 home.

export const SCHEMA_VERSION = 1;
export const TOKENS_PER_PLAYER = 4;

export type BoardVariant = "classic-square";
export type RankingMode = "winner-only" | "full-ranking";

export interface GameSettings {
  /** Apply the move automatically when exactly one token can move. */
  autoMove: boolean;
  /** End at the first winner, or keep playing until every place is decided. */
  rankingMode: RankingMode;
}

export interface TokenState {
  id: number; // 0–3
  /** null = in base; 0–56 = steps from the player's start cell; 56 = home. */
  step: number | null;
}

export interface PlayerState {
  id: string;
  /** Board seat 0–3: 0 top-left (Crimson), 1 top-right, 2 bottom-right, 3 bottom-left. */
  seat: number;
  tokens: TokenState[];
  /** All four tokens are home. */
  finished: boolean;
}

export type TurnPhase = "awaiting-roll" | "awaiting-move";
export type GamePhase = "playing" | "finished";

export interface CapturedToken {
  playerId: string;
  tokenId: number;
}

/** A legal move for the current dice value, with its consequences precomputed. */
export interface LegalMove {
  tokenId: number;
  from: number | null;
  to: number;
  opens: boolean;
  entersLane: boolean;
  reachesHome: boolean;
  landsOnSafeCell: boolean;
  captures: CapturedToken[];
}

export interface TurnState {
  phase: TurnPhase;
  /** The dice value in play this turn (null while awaiting a roll). */
  dice: number | null;
  /** Sixes rolled in a row during this player's uninterrupted turn. */
  consecutiveSixes: number;
  /** Server-computed legal moves while awaiting a move. */
  legalMoves: LegalMove[];
}

export interface LastRoll {
  playerId: string;
  value: number;
}

export interface AutoMoveInfo {
  playerId: string;
  tokenId: number;
  from: number | null;
  to: number;
  dice: number;
}

export type BonusReason = "six" | "capture" | "home";
export type PassReason = "move-complete" | "no-legal-move" | "three-sixes" | "player-finished";

export type HistoryEntry =
  | { seq: number; type: "roll"; playerId: string; value: number }
  | { seq: number; type: "move" | "auto-move"; playerId: string; tokenId: number; from: number | null; to: number; dice: number }
  | { seq: number; type: "capture"; playerId: string; tokenId: number; cell: number; victimPlayerId: string; victimTokenId: number }
  | { seq: number; type: "home"; playerId: string; tokenId: number }
  | { seq: number; type: "bonus-roll"; playerId: string; reasons: BonusReason[] }
  | { seq: number; type: "auto-pass"; playerId: string; dice: number }
  | { seq: number; type: "forfeit"; playerId: string }
  | { seq: number; type: "turn"; playerId: string; reason: PassReason }
  | { seq: number; type: "player-finished"; playerId: string; place: number }
  | { seq: number; type: "win"; playerId: string }
  | { seq: number; type: "game-over"; ranking: string[] };

/** Distributes Omit over the history union so each variant keeps its own fields. */
export type NewHistoryEntry = HistoryEntry extends infer E ? (E extends HistoryEntry ? Omit<E, "seq"> : never) : never;

export interface GameState {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Incremented by every accepted action; clients drop states older than the one they hold. */
  stateVersion: number;
  ruleset: "classic";
  board: { variant: BoardVariant };
  settings: GameSettings;
  /** In clockwise turn order (ascending seat). */
  players: PlayerState[];
  currentPlayerIndex: number;
  phase: GamePhase;
  turn: TurnState;
  lastRoll: LastRoll | null;
  /** Set when the most recent action auto-moved a token; cleared by the next action. */
  lastAutoMove: AutoMoveInfo | null;
  /** Player ids in finishing order. */
  ranking: string[];
  winnerId: string | null;
  history: HistoryEntry[];
}

export type EngineErrorCode =
  | "game-finished"
  | "unknown-player"
  | "not-your-turn"
  | "not-awaiting-roll"
  | "not-awaiting-move"
  | "invalid-dice"
  | "unknown-token"
  | "illegal-move";

export type ActionResult =
  | { ok: true; state: GameState; events: HistoryEntry[] }
  | { ok: false; error: EngineErrorCode; message: string; state: GameState };

export interface PlayerConfig {
  id: string;
  /** Optional explicit seat 0–3; defaults depend on player count. */
  seat?: number;
}

export interface GameConfig {
  players: PlayerConfig[];
  settings?: Partial<GameSettings>;
  /** Index into the seat-ordered players; the server draws it with secure randomness. */
  firstPlayerIndex?: number;
}
