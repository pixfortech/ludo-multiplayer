// PostgreSQL binary discovery. Platforms are SIMULATED here with an in-memory
// file system (Windows paths use path.win32), so these tests run anywhere;
// they do not prove an actual Windows run. The last group exercises the real
// machine.
import { describe, expect, it } from "vitest";
import { discoverPostgres, nodeHost, postgresMajorVersion, setupInstructions, type DiscoveryHost } from "./pgDiscovery.js";

/** A fake machine: `files` are existing executables; directories are derived from them. */
function fakeHost(platform: NodeJS.Platform, env: Record<string, string | undefined>, files: string[]): DiscoveryHost {
  const sep = platform === "win32" ? "\\" : "/";
  const norm = (p: string) => (platform === "win32" ? p.toLowerCase() : p);
  const fileSet = new Set(files.map(norm));
  return {
    platform,
    env,
    isFile: (file) => fileSet.has(norm(file)),
    listDir: (dir) => {
      const prefix = norm(dir.endsWith(sep) ? dir : dir + sep);
      const names = new Set<string>();
      for (const f of files) if (norm(f).startsWith(prefix)) names.add(f.slice(prefix.length).split(sep)[0]!);
      return [...names];
    },
  };
}

const win = (dir: string) => [`${dir}\\initdb.exe`, `${dir}\\pg_ctl.exe`];
const unix = (dir: string) => [`${dir}/initdb`, `${dir}/pg_ctl`];
const WIN_ENV = { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", PATHEXT: ".COM;.EXE;.BAT;.CMD" };

describe("PostgreSQL discovery (simulated Windows)", () => {
  it("uses PG_BIN_DIR first, with spaces and surrounding quotes", () => {
    const dir = "C:\\Program Files\\PostgreSQL\\17\\bin";
    const host = fakeHost("win32", { ...WIN_ENV, PG_BIN_DIR: `"${dir}"` }, win(dir));
    expect(discoverPostgres(host).found).toEqual({
      binDir: dir,
      initdb: `${dir}\\initdb.exe`,
      pgCtl: `${dir}\\pg_ctl.exe`,
      source: "PG_BIN_DIR",
    });
  });

  it("reports a wrong PG_BIN_DIR as an error instead of silently looking elsewhere", () => {
    const host = fakeHost("win32", { ...WIN_ENV, PG_BIN_DIR: "D:\\nowhere" }, win("C:\\Program Files\\PostgreSQL\\17\\bin"));
    const result = discoverPostgres(host);
    expect(result.found).toBeNull();
    expect(result.explicitError).toMatch(/PG_BIN_DIR is set, but initdb and pg_ctl were not both found in "D:\\nowhere"/);
  });

  it("finds binaries on PATH (Windows 'Path' is case-insensitive and ;-separated)", () => {
    const dir = "E:\\Tools\\My Postgres\\bin";
    const host = fakeHost("win32", { ...WIN_ENV, Path: `C:\\Windows\\system32;"${dir}";C:\\Other` }, win(dir));
    expect(discoverPostgres(host).found).toMatchObject({ binDir: dir, source: "PATH" });
  });

  it("falls back to Program Files, newest version first, including versions newer than 17", () => {
    const files = [
      ...win("C:\\Program Files\\PostgreSQL\\16\\bin"),
      ...win("C:\\Program Files\\PostgreSQL\\17\\bin"),
      "C:\\Program Files\\PostgreSQL\\notes\\readme.txt",
    ];
    expect(discoverPostgres(fakeHost("win32", WIN_ENV, files)).found).toMatchObject({ binDir: "C:\\Program Files\\PostgreSQL\\17\\bin", source: "common-location" });
    const withNewer = [...files, ...win("C:\\Program Files\\PostgreSQL\\18\\bin")];
    expect(discoverPostgres(fakeHost("win32", WIN_ENV, withNewer)).found?.binDir).toBe("C:\\Program Files\\PostgreSQL\\18\\bin");
  });

  it("skips an install that has initdb but no pg_ctl", () => {
    const files = ["C:\\Program Files\\PostgreSQL\\17\\bin\\initdb.exe", ...win("C:\\Program Files\\PostgreSQL\\16\\bin")];
    expect(discoverPostgres(fakeHost("win32", WIN_ENV, files)).found?.binDir).toBe("C:\\Program Files\\PostgreSQL\\16\\bin");
  });

  it("does not crash with no PATH or Program Files variables, and lists what it searched", () => {
    expect(discoverPostgres(fakeHost("win32", {}, []))).toEqual({ found: null, searched: [], explicitError: null });
    const result = discoverPostgres(fakeHost("win32", { ...WIN_ENV, Path: "C:\\Windows", USERPROFILE: "C:\\Users\\Ana Lee" }, []));
    expect(result.found).toBeNull();
    expect(result.searched).toEqual(["C:\\Windows", "C:\\Users\\Ana Lee\\scoop\\apps\\postgresql\\current\\bin"]);
  });

  it("gives PowerShell setup instructions", () => {
    const text = setupInstructions("win32");
    expect(text).toContain('$env:PG_BIN_DIR = "C:\\Program Files\\PostgreSQL\\17\\bin"');
    expect(text).toContain("TEST_DATABASE_URL");
  });
});

describe("PostgreSQL discovery (simulated macOS and Linux)", () => {
  it("finds Homebrew postgresql@N, newest first", () => {
    const files = [...unix("/opt/homebrew/opt/postgresql@16/bin"), ...unix("/opt/homebrew/opt/postgresql@17/bin")];
    expect(discoverPostgres(fakeHost("darwin", { PATH: "/usr/bin:/bin" }, files)).found?.binDir).toBe("/opt/homebrew/opt/postgresql@17/bin");
  });

  it("finds Debian/Ubuntu and RHEL layouts", () => {
    expect(discoverPostgres(fakeHost("linux", { PATH: "/usr/bin" }, unix("/usr/lib/postgresql/16/bin"))).found?.binDir).toBe("/usr/lib/postgresql/16/bin");
    expect(discoverPostgres(fakeHost("linux", { PATH: "/usr/bin" }, unix("/usr/pgsql-17/bin"))).found?.binDir).toBe("/usr/pgsql-17/bin");
  });

  it("prefers PATH over common locations, and the legacy PG_BIN variable still works", () => {
    const files = [...unix("/opt/pg 17/bin"), ...unix("/usr/lib/postgresql/16/bin")];
    expect(discoverPostgres(fakeHost("linux", { PATH: "/usr/bin:/opt/pg 17/bin" }, files)).found).toMatchObject({ binDir: "/opt/pg 17/bin", source: "PATH" });
    expect(discoverPostgres(fakeHost("linux", { PG_BIN: "/usr/lib/postgresql/16/bin" }, files)).found).toMatchObject({ source: "PG_BIN" });
  });
});

describe("PostgreSQL discovery on this machine (real)", () => {
  it("never throws when a tool cannot be run", () => {
    expect(postgresMajorVersion("/definitely/not/initdb")).toBeNull();
    expect(postgresMajorVersion("C:\\Program Files\\PostgreSQL\\99\\bin\\initdb.exe")).toBeNull();
  });

  it("reads the version of the binaries it finds", () => {
    const { found } = discoverPostgres(nodeHost);
    if (!found) return; // availability itself is enforced by REQUIRE_POSTGRES_TESTS in the database suites
    expect(postgresMajorVersion(found.initdb)).toBeGreaterThanOrEqual(14);
  });
});
