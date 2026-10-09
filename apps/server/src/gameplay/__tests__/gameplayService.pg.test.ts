// The gameplay service without any transport: a recording publisher shows
// exactly what would be broadcast, and when.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createFixedDice } from "@ludo/game-engine";
import { migrate } from "../../persistence/migrate.js";
import { PostgresGameStore } from "../../persistence/postgresStore.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../../persistence/__tests__/pgHarness.js";
import { RoomService } from "../../rooms/roomService.js";
import type { GamePublisher } from "../gameEvents.js";
import { GameplayError } from "../gameplayErrors.js";
import { GameplayService } from "../gameplayService.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ gameplay service PostgreSQL tests SKIPPED: ${unavailableReason()}`);

let db: TestDatabase;
let store: PostgresGameStore;

beforeAll(async () => {
  if (skip) return;
  db = (await startTestDatabase())!;
  const pool = new pg.Pool({ connectionString: db.url });
  await migrate(pool);
  await pool.end();
  store = PostgresGameStore.connect(db.url);
}, 120_000);

afterAll(async () => {
  await store?.close();
  await db?.dispose();
}, 60_000);

function recorder(): GamePublisher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    roomUpdated: (room) => calls.push(`room:${room.status}:${room.roomVersion}`),
    gameAction: (_roomId, action) => calls.push(`event:${action.type}:${action.stateVersion}`),
    gameState: (_roomId, game) => calls.push(`state:${game.stateVersion}`),
    gameFinished: (_roomId, notice) => calls.push(`finished:${notice.stateVersion}`),
    gamePaused: (_roomId, notice) => calls.push(`paused:${notice.pause.reason}:${notice.roomVersion}`),
    gameResumed: (_roomId, notice) => calls.push(`resumed:${notice.roomVersion}`),
  };
}

async function setup(dice: number[]) {
  const rooms = new RoomService({ store, drawFirstPlayer: () => 0 });
  const publisher = recorder();
  const gameplay = new GameplayService({ store, rooms, dice: createFixedDice(dice), publisher });
  const host = await rooms.createRoom({ hostName: "Asha", maxPlayers: 2 }, { clientKey: "svc" });
  const guest = await rooms.joinRoom({ code: host.room.code, displayName: "Ben" }, { clientKey: "svc" });
  return {
    rooms,
    gameplay,
    publisher,
    hostCredential: host.credential,
    host: await rooms.authenticate(host.credential),
    guest: await rooms.authenticate(guest.credential),
  };
}

describe.skipIf(skip)("GameplayService (no transport)", () => {
  it("publishes each committed action once, in commit order, after the commit", async () => {
    const { gameplay, publisher, host } = await setup([6, 3]);
    await gameplay.start(host, { requestId: "s" });
    const results = await Promise.all([
      gameplay.roll(host, { requestId: "a", expectedStateVersion: 0 }),
      gameplay.roll(host, { requestId: "b", expectedStateVersion: 0 }).catch((e: unknown) => e),
    ]);
    expect(results[1]).toBeInstanceOf(GameplayError);
    expect((results[1] as GameplayError).code).toBe("stale-state");
    await gameplay.move(host, { requestId: "m", expectedStateVersion: 1, tokenId: 0 });
    expect(publisher.calls).toEqual(["room:playing:2", "event:game:start:0", "state:0", "event:game:roll:1", "state:1", "event:game:move:2", "state:2"]);
    expect((await store.getGameSession(host.roomId))!.stateVersion).toBe(2);
  });

  it("publishes nothing for rejected actions", async () => {
    const { gameplay, publisher, host, guest } = await setup([6]);
    await gameplay.start(host, { requestId: "s" });
    publisher.calls.length = 0;
    await expect(gameplay.roll(guest, { requestId: "x", expectedStateVersion: 0 })).rejects.toMatchObject({ code: "not-your-turn" });
    await expect(gameplay.move(host, { requestId: "y", expectedStateVersion: 0, tokenId: 0 })).rejects.toMatchObject({ code: "not-awaiting-move" });
    await expect(gameplay.roll(host, { requestId: "z", expectedStateVersion: 5 })).rejects.toMatchObject({ code: "stale-state", details: { stateVersion: 0 } });
    expect(publisher.calls).toEqual([]);
  });

  it("lets PostgreSQL arbitrate conflicting actions from two independent server processes", async () => {
    const { gameplay, host, hostCredential } = await setup([6]);
    await gameplay.start(host, { requestId: "s" });
    const otherStore = PostgresGameStore.connect(db.url); // another process: its own pool, services and action queue
    try {
      const otherRooms = new RoomService({ store: otherStore });
      const other = new GameplayService({ store: otherStore, rooms: otherRooms, dice: createFixedDice([5]) });
      const otherHost = await otherRooms.authenticate(hostCredential);
      const results = await Promise.allSettled([
        gameplay.roll(host, { requestId: "p1", expectedStateVersion: 0 }),
        other.roll(otherHost, { requestId: "p2", expectedStateVersion: 0 }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
      expect(lost.reason).toMatchObject({ code: "stale-state" });
      expect((await store.listEvents(host.roomId)).filter((e) => e.actionType === "game:roll")).toHaveLength(1);
    } finally {
      await otherStore.close();
    }
  });

  it("pauses only for an absent current player, and resumes only for the awaited one", async () => {
    const { gameplay, publisher, host, guest } = await setup([]);
    await gameplay.start(host, { requestId: "s" });
    publisher.calls.length = 0;
    expect(await gameplay.pauseIfAway(host.roomId, guest.playerId, () => true)).toBeNull(); // not the guest's turn
    expect(await gameplay.pauseIfAway(host.roomId, host.playerId, () => false)).toBeNull(); // the host came back
    const paused = await gameplay.pauseIfAway(host.roomId, host.playerId, () => true);
    expect(paused?.pause).toMatchObject({ reason: "connection-lost", playerId: host.playerId });
    expect(await gameplay.resumeIfAwaited(host.roomId, guest.playerId)).toBeNull();
    expect((await gameplay.resumeIfAwaited(host.roomId, host.playerId))?.status).toBe("playing");
    expect(publisher.calls).toEqual(["room:paused:3", "paused:connection-lost:3", "room:playing:4", "resumed:4"]);
  });

  it("refuses gameplay before the start and makes a retried start a replay", async () => {
    const { gameplay, host, guest } = await setup([]);
    await expect(gameplay.roll(host, { requestId: "early", expectedStateVersion: 0 })).rejects.toMatchObject({ code: "game-not-started" });
    await expect(gameplay.start(guest, { requestId: "g" })).rejects.toMatchObject({ code: "not-host" });
    const first = await gameplay.start(host, { requestId: "start-once" });
    const retry = await gameplay.start(host, { requestId: "start-once" });
    expect(first.replayed).toBe(false);
    expect(retry).toMatchObject({ replayed: true, action: first.action });
    await expect(gameplay.start(host, { requestId: "start-twice" })).rejects.toMatchObject({ code: "game-already-started" });
  });
});
