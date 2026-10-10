// Socket protocol contract. Bump PROTOCOL_VERSION on any breaking change to
// event names or payloads so stale clients can be told to refresh.
//
// Every client → server event carries a client-chosen `requestId` and an
// acknowledgement callback. The server never trusts identity from payloads:
// who is acting comes from the connection's verified credential.

import type { ErrorDetails, ProtocolErrorCode } from "./errors.js";
import type { GameActionView, GameStateView } from "./game.js";
import type { PauseInfo, PlayerSessionCredential, RoomPlayerView, RoomPreview, RoomRuleOptions, RoomView, RoomVisibility } from "./rooms.js";
import type { CityThemeId, RankingMode, TurnTimerSeconds } from "./settings.js";

export const PROTOCOL_VERSION = 3;

/** Largest accepted event payload (serialised JSON), in bytes. */
export const MAX_PAYLOAD_BYTES = 4096;

/** Sent by the server to every socket immediately after it connects. */
export interface ServerHello {
  protocolVersion: number;
  serverTime: number;
}

/**
 * Credential presented when opening a connection
 * (`io(url, { auth: { credential } })`). It is checked before the connection
 * is accepted; a wrong one is refused with connect_error "unauthenticated".
 * Never put it in the URL or query string.
 */
export interface SocketAuth {
  credential?: PlayerSessionCredential;
  /** Take control from another connection that currently controls this seat. */
  takeover?: boolean;
}

// ── Requests ───────────────────────────────────────────────────────────────

export interface RequestBase {
  /** 1–64 characters [A-Za-z0-9_-], unique per player and action; reused for retries. */
  requestId: string;
}

export interface CreateRoomRequest extends RequestBase {
  hostName: string;
  maxPlayers: number;
  roomName?: string | null;
  /** A colour id, or "auto". */
  colour?: string;
  autoMove?: boolean;
  rankingMode?: RankingMode;
  rules?: Partial<RoomRuleOptions>;
  turnTimerSeconds?: TurnTimerSeconds;
  visibility?: RoomVisibility;
  /** The city theme (presentation only); omitted = classic. */
  cityTheme?: CityThemeId;
}

export interface PreviewRoomRequest extends RequestBase {
  code: string;
}

export interface JoinRoomRequest extends RequestBase {
  code: string;
  displayName: string;
  colour?: string;
  /** Lets the server recognise a player who is already a member (they get already-member). */
  credential?: PlayerSessionCredential;
}

export interface LeaveRoomRequest extends RequestBase {
  expectedRoomVersion?: number;
}

export type GetStateRequest = RequestBase;

/**
 * Re-attach to a seat after a refresh, a closed browser, a lost network or a
 * server restart. Exactly one connection controls a seat at a time: if another
 * connection holds it, this fails with session-in-use unless `takeover` is
 * set, in which case the other connection receives session:ended "replaced".
 */
export interface ResumeRequest extends RequestBase {
  credential: PlayerSessionCredential;
  takeover?: boolean;
  /** The last game state version this client applied; missed actions are returned when few enough. */
  knownStateVersion?: number;
  /**
   * The controlEpoch this connection was given when it last took control of
   * the seat. Sent only by the same page re-attaching after its connection
   * was lost (the server may not have noticed yet). If nobody has claimed the
   * seat since, the epoch is unchanged and the stale connection is replaced;
   * if another tab or device took over, it has moved on and the answer is
   * session-in-use as usual. Keep it in memory only.
   */
  controlEpoch?: number;
}

/** Issue a new secret for this seat. It is pending until confirmed; the current secret keeps working until then. */
export type RotateCredentialRequest = RequestBase;

export interface ConfirmCredentialRequest extends RequestBase {
  /** The new secret from session:rotate, proving the client stored it. */
  secret: string;
}

export interface TransferHostRequest extends RequestBase {
  playerId: string;
  expectedRoomVersion?: number;
}

/** Host-only room actions: game:pause, game:resume, room:close. */
export interface HostRoomRequest extends RequestBase {
  expectedRoomVersion?: number;
}

export interface StartGameRequest extends RequestBase {
  expectedRoomVersion?: number;
}

export interface RollRequest extends RequestBase {
  /** The state version the player is looking at; stale requests are refused. */
  expectedStateVersion: number;
}

export interface MoveRequest extends RequestBase {
  expectedStateVersion: number;
  /** One of the player's own tokens (0–3). */
  tokenId: number;
}

export interface HistoryRequest extends RequestBase {
  /** Return actions after this sequence number (default 0 = from the start). */
  afterSeq?: number;
  /** 1–100, default 50. */
  limit?: number;
}

// ── Acknowledgements ───────────────────────────────────────────────────────

interface AckBase {
  /** Echo of the request's requestId (null if the request had none). */
  requestId: string | null;
  /** The room version after the request, when a room is involved. */
  roomVersion: number | null;
  /** The game state version after the request, when a game exists. */
  stateVersion: number | null;
}

