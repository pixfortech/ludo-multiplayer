// Typed, client-safe room errors. `code` is the stable contract the transport
// layer (2C) sends to clients; `message` is human-readable and never contains
// secrets, credential material or internal identifiers beyond what the caller
// already supplied.

import type { ErrorDetails, RoomErrorCode } from "@ludo/shared-types";

export type { RoomErrorCode };

export type RoomErrorDetails = ErrorDetails;

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
