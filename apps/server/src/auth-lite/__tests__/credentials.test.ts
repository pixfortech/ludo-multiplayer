import { describe, expect, it } from "vitest";
import { hashCredential, issueCredential, verifyCredential } from "../credentials.js";

describe("player credentials", () => {
  it("issues a 256-bit secret and stores only its 32-byte digest", () => {
    const { secret, hash } = issueCredential();
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    expect(hash).toHaveLength(32);
    expect(hash.equals(hashCredential(secret))).toBe(true);
  });

  it("never issues the same secret twice", () => {
    const secrets = new Set(Array.from({ length: 1000 }, () => issueCredential().secret));
    expect(secrets.size).toBe(1000);
  });

  it("verifies only the exact secret and rejects malformed input", () => {
    const { secret, hash } = issueCredential();
    expect(verifyCredential(secret, hash)).toBe(true);
    for (const bad of [secret.slice(1), `${secret}x`, "", "x".repeat(200), null, undefined, 42, { secret }]) {
      expect(verifyCredential(bad, hash)).toBe(false);
    }
    expect(verifyCredential(issueCredential().secret, hash)).toBe(false);
  });
});
