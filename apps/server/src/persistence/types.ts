// Persistence contract: records, typed errors and the GameStore interface.
// Implementations: PostgresGameStore (production) and MemoryGameStore (fast
// unit tests of higher layers). Both pass the same contract test suite.

import type { GameState } from "@ludo/game-engine";
import type { ConnectionStatus, EndedReason, ParticipantKind, PauseReason, RoomSettings, RoomStatus, RoomVisibility } from "@ludo/shared-types";

export interface RoomRecord {
  id: string;
  code: string;
  name: string | null;
  hostPlayerId: string;
  maxPlayers: number;
  visibility: RoomVisibility;
  settings: RoomSettings;
  status: RoomStatus;
  /** Incremented on every membership/settings/status change; used for optimistic concurrency. */
  roomVersion: number;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  expiresAt: Date | null;
  archivedAt: Date | null;
  /** Set exactly while status = "paused". */
  pauseReason: PauseReason | null;
  /** The player the game is waiting for (connection-lost pauses). */
  pausedPlayerId: string | null;
  pausedAt: Date | null;
  /** Why the room was abandoned, if it was. */
  endedReason: EndedReason | null;
}

export interface PlayerRecord {
  id: string;
  roomId: string;
  displayName: string;
  seat: number;
  colour: string;
  kind: ParticipantKind;
  connectionStatus: ConnectionStatus;
  credentialVersion: number;
  credentialIssuedAt: Date;
  credentialRevokedAt: Date | null;
  joinedAt: Date;
  lastSeenAt: Date;
  leftAt: Date | null;
  finishPlace: number | null;
  /** Incremented each time a connection takes control of this seat. */
  sessionEpoch: number;
}

/** Credential material is only ever handled as a SHA-256 digest (32 bytes). */
export interface PlayerCredential {
  playerId: string;
  hash: Buffer;
  version: number;
  revokedAt: Date | null;
  /** A rotated secret waiting to be confirmed (digest), if any. */
  pendingHash: Buffer | null;
}

export interface NewPlayer {
  id: string;
  displayName: string;
  seat: number;
  colour: string;
  kind?: ParticipantKind;
  credentialHash: Buffer;
}

export interface NewRoom {
  id: string;
  name: string | null;
  maxPlayers: number;
  visibility: RoomVisibility;
  settings: RoomSettings;
  expiresAt?: Date | null;
}

