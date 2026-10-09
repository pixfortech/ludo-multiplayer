// Startup safety: no database, no server. Uses a disposable PostgreSQL for the
// positive and schema checks, and the real entry point for the exit behaviour.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp } from "../app.js";
import { migrate } from "../persistence/migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../persistence/__tests__/pgHarness.js";
import { StartupError, bootstrap, describeStartupFailure, redactSecrets } from "../startup.js";

const SERVER_DIR = fileURLToPath(new URL("../..", import.meta.url));
const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");
const SECRET = "Sup3r-Secret-Pw";
/** Nothing listens on port 1, so connecting fails fast with ECONNREFUSED. */
const UNREACHABLE = `postgres://ludo:${SECRET}@127.0.0.1:1/ludo`;

async function startupError(env: NodeJS.ProcessEnv): Promise<StartupError> {
  const error = await bootstrap(env, { connectionTimeoutMs: 2000 }).then(
    async (app) => {
      await app.close();
      return null;
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StartupError);
  return error as StartupError;
}

/**
 * The minimum a child Node process needs: PATH everywhere, plus the Windows
 * system variables without which Node cannot start networking or find temp
 * directories. Deliberately excludes DATABASE_URL and everything else.
 */
function baseChildEnv(): Record<string, string> {
  const names = ["PATH", ...(process.platform === "win32" ? ["SystemRoot", "windir", "TEMP", "TMP", "PATHEXT", "ComSpec", "USERPROFILE"] : [])];
  const env: Record<string, string> = {};
  for (const name of names) {
    const key = Object.keys(process.env).find((k) => k.toUpperCase() === name.toUpperCase());
    if (key && process.env[key] !== undefined) env[name] = process.env[key]!;
  }
  return env;
}

/** Runs the real entry point (src/server.ts) with only the given environment. */
function runEntryPoint(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, "--conditions=source", "src/server.ts"], {
      cwd: SERVER_DIR,
      windowsHide: true,
      env: { ...baseChildEnv(), PORT: "0", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

describe("startup without a usable database", () => {
  it("refuses to start when DATABASE_URL is missing or blank", async () => {
    expect((await startupError({})).message).toMatch(/DATABASE_URL is required/);
    expect((await startupError({ DATABASE_URL: "   " })).message).toMatch(/DATABASE_URL is required/);
  });

  it("refuses an invalid DATABASE_URL without echoing it", async () => {
    const error = await startupError({ DATABASE_URL: `mysql://ludo:${SECRET}@db/ludo` });
    expect(error.message).toMatch(/Invalid DATABASE_URL/);
    expect(error.message).not.toContain(SECRET);
  });

  it("refuses to start when PostgreSQL is unreachable, without leaking the connection string", async () => {
    const error = await startupError({ DATABASE_URL: UNREACHABLE });
    expect(error.message).toMatch(/PostgreSQL is not reachable/);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain("postgres://ludo");
  });

  it("exits the real entry point with status 1 and a clear message when DATABASE_URL is missing", async () => {
    const run = await runEntryPoint({});
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/failed to start: DATABASE_URL is required/);
    expect(run.stdout).not.toMatch(/listening/);
  }, 40_000);

  it("exits the real entry point when the database is down, without printing the password", async () => {
    const run = await runEntryPoint({ DATABASE_URL: UNREACHABLE });
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/PostgreSQL is not reachable/);
    expect(run.stderr + run.stdout).not.toContain(SECRET);
    expect(run.stdout).not.toMatch(/listening/);
  }, 40_000);

  it("redacts connection strings and passwords from anything it logs", () => {
    expect(redactSecrets(`connect to postgresql://u:${SECRET}@h:5432/db failed`)).toBe("connect to postgres://[redacted] failed");
    expect(redactSecrets(`password=${SECRET} host=h`)).toBe("password=[redacted] host=h");
    expect(describeStartupFailure(new Error(`bad ${UNREACHABLE}`))).not.toContain(SECRET);
  });

  it("reports not-ready (503) when the readiness check fails", async () => {
    const app = createApp({ readiness: async () => false });
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/ready`);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: "unavailable" });
    } finally {
      server.close();
    }
  });
});

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ startup PostgreSQL tests SKIPPED: ${unavailableReason()}`);

describe.skipIf(skip)("startup with PostgreSQL", () => {
  let db: TestDatabase;
  let freshUrl: string;

  beforeAll(async () => {
    db = (await startTestDatabase())!;
    const admin = new pg.Client({ connectionString: db.url });
    await admin.connect();
    await admin.query("CREATE DATABASE ludo_unmigrated");
    await admin.end();
    const url = new URL(db.url);
    url.pathname = "/ludo_unmigrated";
    freshUrl = url.toString();
  }, 120_000);

  afterAll(async () => {
    await db?.dispose();
  }, 60_000);

  it("refuses an unmigrated database and names the fix", async () => {
    const error = await startupError({ DATABASE_URL: freshUrl });
    expect(error.message).toMatch(/schema is out of date \(pending: 0001_initial, 0002_room_lifecycle\).*npm run db:migrate/);
  });

  it("refuses a database whose applied migration was edited", async () => {
    const pool = new pg.Pool({ connectionString: freshUrl });
    try {
      await migrate(pool);
      await pool.query("UPDATE schema_migrations SET checksum = 'tampered' WHERE id = '0002_room_lifecycle'");
      expect((await startupError({ DATABASE_URL: freshUrl })).message).toMatch(/changed after they ran \(0002_room_lifecycle\)/);
      await pool.query("INSERT INTO schema_migrations (id, checksum) VALUES ('9999_future', 'x')");
      expect((await startupError({ DATABASE_URL: freshUrl })).message).toMatch(/does not know \(9999_future\)/);
    } finally {
      await pool.end();
    }
  });

  it("starts only once the database is reachable and migrated, and reports ready", async () => {
    const pool = new pg.Pool({ connectionString: db.url });
    await migrate(pool);
    await pool.end();
    const app = await bootstrap({ DATABASE_URL: db.url, PORT: "0" });
    try {
      const base = `http://127.0.0.1:${app.server.port}`;
      expect((await fetch(`${base}/api/health`)).status).toBe(200);
      const ready = await fetch(`${base}/api/ready`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: "ready" });
      // The wired room service persists through the same database.
      const created = await app.rooms.createRoom({ hostName: "Aman", maxPlayers: 2 }, { clientKey: "startup-test" });
      expect((await app.store.getRoom(created.room.roomId))?.code).toBe(created.room.code);
    } finally {
      await app.close();
    }
  });
});
