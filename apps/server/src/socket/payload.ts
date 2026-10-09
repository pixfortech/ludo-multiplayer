// Structural validation of event payloads. Every payload must be a plain
// object under MAX_PAYLOAD_BYTES with a valid requestId. Gameplay payloads are
// checked field by field here (unknown fields refused, so no client can slip
// in a dice value or a player id); room payloads are passed to RoomService,
// which validates its own fields strictly.

import { MAX_PAYLOAD_BYTES } from "@ludo/shared-types";
import { TransportError } from "./socketErrors.js";

const REQUEST_ID = /^[\w-]{1,64}$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** Pulls the requestId from a raw payload for error replies, without trusting anything else. */
export function peekRequestId(raw: unknown): string | null {
  if (!isPlainObject(raw)) return null;
  return typeof raw.requestId === "string" && REQUEST_ID.test(raw.requestId) ? raw.requestId : null;
}

/** Checks the envelope and splits off the requestId. */
export function readEnvelope(raw: unknown): { requestId: string; body: Record<string, unknown> } {
  if (!isPlainObject(raw)) throw new TransportError("invalid-payload", "The request must be an object");
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(raw), "utf8");
  } catch {
    throw new TransportError("invalid-payload", "The request is not valid JSON data");
  }
  if (size > MAX_PAYLOAD_BYTES) throw new TransportError("payload-too-large", `Requests are limited to ${MAX_PAYLOAD_BYTES} bytes`, { limit: MAX_PAYLOAD_BYTES });
  const { requestId, ...body } = raw;
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    throw new TransportError("invalid-payload", "requestId must be 1–64 letters, digits, - or _", { field: "requestId" });
  }
  return { requestId, body };
}

type FieldKind = "integer" | "string";

interface FieldRule {
  kind: FieldKind;
  required: boolean;
  min?: number;
  max?: number;
}

/** Validates a flat payload against field rules; anything unexpected is refused. */
export function readFields<T>(body: Record<string, unknown>, rules: Record<string, FieldRule>): T {
  for (const key of Object.keys(body)) {
    if (!(key in rules)) throw new TransportError("invalid-payload", `Unexpected field: ${key.slice(0, 40)}`, { field: key.slice(0, 40) });
  }
  for (const [key, rule] of Object.entries(rules)) {
    const value = body[key];
    if (value === undefined) {
      if (rule.required) throw new TransportError("invalid-payload", `Missing field: ${key}`, { field: key });
      continue;
    }
    const ok =
      rule.kind === "integer"
        ? typeof value === "number" && Number.isInteger(value) && value >= (rule.min ?? -Infinity) && value <= (rule.max ?? Infinity)
        : typeof value === "string" && value.length <= (rule.max ?? Infinity);
    if (!ok) throw new TransportError("invalid-payload", `Invalid value for ${key}`, { field: key });
  }
  return body as T;
}

const VERSION = { kind: "integer", min: 0, max: 2_147_483_647 } as const;

export const RULES = {
  roomVersionOnly: { expectedRoomVersion: { ...VERSION, required: false } },
  none: {},
  preview: { code: { kind: "string", required: true, max: 32 } },
  roll: { expectedStateVersion: { ...VERSION, required: true } },
  move: { expectedStateVersion: { ...VERSION, required: true }, tokenId: { kind: "integer", required: true, min: 0, max: 3 } },
  history: { afterSeq: { ...VERSION, required: false }, limit: { kind: "integer", required: false, min: 1, max: 100 } },
} satisfies Record<string, Record<string, FieldRule>>;
