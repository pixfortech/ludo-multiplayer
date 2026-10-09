// Disposable PostgreSQL for tests, on Windows, macOS and Linux. Never touches
// DATABASE_URL.
//
//  • TEST_DATABASE_URL set → creates a uniquely named database (ludo_test_*)
//    on that server and drops it afterwards. Crash simulation is unavailable.
//  • Otherwise, if PostgreSQL server binaries are found (PG_BIN_DIR, PATH or a
//    common install location; see pgDiscovery.ts) → initdb a private cluster in
//    a temporary directory, start it on a free 127.0.0.1 port, and delete it
//    afterwards. Supports crash/restart.
//  • Neither → callers skip with setup instructions, unless
//    REQUIRE_POSTGRES_TESTS=1, which turns that into a failure.
//
// No shell is used: every tool is started directly with an argument array, so
// paths with spaces are safe. Server settings are written to postgresql.conf
// rather than passed on a pg_ctl command line for the same reason.

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { MIN_POSTGRES_MAJOR, discoverPostgres, postgresMajorVersion, setupInstructions, type PostgresBinaries } from "./pgDiscovery.js";

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

const isWindows = process.platform === "win32";
/** PostgreSQL refuses to run as root on Unix; tests running as root drop to the postgres user. */
const isUnixRoot = () => !isWindows && process.getuid?.() === 0;

interface Discovered {
  binaries: PostgresBinaries;
  major: number;
}

let cached: Discovered | null | undefined;
let cachedProblem = "";

/** Discovers usable binaries once per test file. */
function findPostgres(): Discovered | null {
  if (cached !== undefined) return cached;
  const result = discoverPostgres();
  if (!result.found) {
    cachedProblem = result.explicitError ?? `PostgreSQL binaries not found (searched ${result.searched.length} directories).`;
    return (cached = null);
  }
  const major = postgresMajorVersion(result.found.initdb);
  if (major === null) {
    cachedProblem = `Found ${result.found.initdb}, but "initdb --version" did not run.`;
    return (cached = null);
  }
  if (major < MIN_POSTGRES_MAJOR) {
    cachedProblem = `Found PostgreSQL ${major} in ${result.found.binDir}; version ${MIN_POSTGRES_MAJOR} or newer is required.`;
    return (cached = null);
  }
  return (cached = { binaries: result.found, major });
}

/** Runs a PostgreSQL tool directly (no shell). Returns its output; throws with the output on failure. */
function runTool(command: string, args: string[], options: { ignoreOutput?: boolean } = {}): string {
  const spawnOptions: SpawnSyncOptions = {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    // pg_ctl start leaves the server running; it must not hold our pipes open (it would on Windows).
    stdio: options.ignoreOutput ? "ignore" : "pipe",
  };
  const [file, argv] = isUnixRoot() ? ["runuser", ["-u", "postgres", "--", command, ...args]] : [command, args];
  const result = spawnSync(file, argv, spawnOptions);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? result.signal}${output ? `:\n${output}` : ""}`);
  return output;
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

/** Server identity of a connection string (host, port, database), without credentials. */
function serverIdentity(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}:${u.port || "5432"}/${decodeURIComponent(u.pathname.replace(/^\//, ""))}`;
  } catch {
    return url;
  }
}

async function fromExistingServer(baseUrl: string): Promise<TestDatabase> {
  if (process.env.DATABASE_URL && serverIdentity(baseUrl) === serverIdentity(process.env.DATABASE_URL)) {
    throw new Error("TEST_DATABASE_URL must not point at the DATABASE_URL database; use an admin database such as /postgres on a test server");
  }
  const name = `ludo_test_${randomBytes(6).toString("hex")}`; // fresh, isolated, dropped afterwards
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

/** Clusters still running, stopped synchronously if the test process exits early. */
const liveClusters = new Set<() => void>();
let exitHookInstalled = false;
function stopOnExit(stop: () => void): () => void {
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once("exit", () => {
      for (const fn of liveClusters) fn();
    });
  }
  liveClusters.add(stop);
  return () => liveClusters.delete(stop);
}

const confString = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function privateCluster({ binaries }: Discovered): Promise<TestDatabase> {
  const base = mkdtempSync(join(tmpdir(), "ludo-pg-"));
  const data = join(base, "data");
  const log = join(base, "server.log");
  if (isUnixRoot()) {
    // The postgres user must own the cluster directory (and be able to reach it through TMPDIR).
    chmodSync(base, 0o755);
    runToolAsRoot("chown", ["-R", "postgres", base]);
  }
  runTool(binaries.initdb, ["-D", data, "-A", "trust", "-U", "postgres", "--no-sync", "-E", "UTF8", "--locale=C"]);

  const port = await freePort();
  appendFileSync(
    join(data, "postgresql.conf"),
    [
      "",
      "# ludo test cluster",
      `port = ${port}`,
      "listen_addresses = '127.0.0.1'",
      // Unix sockets in the private directory (Unix); TCP only on Windows.
      `unix_socket_directories = ${isWindows ? "''" : confString(base)}`,
      "",
    ].join("\n"),
  );

  const start = () => {
    try {
      runTool(binaries.pgCtl, ["-D", data, "-l", log, "-w", "-t", "60", "start"], { ignoreOutput: true });
    } catch (error) {
      const tail = existsSync(log) ? readFileSync(log, "utf8").split(/\r?\n/).slice(-15).join("\n") : "";
      throw new Error(`${(error as Error).message}${tail ? `\nserver.log:\n${tail}` : ""}`);
    }
  };
  const stop = (mode: "fast" | "immediate") => runTool(binaries.pgCtl, ["-D", data, "-m", mode, "-w", "stop"]);
  const remove = () => rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  const forget = stopOnExit(() => {
    try {
      stop("immediate");
    } catch {
      // not running
    }
    try {
      remove();
    } catch {
      // best effort at exit
    }
  });

  try {
    start();
    await adminQuery(`postgres://postgres@127.0.0.1:${port}/postgres`, "CREATE DATABASE ludo_test");
  } catch (error) {
    try {
      stop("immediate");
    } catch {
      // never started
    }
    remove();
    forget();
    throw error;
  }

  return {
    url: `postgres://postgres@127.0.0.1:${port}/ludo_test`,
    canCrash: true,
    crash: async () => {
      stop("immediate");
    },
    restart: async () => start(),
    dispose: async () => {
      try {
        stop("fast");
      } catch {
        // already stopped
      }
      remove();
      forget();
    },
  };
}

/** chown is the only non-PostgreSQL tool, used only when tests run as root on Unix. */
function runToolAsRoot(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "pipe", encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? ""}`);
}

export async function startTestDatabase(): Promise<TestDatabase | null> {
  if (process.env.TEST_DATABASE_URL) return fromExistingServer(process.env.TEST_DATABASE_URL);
  const postgres = findPostgres();
  if (!postgres) {
    const message = `${cachedProblem}\n${setupInstructions()}`;
    if (POSTGRES_REQUIRED) throw new Error(`REQUIRE_POSTGRES_TESTS=1 but PostgreSQL is not available.\n${message}`);
    console.warn(`⚠ PostgreSQL tests are SKIPPED.\n${message}`);
    return null;
  }
  return privateCluster(postgres);
}

/** True when PostgreSQL tests can run here (checked synchronously for describe.skipIf). */
export const postgresAvailable = Boolean(process.env.TEST_DATABASE_URL) || findPostgres() !== null;

/** Why PostgreSQL is unavailable, with setup instructions (empty when it is available). */
export function unavailableReason(): string {
  return postgresAvailable ? "" : `${cachedProblem}\n${setupInstructions()}`;
}
