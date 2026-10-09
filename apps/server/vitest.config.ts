import { defineConfig } from "vitest/config";
import { workspaceSourceResolution } from "../../vitest.shared";

export default defineConfig({
  ...workspaceSourceResolution,
  test: { include: ["src/**/*.test.ts"], environment: "node", globalSetup: ["./vitest.globalSetup.ts"] },
});
