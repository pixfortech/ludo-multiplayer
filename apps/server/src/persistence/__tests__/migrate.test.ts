// Migration runner against a real, disposable PostgreSQL server.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { MIGRATIONS, MigrationError, migrate, migrationStatus } from "../migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, type TestDatabase } from "./pgHarness.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
let db: TestDatabase | null = null;
let pool: pg.Pool;

beforeAll(async () => {
  if (skip) return;
  db = await startTestDatabase();
  pool = new pg.Pool({ connectionString: db!.url });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await db?.dispose();
}, 60_000);

describe.skipIf(skip)("migrations", () => {
  it("apply once to an empty database, even when several servers start together", async () => {
    const pools = [0, 1, 2].map(() => new pg.Pool({ connectionString: db!.url }));
    try {
      const results = await Promise.all(pools.map((p) => migrate(p)));
      expect(results.flatMap((r) => r.applied)).toEqual(MIGRATIONS.map((m) => m.id));
    } finally {
      await Promise.all(pools.map((p) => p.end()));
    }
  });

  it("are idempotent", async () => {
    expect(await migrate(pool)).toEqual({ applied: [] });
  });

  it("report no drift once applied (the check the server runs at startup)", async () => {
    expect(await migrationStatus(pool)).toEqual({ pending: [], modified: [], unknown: [] });
    expect((await migrationStatus(pool, [...MIGRATIONS, { id: "0003_next", sql: "SELECT 1" }])).pending).toEqual(["0003_next"]);
  });

  it("create the expected tables, keys and indexes", async () => {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    expect(tables.rows.map((r) => r.table_name)).toEqual(["game_events", "game_sessions", "players", "rooms", "schema_migrations"]);
    const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
    const names = indexes.rows.map((r) => r.indexname);
    for (const name of ["rooms_code_key", "players_active_seat_idx", "players_active_colour_idx", "players_active_name_idx", "game_events_seq_key", "game_events_request_idx"]) {
      expect(names).toContain(name);
    }
  });

  it("refuse to run when an applied migration was edited", async () => {
    const edited = MIGRATIONS.map((m) => ({ ...m, sql: `${m.sql}\n-- edited` }));
    await expect(migrate(pool, edited)).rejects.toThrow(MigrationError);
  });

  it("refuse to run when the database is newer than the code", async () => {
    await pool.query("INSERT INTO schema_migrations (id, checksum) VALUES ('9999_future', 'x')");
    try {
      await expect(migrate(pool)).rejects.toThrow(/does not know/);
    } finally {
      await pool.query("DELETE FROM schema_migrations WHERE id = '9999_future'");
    }
  });

  it("roll back a failing migration completely", async () => {
    const failing = [...MIGRATIONS, { id: "0002_broken", sql: "CREATE TABLE half_done (id int); SELECT 1/0;" }];
    await expect(migrate(pool, failing)).rejects.toThrow(/0002_broken failed/);
    const exists = await pool.query("SELECT to_regclass('public.half_done') AS t");
    expect(exists.rows[0].t).toBeNull();
    const recorded = await pool.query("SELECT id FROM schema_migrations WHERE id = '0002_broken'");
    expect(recorded.rows).toHaveLength(0);
  });
});
