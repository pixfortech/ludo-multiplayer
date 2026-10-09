// Maps every failure to the client-safe acknowledgement error shape.
// Unexpected errors are logged (redacted) with an incident id and reported as
// internal-error: no stack traces, SQL or connection details reach clients.

import { randomUUID } from "node:crypto";
import type { ErrorDetails, ProtocolError, TransportErrorCode } from "@ludo/shared-types";
import { GameplayError } from "../gameplay/gameplayErrors.js";
import { redactSecrets } from "../redact.js";
import { RoomError } from "../rooms/errors.js";

export class TransportError extends Error {
  override name = "TransportError";
  constructor(
    readonly code: TransportErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
  }
}

export type Logger = (line: string) => void;

export function toProtocolError(error: unknown, context: string, log: Logger): ProtocolError {
  if (error instanceof RoomError || error instanceof GameplayError || error instanceof TransportError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  const incidentId = randomUUID();
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  log(`[socket] internal error ${incidentId} in ${context}: ${redactSecrets(message)}`);
  return { code: "internal-error", message: "Something went wrong on the server", details: { incidentId } };
}
