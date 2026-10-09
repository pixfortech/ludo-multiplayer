// The CI runner must fail a step whenever tests were skipped, an unhandled
// error occurred or a test timed out — even if the test command exited 0.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RUNNER = "scripts/ci/run-checked.mjs";

/** Runs the CI runner on a tiny node program (in a directory with a space in its name) that prints `text` and exits with `code`. */
function runChecked(text: string, code = 0): number | null {
  const dir = mkdtempSync(join(tmpdir(), "ci runner "));
  try {
    const script = join(dir, "fake test.mjs");
    writeFileSync(script, `process.stdout.write(${JSON.stringify(text)}); process.exit(${code});\n`);
    return spawnSync(process.execPath, [RUNNER, process.execPath, script], { encoding: "utf8" }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("CI test runner", () => {
  it("passes clean test output", () => {
    expect(runChecked(" Test Files  13 passed (13)\n      Tests  204 passed (204)\n")).toBe(0);
  });

  it("fails on skipped tests, skip warnings, unhandled errors and timeouts even when the command succeeded", () => {
    expect(runChecked("      Tests  203 passed | 1 skipped (204)\n")).toBe(1);
    expect(runChecked("⚠ PostgreSQL integration tests will be SKIPPED.\n")).toBe(1);
    expect(runChecked("⎯⎯⎯ Unhandled Errors ⎯⎯⎯\n")).toBe(1);
    expect(runChecked("Error: Test timed out in 5000ms.\n")).toBe(1);
    expect(runChecked("      Tests  3 todo (3)\n")).toBe(1);
  });

  it("fails when the command fails", () => {
    expect(runChecked("Tests  1 failed (1)\n", 1)).toBe(1);
  });
});

describe("CI workflow", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

  it("runs on Linux and Windows with Node 24 and PostgreSQL 17, requiring real database tests", () => {
    expect(workflow).toMatch(/os: \[ubuntu-latest, windows-latest\]/);
    expect(workflow).toMatch(/node-version: 24/);
    expect(workflow).toMatch(/check-postgres\.mjs 17/);
    expect(workflow).toMatch(/REQUIRE_POSTGRES_TESTS: "1"/);
    for (const step of ["npm ci", "npm run typecheck", "npm run lint", "npm run build", "run-checked.mjs npm run test", "LUDO_E2E_COMPILED"]) {
      expect(workflow).toContain(step);
    }
  });

  it("is read-only and uses no secrets", () => {
    expect(workflow).toMatch(/permissions:\n {2}contents: read/);
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).toMatch(/persist-credentials: false/);
  });
});
