// Room vocabulary shared by server and client. The server validates every
// value; these types only describe the contract.

import type { RankingMode, TurnTimerSeconds } from "./settings.js";

/** lobby → playing ⇄ paused → finished; abandoned/archived are terminal housekeeping states. */
export type RoomStatus = "lobby" | "playing" | "paused" | "finished" | "abandoned" | "archived";
export type RoomVisibility = "private" | "public";
export type ConnectionStatus = "connected" | "disconnected" | "left";
/** "remote" = own device; "local" is reserved for future same-screen (pass-and-play) seats. */
export type ParticipantKind = "remote" | "local";

/**
 * Explicit rule choices. Defaults reproduce the tested Phase 1 behaviour; they
 * are configuration, not universal Ludo law (conventions vary).
 */
export interface RoomRuleOptions {
  /** A 6 with no legal move still grants another roll. Default true. */
  sixWithoutMoveGrantsRoll: boolean;
  /** Landing on a non-safe cell captures every opponent token there. Default true. */
  captureStackedOpponents: boolean;
  /** Two own tokens form a blocking barrier. Default false (not implemented in the engine). */
  blocksEnabled: boolean;
}

export const DEFAULT_RULE_OPTIONS: RoomRuleOptions = {
  sixWithoutMoveGrantsRoll: true,
  captureStackedOpponents: true,
  blocksEnabled: false,
};

export interface RoomSettings {
  /** 2–15 in the data model; only 2–4 are playable until the expanded engine exists. */
  maxPlayers: number;
  autoMove: boolean;
  rankingMode: RankingMode;
  visibility: RoomVisibility;
  /** Reserved; timers are not enforced yet. */
  turnTimerSeconds: TurnTimerSeconds;
  rules: RoomRuleOptions;
}
