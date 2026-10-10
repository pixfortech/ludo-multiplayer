// Browser end-to-end tests: real Chromium clients against the production
// client build (vite preview), the real Socket.IO server and an isolated
// PostgreSQL (e2e/support). Run after `npm run build`: `npm run test:e2e`.
import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

const CLIENT_PORT = 4173;
const API_PORT = 4310;
// One token per run, shared with the test-only control port (workers inherit it).
process.env.E2E_CONTROL_TOKEN ??= randomBytes(24).toString("hex");
process.env.E2E_API_PORT ??= String(API_PORT);
process.env.E2E_CONTROL_PORT ??= "4311";

export default defineConfig({
  testDir: "e2e/tests",
  // One shared server whose dice queue is global: tests run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 8 * 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  outputDir: "e2e/test-results",
  globalSetup: "./e2e/support/globalSetup.ts",
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    browserName: "chromium",
    // The 3D board renders with WebGL. CI machines have no GPU: opt in to Chromium's software renderer
    // (SwiftShader) explicitly, as the implicit fallback is deprecated.
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run preview -w @ludo/client -- --host 127.0.0.1 --port ${CLIENT_PORT} --strictPort`,
    url: `http://127.0.0.1:${CLIENT_PORT}`,
    env: { LUDO_SERVER_URL: `http://127.0.0.1:${process.env.E2E_API_PORT}` },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
