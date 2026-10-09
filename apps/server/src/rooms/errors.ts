// Typed, client-safe room errors. `code` is the stable contract the transport
// layer (2C) sends to clients; `message` is human-readable and never contains
// secrets, credential material or internal identifiers beyond what the caller
// already supplied.

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
  // concurrency and infrastructure
  | "version-conflict"
  | "rate-limited"
  | "room-code-exhausted"
  | "storage-unavailable";

export type RoomErrorDetails = Readonly<Record<string, string | number | boolean | readonly string[] | null>>;

export class RoomError extends Error {
  override name = "RoomError";
  constructor(
    readonly code: RoomErrorCode,
    message: string,
    readonly details: RoomErrorDetails = {},
  ) {
    super(message);
  }

  /** The only shape that may be sent to a client. */
  toJSON(): { code: RoomErrorCode; message: string; details: RoomErrorDetails } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export const isRoomError = (error: unknown, code?: RoomErrorCode): error is RoomError =>
  error instanceof RoomError && (code === undefined || error.code === code);
