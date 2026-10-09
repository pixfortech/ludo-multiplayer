// Error codes a client can receive in an acknowledgement. Stable contract:
// clients branch on `code`, never on the message text.

/** Room lifecycle and membership (Phase 2B). */
export type RoomErrorCode =
  // input
  | "invalid-request"
  | "invalid-room-code"
  | "invalid-display-name"
  | "invalid-room-name"
  | "invalid-colour"
  | "invalid-player-count"
  | "invalid-settings"
  // supported-feature limits
  | "unsupported-player-count"
  | "unsupported-setting"
  | "unsupported-rule"
  // room state
  | "room-not-found"
  | "room-full"
  | "room-closed"
  | "game-already-started"
  | "game-in-progress"
  | "settings-locked"
  | "not-enough-players"
  | "invalid-transition"
  | "capacity-below-members"
  // membership and permissions
  | "colour-taken"
  | "name-taken"
  | "already-member"
  | "unauthenticated"
  | "not-a-member"
  | "not-host"
  | "invalid-target"
  // sessions (Phase 2D)
  /** The credential was valid but no longer is: the player left or was removed, or the room was archived. */
  | "session-expired"
  /** Another connection controls this seat; resume with takeover to move control here. */
  | "session-in-use"
  /** This connection lost control of the seat to a newer one. */
  | "session-replaced"
  /** A concurrent credential rotation won; fetch state and retry. */
  | "credential-conflict"
  // concurrency and infrastructure
  | "version-conflict"
  | "rate-limited"
  | "room-code-exhausted"
  | "storage-unavailable";

/** Gameplay actions (Phase 2C). */
export type GameplayErrorCode =
  | "game-not-started"
  | "game-paused"
  | "game-finished"
  | "not-a-player"
  | "not-your-turn"
  | "not-awaiting-roll"
  | "not-awaiting-move"
  | "unknown-token"
  | "illegal-move"
  /** The action was computed from an older state; refresh and retry. */
  | "stale-state"
  /** The request id was already used by this player for a different action. */
  | "request-id-reused";

/** Socket transport (Phase 2C). */
export type TransportErrorCode =
  | "invalid-payload"
  | "payload-too-large"
  /** The connection is not bound to a room yet (create or join first). */
  | "not-in-room"
  /** The connection already belongs to a room; leave it or open another connection. */
  | "already-in-room"
  /** Unexpected server failure; details carry an incident id for support. */
  | "internal-error";

export type ProtocolErrorCode = RoomErrorCode | GameplayErrorCode | TransportErrorCode;

export type ErrorDetails = Readonly<Record<string, string | number | boolean | readonly string[] | null>>;

export interface ProtocolError {
  code: ProtocolErrorCode;
  message: string;
  details: ErrorDetails;
}
