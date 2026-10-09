// Controlled load and stability: many rooms playing at once on one server
// and one connection pool, bursts of duplicate requests, and connection
// churn. Measures acknowledgement latency and throughput and checks that
// ordering, convergence and resource usage hold under load.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameActionView, GameStateView } from "@ludo/shared-types";
import { projectGameState } from "../gameplay/stateProjection.js";
import { migrate } from "../persistence/migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../persistence/__tests__/pgHarness.js";
import { ask, closeAllClients, expectOk, open, rid, seatTwo, seededDieValues, startTestServer, waitUntil, type Table, type TestServer } from "../socket/__tests__/realtimeHarness.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ load PostgreSQL tests SKIPPED: ${unavailableReason()}`);

const ROOMS = 20;
const ACTIONS_PER_ROOM = 30;
/** Generous bound for a shared CI runner (Windows included); typical values are far lower and are printed. */
const P95_LIMIT_MS = 1500;
// Hundreds of concurrent round trips through sockets and PostgreSQL need more than the default 5 s.
const LOAD_TIMEOUT_MS = 180_000;

let db: TestDatabase;
let t: TestServer;

beforeAll(async () => {
  if (skip) return;
  db = (await startTestDatabase())!;
  const pool = new pg.Pool({ connectionString: db.url });
  await migrate(pool);
  await pool.end();
  t = await startTestServer(db.url);
}, 120_000);

afterAll(async () => {
  closeAllClients();
  await t?.close();
  await db?.dispose();
}, 60_000);

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;

async function playRoom(table: Table, actions: number, latencies: number[]): Promise<GameStateView> {
  const byId = new Map([
    [table.host.id, table.host],
    [table.guest.id, table.guest],
  ]);
  let game = expectOk(await ask(table.host.client, "room:getState", { requestId: rid() })).game!;
  for (let i = 0; i < actions && game.phase === "playing"; i++) {
    const actor = byId.get(game.currentPlayerId!)!;
    const started = performance.now();
    const ack =
      game.turn.phase === "awaiting-roll"
        ? await ask(actor.client, "game:roll", { requestId: rid("r"), expectedStateVersion: game.stateVersion })
        : await ask(actor.client, "game:move", { requestId: rid("m"), expectedStateVersion: game.stateVersion, tokenId: game.turn.legalMoves[0]!.tokenId });
    latencies.push(performance.now() - started);
    game = expectOk(ack).game;
  }
  return game;
}

describe.skipIf(skip)("load and stability", () => {
  it(`keeps ${ROOMS} simultaneous games ordered, consistent and responsive`, async () => {
    t.dice.push(...seededDieValues(99, 20_000));
    const tables = await Promise.all(Array.from({ length: ROOMS }, () => seatTwo(t)));
    const latencies: number[] = [];
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    const finals = await Promise.all(tables.map((table) => playRoom(table, ACTIONS_PER_ROOM, latencies)));
    const elapsed = performance.now() - started;

    for (const [i, table] of tables.entries()) {
      const final = finals[i]!;
      for (const c of [table.host, table.guest]) {
        await c.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === final.stateVersion, 10_000);
        // Every version exactly once and in order, every action in sequence, under concurrent load.
        expect(c.rec.of<{ game: GameStateView }>("game:state").map((s) => s.game.stateVersion)).toEqual([...Array(final.stateVersion + 1).keys()]);
        expect(c.rec.of<{ action: GameActionView }>("game:event").map((e) => e.action.seq)).toEqual([...Array(final.stateVersion + 1).keys()].map((v) => v + 1));
        expect(c.rec.latestState()).toEqual(final);
      }
      expect(projectGameState((await t.store.getGameSession(table.roomId))!.state)).toEqual(final);
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const stats = t.pgStore.poolStats();
    console.log(
      `load: rooms=${ROOMS} clients=${ROOMS * 2} actions=${latencies.length} wallMs=${elapsed.toFixed(0)} ` +
        `throughput=${((latencies.length / elapsed) * 1000).toFixed(1)}/s ackLatencyMs p50=${percentile(sorted, 50).toFixed(1)} ` +
        `p95=${percentile(sorted, 95).toFixed(1)} p99=${percentile(sorted, 99).toFixed(1)} max=${sorted.at(-1)!.toFixed(1)} ` +
        `pool=${JSON.stringify(stats)} heapDeltaMB=${((process.memoryUsage().heapUsed - heapBefore) / 1e6).toFixed(1)}`,
    );
    expect(latencies).toHaveLength(ROOMS * ACTIONS_PER_ROOM);
    expect(percentile(sorted, 95)).toBeLessThan(P95_LIMIT_MS);
    expect(stats.waiting).toBe(0);
    expect(stats.total).toBeLessThanOrEqual(10);
    expect(t.logs.filter((l) => l.includes("internal error"))).toEqual([]);
    for (const table of tables) {
      table.host.client.close();
      table.guest.client.close();
    }
  }, LOAD_TIMEOUT_MS);

  it("executes one action for a burst of 25 identical requests", async () => {
    const table = await seatTwo(t);
    t.dice.push(6);
    const copies = await Promise.all(Array.from({ length: 25 }, () => ask(table.host.client, "game:roll", { requestId: "burst", expectedStateVersion: 0 })));
    const data = copies.map((c) => expectOk(c));
    expect(data.filter((d) => !d.replayed)).toHaveLength(1);
    expect(new Set(data.map((d) => d.action.seq))).toEqual(new Set([2]));
    expect((await t.store.listEvents(table.roomId)).filter((e) => e.actionType === "game:roll")).toHaveLength(1);
  }, LOAD_TIMEOUT_MS);

  it("stays stable through 100 reconnect cycles: no leaked seats, players or connections", async () => {
    const table = await seatTwo(t);
    table.guest.client.close();
    await waitUntil(() => !t.server.realtime!.sessions.isControlled(table.guest.id), "the guest's seat is released");
    const started = performance.now();
    for (let i = 0; i < 100; i++) {
      const c = await open(t.url);
      expectOk(await ask(c.client, "room:resume", { requestId: rid(), credential: table.guest.credential }));
      c.client.close();
      await waitUntil(() => !t.server.realtime!.sessions.isControlled(table.guest.id), `cycle ${i}: the seat is released`);
    }
    const perCycle = (performance.now() - started) / 100;
    await waitUntil(async () => (await t.store.getPlayer(table.guest.id))!.connectionStatus === "disconnected", "presence settles");
    expect(await t.store.listPlayers(table.roomId)).toHaveLength(2);
    expect(t.server.io.engine.clientsCount).toBeLessThanOrEqual(2 + 1); // the host, plus at most a closing socket
    const stats = t.pgStore.poolStats();
    expect(stats.waiting).toBe(0);
    console.log(`churn: 100 resume/close cycles, ${perCycle.toFixed(1)} ms per cycle, pool=${JSON.stringify(stats)}`);
  }, LOAD_TIMEOUT_MS);
});
