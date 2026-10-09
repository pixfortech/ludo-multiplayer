// Player-session credentials. A credential is 32 random bytes (256 bits),
// given to the client once as base64url. The server stores only its SHA-256
// digest: with this much entropy a fast hash is sufficient (nothing to brute
// force), and comparison is constant-time.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const CREDENTIAL_BYTES = 32;

export interface IssuedCredential {
  /** Give to the client; never store or log. */
  secret: string;
  /** Store this. */
  hash: Buffer;
}

export function hashCredential(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function issueCredential(): IssuedCredential {
  const secret = randomBytes(CREDENTIAL_BYTES).toString("base64url");
  return { secret, hash: hashCredential(secret) };
}

/** Constant-time check of a presented secret against a stored digest. */
export function verifyCredential(presented: unknown, storedHash: Buffer): boolean {
  if (typeof presented !== "string" || presented.length === 0 || presented.length > 128) return false;
  const digest = hashCredential(presented);
  return digest.length === storedHash.length && timingSafeEqual(digest, storedHash);
}
