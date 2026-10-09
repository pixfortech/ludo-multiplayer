// Runs once before the server tests, in the main Vitest process, so its
// output is always visible (Vitest hides console output of skipped files).
// Missing PostgreSQL is reported loudly with setup instructions, and is a
// hard failure when REQUIRE_POSTGRES_TESTS=1.
import { POSTGRES_REQUIRED, postgresAvailable, unavailableReason } from "./src/persistence/__tests__/pgHarness.js";

export default function setup(): void {
  if (postgresAvailable) return;
  const reason = unavailableReason();
  if (POSTGRES_REQUIRED) {
    throw new Error(`REQUIRE_POSTGRES_TESTS=1 but PostgreSQL is not available.\n${reason}`);
  }
  const rule = "─".repeat(78);
  console.warn(`\n${rule}\n⚠  PostgreSQL integration tests will be SKIPPED.\n${reason}\n${rule}\n`);
}