export interface GameSessionRecord {
  roomId: string;
  /** Validated against the engine schema on every load. */
  state: GameState;
  stateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewGameEvent {
  /** null for system actions (e.g. an automatic pause). */
  playerId: string | null;
  actionType: string;
  /** Client action id for idempotency (≤ 64 chars). */
  requestId: string | null;
  payload: unknown;
}

export interface GameEventRecord extends NewGameEvent {
  id: string;
  roomId: string;
  seq: number;
  resultStateVersion: number;
  createdAt: Date;
}

/**
 * Room fields a caller may change. Status changes must follow
 * ROOM_STATUS_TRANSITIONS (else invalid-transition); archiving sets archivedAt
 * automatically; pausing requires pauseReason (pausedAt is set automatically)
 * and leaving "paused" clears the pause fields; maxPlayers must not drop below
 * the active member count (else capacity-conflict) and must match
 * settings.maxPlayers.
 */
export type RoomPatch = Partial<
  Pick<RoomRecord, "name" | "status" | "settings" | "hostPlayerId" | "maxPlayers" | "expiresAt" | "archivedAt" | "pauseReason" | "pausedPlayerId" | "endedReason">
>;

/** Inactivity cut-offs for the retention sweep. */
export interface RetentionCutoffs {
  /** The sweep's clock. Expiring a room counts as activity at this time, so its archive period starts then. */
  now: Date;
  /** Lobby rooms inactive since before this become abandoned ("expired"). */
  lobbyBefore: Date;
  /** Playing or paused games inactive since before this become abandoned ("expired"). */
  activeBefore: Date;
  /** Finished or abandoned rooms inactive since before this are archived. */
  endedBefore: Date;
}

export type StoreErrorCode =
  | "not-found"
  | "version-conflict"
  | "duplicate-request"
  | "seat-taken"
  | "colour-taken"
  | "name-taken"
  | "room-full"
  | "room-code-exhausted"
  | "game-already-started"
  | "invalid-transition"
  | "capacity-conflict"
  /** A game action reached a room that is no longer playing (paused, finished, closed). */
  | "room-not-playing"
  | "invalid-state";

export class StoreError extends Error {
  override name = "StoreError";
  constructor(
    readonly code: StoreErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CommitGameActionInput {
  roomId: string;
  /** The state version the action was computed from; the commit fails if storage has moved on. */
  expectedStateVersion: number;
  state: GameState;
  event: NewGameEvent;
  /** Optional room status change in the same transaction (e.g. "finished"). */
  roomStatus?: RoomStatus;
}

export interface GameStore {
  /** Creates the room and its host atomically; retries room codes on collision. */
  createRoom(room: NewRoom, host: NewPlayer, generateCode: () => string): Promise<{ room: RoomRecord; host: PlayerRecord }>;
  getRoom(roomId: string): Promise<RoomRecord | null>;
  getRoomByCode(code: string): Promise<RoomRecord | null>;
  /** Updates room fields if `expectedRoomVersion` still matches; bumps the version. */
  updateRoom(roomId: string, expectedRoomVersion: number, patch: RoomPatch): Promise<RoomRecord>;

  /**
   * Adds a player if the room version matches, the room is in the lobby and has
   * a free place, and the seat, colour and name are free; bumps the room version.
   */
  addPlayer(roomId: string, expectedRoomVersion: number, player: NewPlayer): Promise<{ room: RoomRecord; player: PlayerRecord }>;
  getPlayer(playerId: string): Promise<PlayerRecord | null>;
  listPlayers(roomId: string, options?: { includeLeft?: boolean }): Promise<PlayerRecord[]>;
  /** Presence updates do not bump the room version (they are frequent and not structural). */
  setConnectionStatus(playerId: string, status: Exclude<ConnectionStatus, "left">, at?: Date): Promise<void>;
  /**
   * Marks the player as having left (freeing their seat, colour and name, and
   * revoking their credential) and
   * applies `patch` (e.g. a new host, or abandoning an empty room) in the same
   * transaction; bumps the room version once.
   */
  markPlayerLeft(roomId: string, expectedRoomVersion: number, playerId: string, patch?: RoomPatch): Promise<RoomRecord>;
  setFinishPlace(playerId: string, place: number | null): Promise<void>;

  getCredential(playerId: string): Promise<PlayerCredential | null>;
  /**
   * Stores a pending (rotated) credential digest if the credential is still at
   * `expectedVersion` and not revoked. Returns false if it has moved on.
   */
  setPendingCredential(playerId: string, expectedVersion: number, pendingHash: Buffer): Promise<boolean>;
  /**
   * Promotes the pending digest to current if it still equals `pendingHash`
   * (atomic compare-and-swap); returns the new credential version, or null.
   */
  promotePendingCredential(playerId: string, pendingHash: Buffer): Promise<number | null>;
  /** Gives the seat to a new controlling connection; returns the new epoch (null if not an active member). */
  bumpSessionEpoch(playerId: string): Promise<number | null>;
  /** Marks every connected player disconnected (single-instance startup after a restart); returns the count. */
  resetPresence(): Promise<number>;
  /** Ids of rooms in a status (e.g. games to watch after a restart), oldest activity first. */
  listRoomIdsByStatus(status: RoomStatus, limit: number): Promise<string[]>;
  /**
   * Abandons ("expired") live rooms and archives ended rooms that have been
   * inactive since before the cut-offs. Rooms locked by an in-flight
   * operation are skipped and re-checked next time. Never deletes anything.
   */
  expireInactiveRooms(cutoffs: RetentionCutoffs, limit: number): Promise<{ expired: string[]; archived: string[] }>;
  /** Replaces the credential digest (rotation); returns the new version. */
  rotateCredential(playerId: string, newHash: Buffer): Promise<number>;
  revokeCredential(playerId: string): Promise<void>;

  /** Creates the game session and its first event and sets the room to "playing", atomically. */
  startGame(roomId: string, expectedRoomVersion: number, initialState: GameState, event: NewGameEvent): Promise<{ room: RoomRecord; session: GameSessionRecord; event: GameEventRecord }>;
  getGameSession(roomId: string): Promise<GameSessionRecord | null>;
  /**
   * Durably commits a new authoritative state and its event in one transaction.
   * Rejects with room-not-playing unless the room is playing (checked under the room lock),
   * with version-conflict if storage is no longer at `expectedStateVersion`,
   * and with duplicate-request if the (player, requestId) was already committed.
   */
  commitGameAction(input: CommitGameActionInput): Promise<{ session: GameSessionRecord; event: GameEventRecord }>;
  findEventByRequest(roomId: string, playerId: string, requestId: string): Promise<GameEventRecord | null>;
  /** Events in sequence order after `afterSeq`, at most `limit` (1–500). */
  listEvents(roomId: string, options?: { afterSeq?: number; limit?: number }): Promise<GameEventRecord[]>;

  close(): Promise<void>;
}
