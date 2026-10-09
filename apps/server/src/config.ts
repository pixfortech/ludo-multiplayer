export interface ServerConfig {
  port: number;
  /** Origins allowed to open Socket.IO connections (the client app). */
  clientOrigins: string[];
  /** PostgreSQL connection string; null means no durable storage is configured. */
  databaseUrl: string | null;
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
  return { port, clientOrigins, databaseUrl };
}
