// The room service on a real, disposable PostgreSQL: the full behaviour suite
// (including true concurrent races), plus durability, rollback, outage and
// database-level enforcement tests.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { ROOM_STATUS_TRANSITIONS, canTransitionRoom, type RoomStatus } from "@ludo/shared-types";
import { migrate } from "../../persistence/migrate.js";
import { PostgresGameStore } from "../../persistence/postgresStore.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../../persistence/__tests__/pgHarness.js";
import { RoomError } from "../errors.js";
import { generateRoomCode } from "../roomCode.js";
import { ctx, expectRoomError, runRoomServiceSuite, serviceFor } from "./roomServiceSuite.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ room service PostgreSQL tests SKIPPED: ${unavailableReason()}`);

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

/** A pool whose connections fail any statement matching `failOn`, to break a transaction part-way. */
function faultyPool(url: string, failOn: RegExp): pg.Pool {
  class FaultyClient extends pg.Client {
    override query(...args: unknown[]): never {
      const first = args[0] as string | { text?: string };
      const text = typeof first === "string" ? first : first?.text;
      if (typeof text === "string" && failOn.test(text)) {
        const error = new Error("injected failure");
        const callback = args[args.length - 1];
        if (typeof callback === "function") {
          process.nextTick(() => (callback as (e: Error) => void)(error));
          return undefined as never;
        }
        return Promise.reject(error) as never;
      }
      return (super.query as (...a: unknown[]) => never)(...args);
    }
  }
  return new pg.Pool({ connectionString: url, Client: FaultyClient });
}

async function withRaw<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: db!.url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