export interface AckSuccess<T> extends AckBase {
  ok: true;
  data: T;
}

export interface AckFailure extends AckBase {
  ok: false;
  error: { code: ProtocolErrorCode; message: string; details: ErrorDetails };
}

export type Ack<T> = AckSuccess<T> | AckFailure;
export type AckCallback<T> = (response: Ack<T>) => void;

export interface MembershipData {
  room: RoomView;
  player: RoomPlayerView;
  /** Returned only to the connection that created or joined; store it securely, it is never shown again. */
  credential: PlayerSessionCredential;
  /** This connection's control epoch for the seat (see ResumeRequest.controlEpoch). */
  controlEpoch: number;
}

export interface RoomStateData {
  room: RoomView;
  game: GameStateView | null;
}

export interface ActionData {
  /** The committed action. On a retry of a committed request, the original one. */
  action: GameActionView;
  /** True when this request had already been committed and nothing new happened. */
  replayed: boolean;
  /** The latest committed game state. */
  game: GameStateView;
}

export interface ResumeData extends RoomStateData {
  player: RoomPlayerView;
  /**
   * Actions after knownStateVersion, oldest first, when there are at most 100
   * of them; null when knownStateVersion was not given or more were missed
   * (apply the snapshot instead).
   */
  missedActions: GameActionView[] | null;
  /** This connection's control epoch for the seat (see ResumeRequest.controlEpoch). */
  controlEpoch: number;
}

export interface RotateCredentialData {
  /** Pending until session:confirmCredential succeeds (or until it is first used to resume). */
  credential: PlayerSessionCredential;
}

export interface HistoryData {
  actions: GameActionView[];
  /** Pass as afterSeq to fetch the next page. */
  nextAfterSeq: number;
  hasMore: boolean;
}

// ── Events ─────────────────────────────────────────────────────────────────

export interface ClientToServerEvents {
  "room:create": (request: CreateRoomRequest, ack: AckCallback<MembershipData>) => void;
  "room:preview": (request: PreviewRoomRequest, ack: AckCallback<{ preview: RoomPreview }>) => void;
  "room:join": (request: JoinRoomRequest, ack: AckCallback<MembershipData>) => void;
  "room:leave": (request: LeaveRoomRequest, ack: AckCallback<{ left: true }>) => void;
  "room:getState": (request: GetStateRequest, ack: AckCallback<RoomStateData>) => void;
  "game:start": (request: StartGameRequest, ack: AckCallback<RoomStateData>) => void;
  "game:roll": (request: RollRequest, ack: AckCallback<ActionData>) => void;
  "game:move": (request: MoveRequest, ack: AckCallback<ActionData>) => void;
  "game:getHistory": (request: HistoryRequest, ack: AckCallback<HistoryData>) => void;
  "room:resume": (request: ResumeRequest, ack: AckCallback<ResumeData>) => void;
  "room:transferHost": (request: TransferHostRequest, ack: AckCallback<{ room: RoomView }>) => void;
  "room:close": (request: HostRoomRequest, ack: AckCallback<{ room: RoomView }>) => void;
  "game:pause": (request: HostRoomRequest, ack: AckCallback<{ room: RoomView; changed: boolean }>) => void;
  "game:resume": (request: HostRoomRequest, ack: AckCallback<{ room: RoomView; changed: boolean }>) => void;
  "session:rotate": (request: RotateCredentialRequest, ack: AckCallback<RotateCredentialData>) => void;
  "session:confirmCredential": (request: ConfirmCredentialRequest, ack: AckCallback<{ credentialVersion: number }>) => void;
}

export type SessionEndReason =
  /** Another connection took control of this seat. */
  | "replaced"
  /** The player left or was removed from the room. */
  | "left"
  /** The room was archived (retention). */
  | "expired";

export interface PresencePayload {
  roomId: string;
  playerId: string;
}

export interface ServerToClientEvents {
  "server:hello": (payload: ServerHello) => void;
  /** The room changed (membership, host, settings, status). Ignore versions older than the one held. */
  "room:updated": (payload: { room: RoomView }) => void;
  /** Authoritative game snapshot after a committed change (or on request). */
  "game:state": (payload: { roomId: string; game: GameStateView }) => void;
  /** A committed action, in order. A gap in stateVersion means one was missed: call room:getState. */
  "game:event": (payload: { roomId: string; action: GameActionView }) => void;
  "game:finished": (payload: { roomId: string; stateVersion: number; winnerId: string | null; ranking: string[] }) => void;
  "player:connected": (payload: PresencePayload) => void;
  "player:disconnected": (payload: PresencePayload) => void;
  /** The game was paused: the current player's connection was lost beyond the grace period, or the host paused it. */
  "game:paused": (payload: { roomId: string; roomVersion: number; pause: PauseInfo }) => void;
  "game:resumed": (payload: { roomId: string; roomVersion: number }) => void;
  /** This connection no longer controls its seat; it has been detached from the room. */
  "session:ended": (payload: { roomId: string; reason: SessionEndReason }) => void;
}
