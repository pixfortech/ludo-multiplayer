// Human-readable room codes: 6 characters from a 32-symbol alphabet without
// look-alikes (letters without I and O, digits 2–9: no 0/O or 1/I confusion).
// 32^6 ≈ 1.07 billion codes, drawn with secure randomness (5 bits per
// character, so no modulo bias). Codes are invitations, not secrets: joining
// also passes server-side checks and rate limits.
// Must match the rooms_code_format constraint in migration 0001.

import { randomBytes } from "node:crypto";

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function generateRoomCode(): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte & 31]; // 32 symbols = exactly 5 bits
  return code;
}

/** Accepts user input like "abc-def" or " ABC DEF " and returns the canonical code, or null. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}
