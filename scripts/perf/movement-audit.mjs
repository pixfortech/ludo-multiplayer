// Measures token movement as the player sees it (the roll, a six's departure, a six-cell walk: click to
// motion, click to arrival, frames drawn, stalls, frame times, main-thread long frames, the board's own
// frame work) in every board view and quality, on this machine's real GPU in the installed Chrome (headed),
// with the same browser test the CI runs on software WebGL (e2e/tests/movement-timing.spec.ts).
//
//   npm run perf:movement                     (Chrome)
//   npm run perf:movement -- --channel msedge  (Microsoft Edge)
//
// Needs what the browser tests need (PostgreSQL 17 binaries; see docs/qa/gpu-performance.md). Writes
// perf-results/movement-<timestamp>.json and prints a summary. Works the same on Windows and Linux.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const channelArg = process.argv.indexOf("--channel");
const channel = channelArg > 0 ? process.argv[channelArg + 1] : "chrome";
const outDir = join(process.cwd(), "perf-results");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `movement-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

/** Runs a command through the platform shell (npm/npx resolve to .cmd shims on Windows), quoting every argument. */
function run(args, env = {}) {
  const quote = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : process.platform === "win32" ? `"${a.replace(/"/g, '\\"')}"` : `'${a.replace(/'/g, "'\\''")}'`);
  return new Promise((resolve, reject) => {
    const child = spawn(args.map(quote).join(" "), { shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`))));
  });
}

await run(["npm", "run", "build"]);
await run(["npx", "playwright", "test", "e2e/tests/movement-timing.spec.ts", "--workers=1"], { E2E_GPU: "1", E2E_GPU_CHANNEL: channel, MOVEMENT_ALL: "1", MOVEMENT_OUT: out });

const results = JSON.parse(readFileSync(out, "utf8"));
console.log(`\nGPU: ${results.find((r) => r.gpu)?.gpu ?? "unknown"}`);
console.table(
  results.map((r) => ({
    view: r.config,
    "roll → value ms": r.dieMs,
    "move click → motion ms": r.walk6.clickToMotionMs,
    "six cells: click → arrival ms": r.walk6.clickToArrivalMs,
    "six cells: travel ms": r.walk6.travelMs,
    "frames drawn": r.walk6.drawnFrames,
    "longest stall ms": r.walk6.longestStallMs,
    "frame avg / p95 / p99 ms": `${r.walk6.frameAvgMs} / ${r.walk6.frameP95Ms} / ${r.walk6.frameP99Ms}`,
    "board work avg / max ms": r.walk6.travelWorkAvgMs === null ? "" : `${r.walk6.travelWorkAvgMs} / ${r.walk6.travelWorkMaxMs}`,
    "characters ms/frame": r.walk6.travelCharacterAvgMs ?? "",
    "long frames ms (wait / travel)": `${r.walk6.waitLongFramesMs} / ${r.walk6.travelLongFramesMs}`,
    "departure click → arrival ms": r.departure.clickToArrivalMs,
    "draw calls": r.gl?.calls ?? "",
  })),
);
console.log(`\nSaved: ${out}\nPlease send this file back (it holds no personal data: timings, counts and the GPU's name).`);
