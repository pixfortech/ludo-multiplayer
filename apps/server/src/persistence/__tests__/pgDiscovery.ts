// Finds PostgreSQL server binaries (initdb, pg_ctl) for the test harness on
// Windows, macOS and Linux, without any shell. Search order:
//   1. PG_BIN_DIR (or the older PG_BIN) — an explicit directory;
//   2. every directory on PATH;
//   3. common installation directories for the platform, newest version first.
// The file system and environment are injected so the logic is testable for
// any platform from any platform.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface DiscoveryHost {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  /** True if the path is an existing file. */
  isFile(file: string): boolean;
  /** Entry names of a directory, or [] if it does not exist or cannot be read. */
  listDir(dir: string): string[];
}

export type DiscoverySource = "PG_BIN_DIR" | "PG_BIN" | "PATH" | "common-location";

export interface PostgresBinaries {
  binDir: string;
  initdb: string;
  pgCtl: string;
  source: DiscoverySource;
}

export interface DiscoveryResult {
  found: PostgresBinaries | null;
  /** Every directory that was checked, in order (for error messages). */
  searched: string[];
  /** Set when an explicitly configured directory is unusable (that is an error, not a fallback). */
  explicitError: string | null;
}

export const nodeHost: DiscoveryHost = {
  platform: process.platform,
  env: process.env,
  isFile: (file) => {
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  },
  listDir: (dir) => {
    try {
      return existsSync(dir) ? readdirSync(dir) : [];
    } catch {
      return [];
    }
  },
};

const pathFor = (platform: NodeJS.Platform) => (platform === "win32" ? path.win32 : path.posix);

