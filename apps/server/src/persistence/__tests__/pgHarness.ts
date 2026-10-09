// Disposable PostgreSQL for tests. Never touches DATABASE_URL.
//
//  • TEST_DATABASE_URL set → creates a uniquely named database on that server
//    (dropped afterwards). Crash simulation is unavailable in this mode.
//  • Otherwise, if PostgreSQL binaries exist (PG_BIN, /usr/lib/postgresql/*/bin
//    or PATH) → initdb a private cluster in a temp directory, start it on a
//    free 127.0.0.1 port, and delete it afterwards. Supports crash/restart.
//  • Neither → returns null; callers skip, unless REQUIRE_POSTGRES_TESTS=1.

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

export interface TestDatabase {
  url: string;
  /** Whether crash()/restart() are supported (private cluster mode). */
  canCrash: boolean;
  /** Simulates a server process crash: immediate shutdown, no checkpoint. */
  crash(): Promise<void>;
  restart(): Promise<void>;
  dispose(): Promise<void>;
}

export const POSTGRES_REQUIRED = process.env.REQUIRE_POSTGRES_TESTS === "1";

function findPgBin(): string | null {
  const fromEnv = process.env.PG_BIN;
  if (fromEnv && existsSync(join(fromEnv, "initdb"))) return fromEnv;
  const root = "/usr/lib/postgresql";
  if (existsSync(root)) {
    const versions = readdirSync(root).filter((v) => existsSync(join(root, v, "bin", "initdb"))).sort((a, b) => Number(b) - Number(a));
    if (versions[0]) return join(root, versions[0], "bin");
  }
  const which = spawnSync("sh", ["-c", "command -v initdb"], { encoding: "utf8" });
  const path = which.stdout.trim();
  return path ? path.replace(/\/initdb$/, "") : null;
}

const isRoot = () => process.getuid?.() === 0;

/** PostgreSQL refuses to run as root; run its tools as the postgres user in that case. */
function runPg(bin: string, tool: string, args: string[]): void {
  const command = join(bin, tool);
  if (isRoot()) execFileSync("runuser", ["-u", "postgres", "--", command, ...args], { stdio: "pipe" });
  else execFileSync(command, args, { stdio: "pipe" });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

async function adminQuery(url: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function fromExistingServer(baseUrl: string): Promise<TestDatabase> {
  if (process.env.DATABASE_URL && baseUrl === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  }
  const name = `ludo_test_${randomBytes(6).toString("hex")}`;
  await adminQuery(baseUrl, `CREATE DATABASE ${name}`);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    canCrash: false,
    crash: () => Promise.reject(new Error("crash simulation needs a private cluster")),
    restart: () => Promise.reject(new Error("restart needs a private cluster")),
    dispose: () => adminQuery(baseUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  };
}

async function privateCluster(bin: string): Promise<TestDatabase> {
  const base = mkdtempSync(join(isRoot() ? "/tmp" : tmpdir(), "ludo-pg-"));
  const data = join(base, "data");
  if (isRoot()) execFileSync("chown", ["-R", "postgres", base]);
  runPg(bin, "initdb", ["-D", data, "-A", "trust", "-U", "postgres", "--no-sync", "-E", "UTF8", "--locale=C"]);
  const port = await freePort();
  const start = () => runPg(bin, "pg_ctl", ["-D", data, "-o", `-p ${port} -k ${base} -c listen_addresses=127.0.0.1`, "-l", join(base, "server.log"), "-w", "start"]);
  const stop = (mode: "fast" | "immediate") => runPg(bin, "pg_ctl", ["-D", data, "-m", mode, "-w", "stop"]);
  start();
  const adminUrl = `postgres://postgres@127.0.0.1:${port}/postgres`;
  await adminQuery(adminUrl, "CREATE DATABASE ludo_test");
  return {
    url: `postgres://postgres@127.0.0.1:${port}/ludo_test`,
    canCrash: true,
    crash: async () => stop("immediate"),
    restart: async () => start(),
    dispose: async () => {
      try {
        stop("fast");
      } catch {
        // already stopped
      }
      rmSync(base, { recursive: true, force: true });
    },
  };
}

export async function startTestDatabase(): Promise<TestDatabase | null> {
  if (process.env.TEST_DATABASE_URL) return fromExistingServer(process.env.TEST_DATABASE_URL);
  const bin = findPgBin();
  if (!bin) {
    if (POSTGRES_REQUIRED) throw new Error("REQUIRE_POSTGRES_TESTS=1 but no PostgreSQL is available");
    console.warn("⚠ PostgreSQL not available: persistence tests are SKIPPED (set TEST_DATABASE_URL or PG_BIN)");
    return null;
  }
  return privateCluster(bin);
}

/** True when PostgreSQL tests can run here (checked synchronously for describe.skipIf). */
export const postgresAvailable = Boolean(process.env.TEST_DATABASE_URL) || findPgBin() !== null;
