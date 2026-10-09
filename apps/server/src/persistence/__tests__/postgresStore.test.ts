// PostgreSQL store: the shared contract plus durability, recovery, atomicity
// and corruption tests against a real, disposable PostgreSQL server.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "../migrate.js";
import { PostgresGameStore } from "../postgresStore.js";
import { StoreError } from "../types.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, type TestDatabase } from "./pgHarness.js";
import { advance, expectStoreError, runGameStoreContract, seededRoom } from "./storeContract.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn("⚠ postgresStore tests SKIPPED: no PostgreSQL available");

let db: TestDatabase | null = null;

beforeAll(async () => {
  if (skip) return;
  db = await startTestDatabase();
  const pool = new pg.Pool({ connectionString: db!.url });
  await migrate(pool);
  await pool.end();
}, 120_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

describe.skipIf(skip)("PostgreSQL", () => {
  runGameStoreContract("postgres", async () => {
    const store = PostgresGameStore.connect(db!.url);
    return { store, teardown: () => store.close() };
  });

  describe("recovery", () => {
    it("restores rooms, players, game state and events with a brand-new connection pool", async () => {
      const first = PostgresGameStore.connect(db!.url);
      const { room, host, guest, state } = await seededRoom(first);
      await first.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
      let current = state;
      for (const dice of [6, 6, 3, 2, 6]) {
        const next = advance(current, dice);
        await first.commitGameAction({ roomId: room.id, expectedStateVersion: current.stateVersion, state: next, event: { playerId: null, actionType: "game:roll", requestId: null, payload: { dice } } });
        current = next;
      }
      await first.close(); // every connection gone, like a process exit

      const second = PostgresGameStore.connect(db!.url);
      try {
        expect(await second.getRoom(room.id)).toMatchObject({ status: "playing", code: room.code });
        expect((await second.listPlayers(room.id)).map((p) => p.id)).toEqual([host.id, guest.id]);
        const session = await second.getGameSession(room.id);
        expect(session!.state).toEqual(current);
        expect(session!.stateVersion).toBe(current.stateVersion);
        expect((await second.listEvents(room.id)).map((e) => e.resultStateVersion)).toEqual([0, 1, 2, 3, 4, 5]);
      } finally {
        await second.close();
      }
    });

    it("keeps every committed move after a PostgreSQL crash, and nothing uncommitted", async () => {
      if (!db!.canCrash) {
        console.warn("⚠ crash test SKIPPED: TEST_DATABASE_URL mode has no private cluster to crash");
        return;
      }
      const store = PostgresGameStore.connect(db!.url);
      const { room, host, state } = await seededRoom(store);
      await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
      const committed = advance(state, 6);
      await store.commitGameAction({ roomId: room.id, expectedStateVersion: 0, state: committed, event: { playerId: host.id, actionType: "game:roll", requestId: "before-crash", payload: {} } });

      // An in-flight transaction that never commits.
      const inflight = new pg.Client({ connectionString: db!.url });
      await inflight.connect();
      inflight.on("error", () => undefined); // the crash will sever this connection
      await inflight.query("BEGIN");
      await inflight.query("UPDATE rooms SET name = 'uncommitted' WHERE id = $1", [room.id]);

      await db!.crash(); // immediate shutdown: no checkpoint, WAL recovery on restart
      await store.close().catch(() => undefined);
      await inflight.end().catch(() => undefined);
      await db!.restart();

      const recovered = PostgresGameStore.connect(db!.url);
      try {
        const session = await recovered.getGameSession(room.id);
        expect(session!.state).toEqual(committed);
        expect(await recovered.findEventByRequest(room.id, host.id, "before-crash")).toMatchObject({ resultStateVersion: committed.stateVersion });
        expect((await recovered.getRoom(room.id))!.name).not.toBe("uncommitted");
      } finally {
        await recovered.close();
      }
    }, 120_000);
  });

  describe("atomicity and integrity", () => {
    it("rolls back the state update and event when a later step of the commit fails", async () => {
      const store = PostgresGameStore.connect(db!.url);
      try {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        // An invalid room status violates a CHECK constraint after the session UPDATE and event INSERT ran.
        const attempt = store.commitGameAction({
          roomId: room.id,
          expectedStateVersion: 0,
          state: advance(state),
          event: { playerId: host.id, actionType: "game:roll", requestId: "will-roll-back", payload: {} },
          roomStatus: "bogus" as never,
        });
        await expect(attempt).rejects.toThrow();
        expect((await store.getGameSession(room.id))!.stateVersion).toBe(0);
        expect(await store.findEventByRequest(room.id, host.id, "will-roll-back")).toBeNull();
        expect(await store.listEvents(room.id)).toHaveLength(1);
      } finally {
        await store.close();
      }
    });

    it("refuses to load a corrupted stored snapshot", async () => {
      const store = PostgresGameStore.connect(db!.url);
      const raw = new pg.Client({ connectionString: db!.url });
      await raw.connect();
      try {
        const { room, host, state } = await seededRoom(store);
        await store.startGame(room.id, room.roomVersion, state, { playerId: host.id, actionType: "game:start", requestId: null, payload: {} });
        await raw.query(`UPDATE game_sessions SET state = jsonb_set(state, '{currentPlayerIndex}', '9') WHERE room_id = $1`, [room.id]);
        await expectStoreError(store.getGameSession(room.id), "invalid-state");
        await raw.query(`UPDATE game_sessions SET state_version = 99 WHERE room_id = $1`, [room.id]);
        const error = await store.getGameSession(room.id).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(StoreError);
      } finally {
        await raw.end();
        await store.close();
      }
    });

    it("never writes a credential secret to the database", async () => {
      const store = PostgresGameStore.connect(db!.url);
      const raw = new pg.Client({ connectionString: db!.url });
      await raw.connect();
      try {
        const { host } = await seededRoom(store);
        const { rows } = await raw.query("SELECT row_to_json(p)::text AS row FROM players p WHERE id = $1", [host.id]);
        expect(rows[0].row).not.toContain(host.secret);
        const dump = await raw.query(`SELECT concat_ws('|',
          (SELECT json_agg(r)::text FROM rooms r), (SELECT json_agg(p)::text FROM players p),
          (SELECT json_agg(g)::text FROM game_sessions g), (SELECT json_agg(e)::text FROM game_events e)) AS everything`);
        expect(String(dump.rows[0].everything)).toContain(host.id); // sanity: the dump really includes the player
        expect(String(dump.rows[0].everything)).not.toContain(host.secret);
      } finally {
        await raw.end();
        await store.close();
      }
    });

    it("enforces the room-code format and version constraints in the database itself", async () => {
      const raw = new pg.Client({ connectionString: db!.url });
      await raw.connect();
      try {
        await expect(
          raw.query(`INSERT INTO rooms (id, code, max_players, visibility, settings, status) VALUES (gen_random_uuid(), 'abc0O1', 4, 'private', '{}', 'lobby')`),
        ).rejects.toThrow(/rooms_code_format/);
        await expect(
          raw.query(`INSERT INTO rooms (id, code, max_players, visibility, settings, status) VALUES (gen_random_uuid(), 'ABCDEF', 16, 'private', '{}', 'lobby')`),
        ).rejects.toThrow(/max_players/);
      } finally {
        await raw.end();
      }
    });
  });
});
