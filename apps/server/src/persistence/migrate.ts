// Forward-only migration runner. Each migration runs in its own transaction;
// applied migrations are recorded with a checksum, and an advisory lock
// prevents two server processes from migrating at the same time.

import { createHash } from "node:crypto";
import type { Pool } from "pg";
import * as m0001 from "./migrations/0001_initial.js";

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [m0001];

/** Arbitrary constant key for pg_advisory_lock ("LUDO"). */
const MIGRATION_LOCK_KEY = 0x4c55444f;

export class MigrationError extends Error {
  override name = "MigrationError";
}

const checksum = (sql: string) => createHash("sha256").update(sql).digest("hex");

export async function migrate(pool: Pool, migrations: readonly Migration[] = MIGRATIONS): Promise<{ applied: string[] }> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ id: string; checksum: string }>("SELECT id, checksum FROM schema_migrations");
    const done = new Map(rows.map((r) => [r.id, r.checksum]));

    const known = new Set(migrations.map((m) => m.id));
    const unknown = [...done.keys()].filter((id) => !known.has(id));
    if (unknown.length > 0) throw new MigrationError(`Database has migrations this server does not know: ${unknown.join(", ")}`);

    for (const migration of migrations) {
      const sum = checksum(migration.sql);
      const recorded = done.get(migration.id);
      if (recorded !== undefined) {
        if (recorded !== sum) throw new MigrationError(`Migration ${migration.id} was changed after it was applied`);
        continue;
      }
      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [migration.id, sum]);
        await client.query("COMMIT");
        applied.push(migration.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new MigrationError(`Migration ${migration.id} failed: ${(error as Error).message}`);
      }
    }
    return { applied };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
