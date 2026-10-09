export interface ServerConfig {
  port: number;
  /** Origins allowed to open Socket.IO connections (the client app). */
  clientOrigins: string[];
  /** PostgreSQL connection string; null means no durable storage is configured. */
  databaseUrl: string | null;
  /**
   * Reverse proxies in front of the server whose X-Forwarded-For entries are
   * trusted for client addresses (rate limiting). 0 = use the peer address.
   */
  trustProxyHops: number;
  /** How long the player whose turn it is may be disconnected before the game pauses. */
  reconnectGraceMs: number;
  /** Days of inactivity before rooms expire or are archived (see rooms/retention.ts). */
  retention: { lobbyDays: number; activeDays: number; endedDays: number };
  /** How often the retention sweep runs; 0 disables it. */
  retentionSweepMs: number;
}

function wholeNumber(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: expected a whole number from ${min} to ${max}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const production = env.NODE_ENV === "production";
  if (production && !env.CLIENT_ORIGIN?.trim()) {
    throw new Error("CLIENT_ORIGIN is required in production: the origin(s) of the game client, e.g. https://ludo.example.com");
  }
  const clientOrigins = (env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of clientOrigins) {
    let url: URL | null = null;
    try {
      url = new URL(origin);
    } catch {
      // reported below
    }
    // An origin is scheme://host[:port] only; a wildcard would let any website open game connections.
    if (!url || url.origin !== origin || origin.includes("*")) throw new Error(`Invalid CLIENT_ORIGIN entry "${origin.slice(0, 80)}": expected an origin such as https://ludo.example.com`);
    if (production && url.protocol !== "https:") throw new Error(`CLIENT_ORIGIN must use https:// in production (got ${url.origin})`);
  }
  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (databaseUrl !== null && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error("Invalid DATABASE_URL: expected a postgres:// or postgresql:// connection string");
  }
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error("Invalid TRUST_PROXY_HOPS: expected a whole number from 0 to 10");
  }
  return {
    port,
    clientOrigins,
    databaseUrl,
    trustProxyHops,
    reconnectGraceMs: wholeNumber(env, "RECONNECT_GRACE_SECONDS", 15, 0, 3600) * 1000,
    retention: {
      lobbyDays: wholeNumber(env, "ROOM_RETENTION_LOBBY_DAYS", 30, 1, 3650),
      activeDays: wholeNumber(env, "ROOM_RETENTION_ACTIVE_DAYS", 90, 1, 3650),
      endedDays: wholeNumber(env, "ROOM_RETENTION_ENDED_DAYS", 30, 1, 3650),
    },
    retentionSweepMs: wholeNumber(env, "RETENTION_SWEEP_MINUTES", 60, 0, 10_080) * 60_000,
  };
}
