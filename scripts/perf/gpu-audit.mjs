// Measures the 2D board, the classic 2.5D/3D board and the Kolkata 3D city on
// this machine's real GPU, in the installed Chrome (headed), with the same
// browser test the CI runs on software WebGL (e2e/tests/board3d-performance).
//
//   npm run perf:gpu                    (Chrome)
//   npm run perf:gpu -- --channel msedge (Microsoft Edge)
//
// Needs what the browser tests need (PostgreSQL 17 binaries; see
// docs/qa/gpu-performance.md). Writes perf-results/gpu-<timestamp>.json and
// prints a summary. Works the same on Windows and Linux (no shell features).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const channelArg = process.argv.indexOf("--channel");
const channel = channelArg > 0 ? process.argv[channelArg + 1] : "chrome";
const outDir = join(process.cwd(), "perf-results");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `gpu-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

/** Runs a command through the platform shell (npm/npx resolve to .cmd shims on Windows), quoting every argument. */
function run(args, env = {}) {
  const quote = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : process.platform === "win32" ? `"${a.replace(/"/g, '\\"')}"` : `'${a.replace(/'/g, "'\\''")}'`);
  return new Promise((resolve, reject) => {
    const child = spawn(args.map(quote).join(" "), { shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`))));
  });
}

await run(["npm", "run", "build"]);
await run(["npx", "playwright", "test", "e2e/tests/board3d-performance.spec.ts"], { E2E_GPU: "1", E2E_GPU_CHANNEL: channel, E2E_PERF_OUT: out });

const samples = JSON.parse(readFileSync(out, "utf8"));
console.log(`\nGPU: ${samples.find((s) => s.gpu)?.gpu ?? "unknown"}`);
console.table(
  samples.map((s) => ({
    view: s.view,
    "first frame ms": s.firstFrameMs,
    "idle fps": s.idleFps,
    "move fps": s.moveFps,
    "worst move frame ms": s.moveWorstFrameMs,
    "main thread idle %": s.settledBusyPct ?? s.idleBusyPct,
    "main thread move %": s.moveBusyPct,
    "tap → request ms": s.tapToRequestMs,
    ambient: s.ambient ?? "",
    "characters ready ms": s.charactersReadyMs ?? "",
    "character anim ms/frame": s.characterMs ?? "",
    "draw calls": s.glCalls ?? "",
    triangles: s.glTriangles ?? "",
  })),
);
console.log(`\nSaved: ${out}\nPlease send this file back (it holds no personal data: timings, counts and the GPU's name).`);