describe.skipIf(skip)("PostgreSQL", () => {
  runRoomServiceSuite("postgres", async () => {
    const store = PostgresGameStore.connect(db!.url);
    return { store, teardown: () => store.close() };
  });

  describe("durability, atomicity and enforcement", () => {
    it("reloads rooms, members and credentials after create/join with a brand-new connection pool", async () => {
      const first = PostgresGameStore.connect(db!.url);
      const a = serviceFor(first);
      const host = await a.createRoom({ hostName: "Aman", maxPlayers: 3, roomName: "Reload", colour: "golden" }, ctx);
      const guest = await a.joinRoom({ code: host.room.code, displayName: "Ben" }, ctx);
      const previewBefore = await a.previewRoom(host.room.code, ctx);
      await first.close(); // every connection gone, like a process restart

      const second = PostgresGameStore.connect(db!.url);
      try {
        const b = serviceFor(second);
        expect(await b.previewRoom(host.room.code, ctx)).toEqual(previewBefore);
        const hostActor = await b.authenticate(host.credential);
        const guestActor = await b.authenticate(guest.credential);
        const view = await b.getRoomView(guestActor);
        expect(view).toMatchObject({ roomId: host.room.roomId, roomVersion: 1, hostPlayerId: host.player.playerId, name: "Reload" });
        expect(view.players.map((p) => [p.displayName, p.seat, p.colour])).toEqual([
          ["Ben", 1, "royal-blue"],
          ["Aman", 3, "golden"],
        ]);
        expect((await b.startGame(hostActor)).room.status).toBe("playing");
      } finally {
        await second.close();
      }
    });

    it("rolls back a room creation that fails part-way: no room, no orphan host", async () => {
      const store = new PostgresGameStore(faultyPool(db!.url, /INSERT INTO players/));
      try {
        const marker = `Rollback ${randomUUID().slice(0, 8)}`;
        await expect(serviceFor(store).createRoom({ hostName: "Ghost Host", maxPlayers: 2, roomName: marker }, ctx)).rejects.toThrow("injected failure");
        const counts = await withRaw((c) =>
          c.query("SELECT (SELECT count(*)::int FROM rooms WHERE name = $1) AS rooms, (SELECT count(*)::int FROM players WHERE display_name = 'Ghost Host') AS players", [marker]),
        );
        expect(counts.rows[0]).toEqual({ rooms: 0, players: 0 });
      } finally {
        await store.close();
      }
    });

    it("rolls back a join that fails part-way: no player, no version change", async () => {
      const good = PostgresGameStore.connect(db!.url);
      const broken = new PostgresGameStore(faultyPool(db!.url, /UPDATE rooms SET/)); // fails after the player INSERT
      try {
        const host = await serviceFor(good).createRoom({ hostName: "Aman", maxPlayers: 4 }, ctx);
        await expect(serviceFor(broken).joinRoom({ code: host.room.code, displayName: "Ghost" }, ctx)).rejects.toThrow("injected failure");
        expect((await good.getRoom(host.room.roomId))!.roomVersion).toBe(0);
        expect((await good.listPlayers(host.room.roomId, { includeLeft: true })).map((p) => p.displayName)).toEqual(["Aman"]);
        // The room is still fully usable.
        expect((await serviceFor(good).joinRoom({ code: host.room.code, displayName: "Ghost" }, ctx)).room.roomVersion).toBe(1);
      } finally {
        await good.close();
        await broken.close();
      }
    });

    it("reports an unreachable database as storage-unavailable without leaking connection details", async () => {
      const store = PostgresGameStore.connect("postgres://ludo:Sup3rSecretPw@127.0.0.1:1/ludo", { connectionTimeoutMillis: 2000 });
      try {
        const error = await expectRoomError(serviceFor(store).previewRoom(generateRoomCode(), ctx), "storage-unavailable");
        const json = JSON.stringify(error.toJSON());
        expect(json).not.toContain("Sup3rSecretPw");
        expect(json).not.toContain("127.0.0.1");
        expect(error).toBeInstanceOf(RoomError);
      } finally {
        await store.close();
      }
    });

    it("never writes a credential secret to the database", async () => {
      const store = PostgresGameStore.connect(db!.url);
      try {
        const host = await serviceFor(store).createRoom({ hostName: "Aman", maxPlayers: 2 }, ctx);
        const guest = await serviceFor(store).joinRoom({ code: host.room.code, displayName: "Ben" }, ctx);
        const dump = await withRaw((c) =>
          c.query(`SELECT concat_ws('|', (SELECT json_agg(r)::text FROM rooms r), (SELECT json_agg(p)::text FROM players p),
                    (SELECT json_agg(g)::text FROM game_sessions g), (SELECT json_agg(e)::text FROM game_events e)) AS everything`),
        );
        const everything = String(dump.rows[0].everything);
        expect(everything).toContain(guest.player.playerId); // sanity: the dump includes the players
        expect(everything).not.toContain(host.credential.secret);
        expect(everything).not.toContain(guest.credential.secret);
      } finally {
        await store.close();
      }
    });

    it("enforces exactly ROOM_STATUS_TRANSITIONS in the database trigger, for every pair", async () => {
      const statuses = Object.keys(ROOM_STATUS_TRANSITIONS) as RoomStatus[];
      const mismatches: string[] = [];
      await withRaw(async (c) => {
        await c.query("BEGIN");
        try {
          await expect(
            c.query(`INSERT INTO rooms (id, code, max_players, visibility, settings, status) VALUES ($1, $2, 4, 'private', '{"maxPlayers":4}', 'playing')`, [randomUUID(), generateRoomCode()]),
          ).rejects.toMatchObject({ code: "LD001" });
          await c.query("ROLLBACK");
          await c.query("BEGIN");
          // One room per starting status, put there directly with the trigger switched off.
          const ids = new Map(statuses.map((s) => [s, randomUUID()]));
          for (const id of ids.values()) {
            await c.query(`INSERT INTO rooms (id, code, max_players, visibility, settings, status) VALUES ($1, $2, 4, 'private', '{"maxPlayers":4}', 'lobby')`, [id, generateRoomCode()]);
          }
          await c.query("SET CONSTRAINTS ALL IMMEDIATE"); // flush deferred FK checks so the table can be altered
          await c.query("ALTER TABLE rooms DISABLE TRIGGER rooms_status_transition");
          for (const [status, id] of ids) {
            await c.query(`UPDATE rooms SET status = $2, archived_at = CASE WHEN $2 = 'archived' THEN now() END,
               pause_reason = CASE WHEN $2 = 'paused' THEN 'host' END, paused_at = CASE WHEN $2 = 'paused' THEN now() END WHERE id = $1`, [id, status]);
          }
          await c.query("ALTER TABLE rooms ENABLE TRIGGER rooms_status_transition");
          for (const from of statuses) {
            const id = ids.get(from)!;
            for (const to of statuses) {
              await c.query("SAVEPOINT attempt");
              let allowed = true;
              try {
                await c.query(`UPDATE rooms SET status = $2, archived_at = CASE WHEN $2 = 'archived' THEN now() END,
               pause_reason = CASE WHEN $2 = 'paused' THEN 'host' END, paused_at = CASE WHEN $2 = 'paused' THEN now() END WHERE id = $1`, [id, to]);
              } catch (error) {
                if ((error as { code?: string }).code !== "LD001") throw error;
                allowed = false;
              }
              await c.query("ROLLBACK TO SAVEPOINT attempt");
              if (allowed !== (from === to || canTransitionRoom(from, to))) mismatches.push(`${from}→${to}: database ${allowed ? "allows" : "refuses"}`);
            }
          }
        } finally {
          await c.query("ROLLBACK"); // leaves no trace, trigger state included
        }
      });
      expect(mismatches).toEqual([]);
    });

    it("keeps archive state and capacity consistent in the database itself", async () => {
      await withRaw(async (c) => {
        await expect(
          c.query(`INSERT INTO rooms (id, code, max_players, visibility, settings, status) VALUES ($1, $2, 4, 'private', '{"maxPlayers":3}', 'lobby')`, [randomUUID(), generateRoomCode()]),
        ).rejects.toThrow(/rooms_settings_max_players/);
        await expect(
          c.query(`INSERT INTO rooms (id, code, max_players, visibility, settings, status, archived_at) VALUES ($1, $2, 4, 'private', '{"maxPlayers":4}', 'lobby', now())`, [randomUUID(), generateRoomCode()]),
        ).rejects.toThrow(/rooms_archived_consistent/);
      });
    });
  });
});
