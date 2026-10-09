// Runs a test command, streaming its output, and fails the CI step if the
// command fails OR its output shows anything that must never pass silently:
// skipped tests, skip warnings from the PostgreSQL harness, unhandled errors
// or rejections, or timeouts.
//
//   node scripts/ci/run-checked.mjs npm run test
//
// Works the same on Linux and Windows (no shell features are relied on).
import { spawn } from "node:child_process";

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("usage: node scripts/ci/run-checked.mjs <command> [args...]");
  process.exit(2);
}

/** Output patterns that fail the step even when the command itself exits 0. */
const FORBIDDEN = [
  { pattern: /\b\d+ skipped\b/, reason: "tests were skipped" },
  { pattern: /\bSKIPPED\b/, reason: "a test suite reported that it was skipped" },
  { pattern: /\b\d+ todo\b/, reason: "tests are marked todo" },
  { pattern: /Unhandled (Error|Rejection)s?\b/i, reason: "an unhandled error or rejection occurred" },
  { pattern: /\bTest timed out\b|\bTimed out after\b/, reason: "a test timed out" },
];

/** Quotes one argument for the platform shell, so paths with spaces (C:\Web Apps\…) stay one argument. */
function quote(arg) {
  if (/^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  return process.platform === "win32" ? `"${arg.replace(/"/g, '\\"')}"` : `'${arg.replace(/'/g, "'\\''")}'`;
}

let output = "";
// A shell is needed so that npm/npx resolve to their .cmd shims on Windows; every argument is quoted.
const child = spawn(command.map(quote).join(" "), { shell: true, stdio: ["inherit", "pipe", "pipe"] });
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  output += chunk.toString();
});
child.on("close", (code, signal) => {
  // Strip ANSI colour codes before matching.
  const ESC = String.fromCharCode(27);
  const plain = output.split(ESC).map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, ""))).join("");
  const problems = FORBIDDEN.filter(({ pattern }) => pattern.test(plain)).map(({ reason, pattern }) => {
    const line = plain.split(/\r?\n/).find((l) => pattern.test(l))?.trim() ?? "";
    return `  • ${reason}: ${line.slice(0, 200)}`;
  });
  if (code !== 0) problems.unshift(`  • the command exited with ${code ?? signal}`);
  if (problems.length > 0) {
    console.error(`\n✖ ${command.join(" ")}\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`\n✔ ${command.join(" ")}: passed, nothing skipped, no unhandled errors or timeouts`);
});
