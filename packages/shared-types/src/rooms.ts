// Room vocabulary shared by server and client. The server validates every
// value; these types only describe the contract.

import type { RankingMode, TurnTimerSeconds } from "./settings.js";

/**
 * Stored room status. lobby → playing ⇄ paused → finished → archived; a room
 * that ends without a result is abandoned (then archived). See
 * ROOM_STATUS_TRANSITIONS and docs/architecture/rooms.md.
 */
export type RoomStatus = "lobby" | "playing" | "paused" | "finished" | "abandoned" | "archived";

/**
 * Every allowed status change. Anything else is rejected by the room service,
 * by both stores, and by a database trigger (migration 0002).
 */
export const ROOM_STATUS_TRANSITIONS: Readonly<Record<RoomStatus, readonly RoomStatus[]>> = {
  lobby: ["playing", "abandoned"],
  playing: ["paused", "finished", "abandoned"],
  paused: ["playing", "abandoned"],
  finished: ["archived"],
  abandoned: ["archived"],
  archived: [],
};

export function canTransitionRoom(from: RoomStatus, to: RoomStatus): boolean {
  return ROOM_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * The lifecycle phase shown to people. It is derived, never stored: "waiting"
 * and "ready" are both the stored status "lobby", split by whether enough
 * players have joined to start.
 */
export type RoomLifecycle = "waiting" | "ready" | "playing" | "paused" | "finished" | "abandoned" | "archived";
export type RoomVisibility = "private" | "public";

/**
 * Why a game is paused. "connection-lost": the player whose turn it is has
 * been away longer than the reconnect grace period (resumes automatically
 * when they return). "host": the host paused it (only the host resumes it).
 */
export type PauseReason = "connection-lost" | "host";

/** Why a room was abandoned. */
export type EndedReason = "closed-by-host" | "everyone-left" | "expired";

export interface PauseInfo {
  reason: PauseReason;
  /** For connection-lost pauses: the player the game is waiting for. */
  playerId: string | null;
  /** ISO time the pause began. */
  since: string;
}
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

/** Why a room cannot be joined right now (preview and join use the same reasons). */
export type JoinBlockReason = "room-full" | "game-already-started" | "room-closed";

export interface ColourAvailability {
  colour: string;
  colourName: string;
  seat: number;
  taken: boolean;
  /** Display name of the player holding it (null when free). */
  takenBy: string | null;
}

/**
 * Read-only view of a room for someone holding its code. Contains no ids,
 * credentials, versions or other internal data.
 */
export interface RoomPreview {
  code: string;
  name: string | null;
  status: RoomStatus;
  lifecycle: RoomLifecycle;
  maxPlayers: number;
  joinedCount: number;
  colours: ColourAvailability[];
  availableColours: string[];
  occupiedSeats: number[];
  hostName: string | null;
  joinable: boolean;
  /** Set when joinable is false. */
  blockedReason: JoinBlockReason | null;
}

/** A member of a room, as other members see them. */
export interface RoomPlayerView {
  playerId: string;
  displayName: string;
  seat: number;
  colour: string;
  colourName: string;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  joinedAt: string;
}

/** Full room state for its members. */
export interface RoomView {
  roomId: string;
  code: string;
  name: string | null;
  status: RoomStatus;
  lifecycle: RoomLifecycle;
  hostPlayerId: string;
  maxPlayers: number;
  settings: RoomSettings;
  /** Pass back as expectedRoomVersion for optimistic updates. */
  roomVersion: number;
  players: RoomPlayerView[];
  canStart: boolean;
  /** Set while the game is paused. */
  pause: PauseInfo | null;
  /** Set once the room has been abandoned. */
  endedReason: EndedReason | null;
}

/** Returned once, to the player who created or joined. The secret is never shown again. */
export interface PlayerSessionCredential {
  playerId: string;
  secret: string;
}
