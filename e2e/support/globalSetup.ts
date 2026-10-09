// Starts the test-only game server (testServer.ts) for the whole run and
// returns its teardown: a graceful shutdown over the control port (works the
// same on Windows, where signals do not), then a forced stop as a last resort.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { control } from "./control";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export default async function globalSetup(): Promise<() => Promise<void>> {
  const child = spawn(process.execPath, ["--import", "tsx", "--conditions=source", "e2e/support/testServer.ts"], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`e2e server did not start within 120 s:\n${output}`)), 120_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("e2e server ready")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    void exited.then((code) => {
      clearTimeout(timer);
      reject(new Error(`e2e server exited (${code}) before it was ready:\n${output}`));
    });
  });
  return async () => {
    await control("POST", "/shutdown").catch(() => undefined);
    const stopped = await Promise.race([exited.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))]);
    if (!stopped) child.kill();
  };
}
