// Database maintenance CLI.
//   npm run db:migrate -w @ludo/server     (uses DATABASE_URL)
// The connection string is never printed.

import pg from "pg";
import { loadConfig } from "../config.js";
import { redactSecrets } from "../redact.js";
import { migrate } from "./migrate.js";

async function main(command: string | undefined): Promise<void> {
  const { databaseUrl } = loadConfig();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (command !== "migrate") throw new Error(`Unknown command "${command ?? ""}". Usage: cli.ts migrate`);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  pool.on("error", () => undefined); // a dropped idle connection surfaces on the next query instead of crashing
  try {
    const { applied } = await migrate(pool);
    console.log(applied.length > 0 ? `Applied migrations: ${applied.join(", ")}` : "Database is up to date");
  } finally {
    await pool.end();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  console.error(`db: ${redactSecrets((error as Error).message)}`);
  process.exit(1);
});
