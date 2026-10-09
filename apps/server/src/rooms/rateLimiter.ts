// In-process sliding-window rate limits, used to slow room-code enumeration
// and room-creation floods. Keys are supplied by the transport (client IP or
// connection id). Memory is bounded: the oldest keys are evicted first.
// A multi-process deployment needs a shared limiter (tracked for 2E).

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly policy: RateLimitPolicy,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  private recent(key: string): number[] {
    const since = this.now() - this.policy.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length === 0) this.hits.delete(key);
    else this.hits.set(key, list);
    return list;
  }

  /** Milliseconds until `key` may act again; 0 if allowed now. */
  retryAfterMs(key: string): number {
    const list = this.recent(key);
    if (list.length < this.policy.limit) return 0;
    return Math.max(1, list[list.length - this.policy.limit]! + this.policy.windowMs - this.now());
  }

  record(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.delete(key); // re-insert so Map order tracks recency
    this.hits.set(key, list);
    while (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
  }
}

export interface CodeLookupPolicy {
  /** Any lookups (preview or join) per key. */
  lookups: RateLimitPolicy;
  /** Lookups of codes that do not exist, per key: the enumeration signal. */
  misses: RateLimitPolicy;
}

export const DEFAULT_CODE_LOOKUP_POLICY: CodeLookupPolicy = {
  lookups: { limit: 60, windowMs: 60_000 },
  misses: { limit: 10, windowMs: 10 * 60_000 },
};

export const DEFAULT_ROOM_CREATION_POLICY: RateLimitPolicy = { limit: 10, windowMs: 10 * 60_000 };

/** Guards code lookups: a client that keeps guessing wrong codes is cut off for a while. */
export class CodeLookupGuard {
  private readonly lookups: SlidingWindowLimiter;
  private readonly misses: SlidingWindowLimiter;

  constructor(policy: CodeLookupPolicy = DEFAULT_CODE_LOOKUP_POLICY, now: () => number = Date.now) {
    this.lookups = new SlidingWindowLimiter(policy.lookups, now);
    this.misses = new SlidingWindowLimiter(policy.misses, now);
  }

  /** Milliseconds to wait before another lookup; 0 = allowed (and recorded). */
  begin(key: string): number {
    const wait = Math.max(this.lookups.retryAfterMs(key), this.misses.retryAfterMs(key));
    if (wait === 0) this.lookups.record(key);
    return wait;
  }

  recordMiss(key: string): void {
    this.misses.record(key);
  }
}
