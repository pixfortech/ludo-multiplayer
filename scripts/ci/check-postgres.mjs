// Confirms the PostgreSQL server binaries the tests will use (PG_BIN_DIR) are
// the expected major version. Never connects anywhere: the tests start their
// own throwaway clusters from these binaries.
//
//   node scripts/ci/check-postgres.mjs 17
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const expected = process.argv[2];
const dir = process.env.PG_BIN_DIR;
if (!dir) {
  console.error("PG_BIN_DIR is not set");
  process.exit(1);
}
const exe = (name) => join(dir, process.platform === "win32" ? `${name}.exe` : name);
for (const tool of ["initdb", "pg_ctl"]) {
  const result = spawnSync(exe(tool), ["--version"], { encoding: "utf8", windowsHide: true });
  const text = `${result.stdout ?? ""}`.trim();
  if (result.error || result.status !== 0) {
    console.error(`${tool} did not run from ${dir}: ${result.error?.message ?? result.stderr}`);
    process.exit(1);
  }
  const major = /\(PostgreSQL\) (\d+)/.exec(text)?.[1];
  console.log(`${tool}: ${text}`);
  if (expected && major !== expected) {
    console.error(`expected PostgreSQL ${expected}, found ${major ?? "unknown"}`);
    process.exit(1);
  }
}
