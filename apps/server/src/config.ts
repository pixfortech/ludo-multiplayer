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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const clientOrigins = (env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (databaseUrl !== null && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error("Invalid DATABASE_URL: expected a postgres:// or postgresql:// connection string");
  }
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error("Invalid TRUST_PROXY_HOPS: expected a whole number from 0 to 10");
  }
  return { port, clientOrigins, databaseUrl, trustProxyHops };
}
