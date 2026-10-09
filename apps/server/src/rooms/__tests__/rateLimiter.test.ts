import { describe, expect, it } from "vitest";
import { CodeLookupGuard, SlidingWindowLimiter } from "../rateLimiter.js";

describe("rate limits", () => {
  it("allows `limit` actions per window, then reports the wait", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1000 }, () => now);
    limiter.record("a");
    now = 100;
    limiter.record("a");
    expect(limiter.retryAfterMs("a")).toBe(900);
    expect(limiter.retryAfterMs("b")).toBe(0);
    now = 1001;
    expect(limiter.retryAfterMs("a")).toBe(0);
  });

  it("bounds memory by evicting the least recently used keys", () => {
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 60_000 }, () => 0, 3);
    for (const key of ["a", "b", "c", "d"]) limiter.record(key);
    expect(limiter.retryAfterMs("a")).toBe(0); // evicted
    expect(limiter.retryAfterMs("d")).toBeGreaterThan(0);
  });

  it("cuts off a client that keeps guessing wrong codes", () => {
    let now = 0;
    const guard = new CodeLookupGuard({ lookups: { limit: 100, windowMs: 60_000 }, misses: { limit: 3, windowMs: 60_000 } }, () => now);
    for (let i = 0; i < 3; i++) {
      expect(guard.begin("guesser")).toBe(0);
      guard.recordMiss("guesser");
    }
    expect(guard.begin("guesser")).toBeGreaterThan(0);
    expect(guard.begin("friend")).toBe(0);
    now = 60_001;
    expect(guard.begin("guesser")).toBe(0);
  });
});
