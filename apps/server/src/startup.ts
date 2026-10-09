// Server startup. Multiplayer rooms live only in PostgreSQL, so the server
// refuses to start without a valid DATABASE_URL, a reachable database and an
// up-to-date schema. There is no in-memory fallback. Connection strings and
// passwords are never logged.

import pg from "pg";
import type { Pool } from "pg";
import { loadConfig, type ServerConfig } from "./config.js";
import { startServer, type RunningServer } from "./httpServer.js";
import { migrationStatus } from "./persistence/migrate.js";
import { PostgresGameStore } from "./persistence/postgresStore.js";
import { redactSecrets } from "./redact.js";
import { RoomService } from "./rooms/roomService.js";

export class StartupError extends Error {
  override name = "StartupError";
}

export { redactSecrets };

function describeDatabaseError(error: unknown): string {
  const { message, code } = (error ?? {}) as { message?: unknown; code?: unknown };
  const text = typeof message === "string" && message ? message : "unknown error";
  return redactSecrets(typeof code === "string" ? `${text} (${code})` : text);
}

/** A one-line, secret-free explanation of why startup failed. */
export function describeStartupFailure(error: unknown): string {
  return error instanceof StartupError ? error.message : describeDatabaseError(error);
}

export function requireDatabaseUrl(config: Pick<ServerConfig, "databaseUrl">): string {
  if (!config.databaseUrl) {
    throw new StartupError(
      "DATABASE_URL is required. Multiplayer rooms are stored in PostgreSQL and the server will not run without it " +
        "(see docs/architecture/persistence.md for local setup).",
    );
  }
  return config.databaseUrl;
}

/** Fails unless the database answers and its schema matches this server's migrations exactly. */
export async function checkDatabase(pool: Pool): Promise<void> {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    throw new StartupError(`PostgreSQL is not reachable: ${describeDatabaseError(error)}`);
  }
  let status;
  try {
    status = await migrationStatus(pool);
  } catch (error) {
    throw new StartupError(`Could not read the database schema version: ${describeDatabaseError(error)}`);
  }
  if (status.unknown.length > 0) {
    throw new StartupError(`The database has migrations this server does not know (${status.unknown.join(", ")}); deploy the matching server version`);
  }
  if (status.modified.length > 0) {
    throw new StartupError(`Applied migrations were changed after they ran (${status.modified.join(", ")}); restore them`);
  }
  if (status.pending.length > 0) {
    throw new StartupError(`The database schema is out of date (pending: ${status.pending.join(", ")}); run "npm run db:migrate" first`);
  }
}

export interface Application {
  server: RunningServer;
  store: PostgresGameStore;
  rooms: RoomService;
  close(): Promise<void>;
}

export interface BootstrapOptions {
  /** How long to wait for a database connection (default 5 s). */
  connectionTimeoutMs?: number;
}

export async function bootstrap(env: NodeJS.ProcessEnv = process.env, options: BootstrapOptions = {}): Promise<Application> {
  let config: ServerConfig;
  try {
    config = loadConfig(env);
  } catch (error) {
    throw new StartupError((error as Error).message);
  }
  const databaseUrl = requireDatabaseUrl(config);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: options.connectionTimeoutMs ?? 5000 });
  // An idle connection dropping must not crash the process; requests will report storage-unavailable.
  pool.on("error", (error) => console.error(`PostgreSQL connection error: ${describeDatabaseError(error)}`));

  let server: RunningServer;
  try {
    await checkDatabase(pool);
    server = await startServer({
      port: config.port,
      clientOrigins: config.clientOrigins,
      readiness: () => pool.query("SELECT 1").then(
        () => true,
        () => false,
      ),
    });
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }

  const store = new PostgresGameStore(pool);
  const rooms = new RoomService({ store });
  return {
    server,
    store,
    rooms,
    close: async () => {
      await server.close();
      await store.close();
    },
  };
}