/** Windows environment variable names are case-insensitive. */
function envValue(host: DiscoveryHost, name: string): string | undefined {
  if (host.platform !== "win32") return host.env[name];
  const key = Object.keys(host.env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : host.env[key];
}

/** Executable file names to try for a tool: initdb.exe (and other PATHEXT forms) on Windows. */
function executableNames(host: DiscoveryHost, tool: string): string[] {
  if (host.platform !== "win32") return [tool];
  const exts = (envValue(host, "PATHEXT") ?? ".EXE").split(";").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return [...new Set([".exe", ...exts])].map((ext) => tool + ext);
}

function findTool(host: DiscoveryHost, dir: string, tool: string): string | null {
  const p = pathFor(host.platform);
  for (const name of executableNames(host, tool)) {
    const file = p.join(dir, name);
    if (host.isFile(file)) return file;
  }
  return null;
}

function binariesIn(host: DiscoveryHost, dir: string, source: DiscoverySource): PostgresBinaries | null {
  const initdb = findTool(host, dir, "initdb");
  const pgCtl = findTool(host, dir, "pg_ctl");
  return initdb && pgCtl ? { binDir: dir, initdb, pgCtl, source } : null;
}

/** "17", "16.4", "17beta1" → numeric sort key; non-version names sort last. */
const versionKey = (name: string) => {
  const m = /^(\d+)(?:\.(\d+))?/.exec(name);
  return m ? Number(m[1]) * 1000 + Number(m[2] ?? 0) : -1;
};

/** Version directories under `root` (newest first), each joined with `suffix`. */
function versionedDirs(host: DiscoveryHost, root: string, suffix: string[], filter: (name: string) => string | null = (n) => n): string[] {
  const p = pathFor(host.platform);
  return host
    .listDir(root)
    .map((name) => ({ name, version: filter(name) }))
    .filter((e): e is { name: string; version: string } => e.version !== null && versionKey(e.version) >= 0)
    .sort((a, b) => versionKey(b.version) - versionKey(a.version))
    .map((e) => p.join(root, e.name, ...suffix));
}

/** Common installation directories for the platform, newest version first. */
export function commonLocations(host: DiscoveryHost): string[] {
  const p = pathFor(host.platform);
  if (host.platform === "win32") {
    const roots = ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"]
      .map((name) => envValue(host, name))
      .filter((v): v is string => Boolean(v));
    if (roots.length === 0) roots.push("C:\\Program Files");
    const dirs = [...new Set(roots)].flatMap((root) => versionedDirs(host, p.join(root, "PostgreSQL"), ["bin"]));
    const scoop = envValue(host, "USERPROFILE");
    if (scoop) dirs.push(p.join(scoop, "scoop", "apps", "postgresql", "current", "bin"));
    return dirs;
  }
  if (host.platform === "darwin") {
    return [
      ...["/opt/homebrew/opt", "/usr/local/opt"].flatMap((root) =>
        versionedDirs(host, root, ["bin"], (name) => (name.startsWith("postgresql@") ? name.slice("postgresql@".length) : null)),
      ),
      "/opt/homebrew/opt/postgresql/bin",
      "/usr/local/opt/postgresql/bin",
      ...versionedDirs(host, "/Applications/Postgres.app/Contents/Versions", ["bin"]),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ];
  }
  return [
    ...versionedDirs(host, "/usr/lib/postgresql", ["bin"]), // Debian/Ubuntu
    ...versionedDirs(host, "/usr", ["bin"], (name) => (name.startsWith("pgsql-") ? name.slice("pgsql-".length) : null)), // RHEL/Fedora (PGDG)
    "/usr/local/pgsql/bin", // source builds
    "/usr/bin",
    "/usr/local/bin",
  ];
}

export function discoverPostgres(host: DiscoveryHost = nodeHost): DiscoveryResult {
  const searched: string[] = [];
  for (const name of ["PG_BIN_DIR", "PG_BIN"] as const) {
    const explicit = envValue(host, name)?.trim().replace(/^"(.*)"$/, "$1");
    if (!explicit) continue;
    searched.push(explicit);
    const found = binariesIn(host, explicit, name);
    return found
      ? { found, searched, explicitError: null }
      : { found: null, searched, explicitError: `${name} is set, but initdb and pg_ctl were not both found in "${explicit}"` };
  }

  const pathDirs = (envValue(host, "PATH") ?? "")
    .split(host.platform === "win32" ? ";" : ":")
    .map((d) => d.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
  for (const [source, dirs] of [
    ["PATH", pathDirs],
    ["common-location", commonLocations(host)],
  ] as const) {
    for (const dir of dirs) {
      if (searched.includes(dir)) continue;
      searched.push(dir);
      const found = binariesIn(host, dir, source);
      if (found) return { found, searched, explicitError: null };
    }
  }
  return { found: null, searched, explicitError: null };
}

/** Major version reported by `initdb --version` ("initdb (PostgreSQL) 17.2" → 17), or null if it cannot run. */
export function postgresMajorVersion(initdb: string): number | null {
  const result = spawnSync(initdb, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  if (result.error || result.status !== 0) return null;
  const m = /\(PostgreSQL\)\s+(\d+)/.exec(`${result.stdout ?? ""}`);
  return m ? Number(m[1]) : null;
}

export const MIN_POSTGRES_MAJOR = 14;

/** How to make PostgreSQL available to the tests, for error and skip messages. */
export function setupInstructions(platform: NodeJS.Platform = process.platform): string {
  const lines = [
    "PostgreSQL server binaries (initdb and pg_ctl, version 14 or newer) are needed for the database tests. Either:",
  ];
  if (platform === "win32") {
    lines.push(
      '  • Install PostgreSQL (https://www.postgresql.org/download/windows/), then in PowerShell:  $env:PG_BIN_DIR = "C:\\Program Files\\PostgreSQL\\17\\bin"',
    );
  } else if (platform === "darwin") {
    lines.push("  • brew install postgresql@17   (or set PG_BIN_DIR to the directory containing initdb)");
  } else {
    lines.push("  • Install the PostgreSQL server package (e.g. apt install postgresql), or set PG_BIN_DIR to the directory containing initdb");
  }
  lines.push(
    "  • Or point TEST_DATABASE_URL at a PostgreSQL server where the tests may create and drop their own throwaway databases",
    "    (never your development or production database; the tests use a fresh ludo_test_* database and drop it afterwards).",
    "See README.md (Windows: \"Running the tests on Windows\").",
  );
  return lines.join("\n");
}
