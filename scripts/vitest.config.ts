import { defineConfig } from "vitest/config";

// Repository-level checks (security policy, settings hygiene) that belong to
// no single workspace.
export default defineConfig({
  test: { include: ["scripts/checks/**/*.test.ts"], root: "." },
});
