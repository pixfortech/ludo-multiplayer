// Helpers for tests that run the real server as a separate process.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_DIR = fileURLToPath(new URL("../..", import.meta.url));
export const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");

/**
 * The minimum a child Node process needs: PATH everywhere, plus the Windows
 * system variables without which Node cannot start networking or find temp
 * directories. Deliberately excludes DATABASE_URL and everything else.
 */
export function baseChildEnv(): Record<string, string> {
  const names = ["PATH", ...(process.platform === "win32" ? ["SystemRoot", "windir", "TEMP", "TMP", "PATHEXT", "ComSpec", "USERPROFILE"] : [])];
  const env: Record<string, string> = {};
  for (const name of names) {
    const key = Object.keys(process.env).find((k) => k.toUpperCase() === name.toUpperCase());
    if (key && process.env[key] !== undefined) env[name] = process.env[key]!;
  }
  return env;
}

export interface ServerProcess {
  url: string;
  /** Everything the process printed so far. */
  output(): string;
  /** Stops it (SIGTERM) and waits for it to exit. */
  stop(): Promise<void>;
}

/**
 * Starts the real server entry point as a separate process: source mode
 * (tsx src/server.ts) or, with `compiled`, node dist/server.js.
 */
export async function spawnServer(databaseUrl: string, options: { compiled?: boolean; env?: Record<string, string> } = {}): Promise<ServerProcess> {
  const entry = options.compiled ? [join(SERVER_DIR, "dist", "server.js")] : [TSX_CLI, "--conditions=source", "src/server.ts"];
  if (options.compiled && !existsSync(entry[0]!)) throw new Error("A compiled server is needed: run npm run build first");
  const child: ChildProcess = spawn(process.execPath, entry, {
    cwd: SERVER_DIR,
    windowsHide: true,
    env: { ...baseChildEnv(), PORT: "0", DATABASE_URL: databaseUrl, ...options.env },
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 60_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const m = /listening on http:\/\/localhost:(\d+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}:\n${output}`));
    });
  });
  return {
    url,
    output: () => output,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGTERM");
      await exited;
    },
  };
}
