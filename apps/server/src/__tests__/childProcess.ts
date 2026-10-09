// Helpers for tests that run the real server as a separate process.
import { createRequire } from "node:module";
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
