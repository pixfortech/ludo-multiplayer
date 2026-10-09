// Persistence contract: records, typed errors and the GameStore interface.
// Implementations: PostgresGameStore (production) and MemoryGameStore (fast
// unit tests of higher layers). Both pass the same contract test suite.

import type { GameState } from "@ludo/game-engine";
import type { ConnectionStatus, ParticipantKind, RoomSettings, RoomStatus, RoomVisibility } from "@ludo/shared-types";

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
}

/** Credential material is only ever handled as a SHA-256 digest (32 bytes). */
export interface PlayerCredential {
  playerId: string;
  hash: Buffer;
  version: number;
  revokedAt: Date | null;
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

export type RoomPatch = Partial<Pick<RoomRecord, "name" | "status" | "settings" | "hostPlayerId" | "expiresAt" | "archivedAt">>;

export type StoreErrorCode =
  | "not-found"
  | "version-conflict"
  | "duplicate-request"
  | "seat-taken"
  | "colour-taken"
  | "room-full"
  | "room-code-exhausted"
  | "game-already-started"
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

  /** Adds a player if the room version matches and a seat is free; bumps the room version. */
  addPlayer(roomId: string, expectedRoomVersion: number, player: NewPlayer): Promise<{ room: RoomRecord; player: PlayerRecord }>;
  getPlayer(playerId: string): Promise<PlayerRecord | null>;
  listPlayers(roomId: string, options?: { includeLeft?: boolean }): Promise<PlayerRecord[]>;
  /** Presence updates do not bump the room version (they are frequent and not structural). */
  setConnectionStatus(playerId: string, status: Exclude<ConnectionStatus, "left">, at?: Date): Promise<void>;
  /** Marks the player as having left; frees their seat and colour; bumps the room version. */
  markPlayerLeft(roomId: string, expectedRoomVersion: number, playerId: string): Promise<RoomRecord>;
  setFinishPlace(playerId: string, place: number | null): Promise<void>;

  getCredential(playerId: string): Promise<PlayerCredential | null>;
  /** Replaces the credential digest (rotation); returns the new version. */
  rotateCredential(playerId: string, newHash: Buffer): Promise<number>;
  revokeCredential(playerId: string): Promise<void>;

  /** Creates the game session and its first event and sets the room to "playing", atomically. */
  startGame(roomId: string, expectedRoomVersion: number, initialState: GameState, event: NewGameEvent): Promise<{ room: RoomRecord; session: GameSessionRecord; event: GameEventRecord }>;
  getGameSession(roomId: string): Promise<GameSessionRecord | null>;
  /**
   * Durably commits a new authoritative state and its event in one transaction.
   * Rejects with version-conflict if storage is no longer at `expectedStateVersion`,
   * and with duplicate-request if the (player, requestId) was already committed.
   */
  commitGameAction(input: CommitGameActionInput): Promise<{ session: GameSessionRecord; event: GameEventRecord }>;
  findEventByRequest(roomId: string, playerId: string, requestId: string): Promise<GameEventRecord | null>;
  /** Events in sequence order after `afterSeq`, at most `limit` (1–500). */
  listEvents(roomId: string, options?: { afterSeq?: number; limit?: number }): Promise<GameEventRecord[]>;

  close(): Promise<void>;
}
