// Phase 2D: resume, single-seat control, credential rotation, automatic
// pause/resume and retention — with real Socket.IO clients against a real
// server and PostgreSQL. The reconnect grace period runs on a manual clock:
// tests check that the timer is armed or cancelled and fire it explicitly,
// so nothing depends on real-time waits or timer resolution. (The real
// timer is exercised by the multi-process restart test.)
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameActionView, GameStateView, PauseInfo, PlayerSessionCredential, RoomView } from "@ludo/shared-types";
import { projectGameState } from "../../gameplay/stateProjection.js";
import { migrate } from "../../persistence/migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../../persistence/__tests__/pgHarness.js";
import { RetentionSweeper } from "../../rooms/retention.js";
import {
  ManualScheduler,
  ask,
  askRaw,
  closeAllClients,
  expectError,
  expectOk,
  open,
  rid,
  seatTwo,
  startTestServer,
  waitUntil,
  type Client,
  type Connected,
  type TestServer,
} from "./realtimeHarness.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ session PostgreSQL tests SKIPPED: ${unavailableReason()}`);

let db: TestDatabase;
let t: TestServer;
const clock = new ManualScheduler();

beforeAll(async () => {
  if (skip) return;
  db = (await startTestDatabase())!;
  const pool = new pg.Pool({ connectionString: db.url });
  await migrate(pool);
  await pool.end();
  t = await startTestServer(db.url, { graceScheduler: clock });
}, 120_000);

beforeEach(() => clock.clear()); // timers armed for other tests' rooms never fire into this one

afterAll(async () => {
  closeAllClients();
  await t?.close();
  await db?.dispose();
}, 60_000);

/** Kept for readability at call sites; every client is closed in afterAll whether or not it is tracked. */
const track = <T extends { client: Client }>(x: T): T => x;
const roll = (client: Client, expectedStateVersion: number, requestId = rid("roll")) => ask(client, "game:roll", { requestId, expectedStateVersion });
const move = (client: Client, expectedStateVersion: number, tokenId: number, requestId = rid("move")) =>
  ask(client, "game:move", { requestId, expectedStateVersion, tokenId });
const resume = (client: Client, credential: PlayerSessionCredential, extra: { takeover?: boolean; knownStateVersion?: number } = {}) =>
  ask(client, "room:resume", { requestId: rid("resume"), credential, ...extra });

/** A fresh connection that resumes a seat: what a refreshed or reopened browser does. */
async function reopen(credential: PlayerSessionCredential, extra: { takeover?: boolean; knownStateVersion?: number } = {}): Promise<Connected> {
  const c = track(await open(t.url));
  expectOk(await resume(c.client, credential, extra));
  return c;
}

/**
 * Closes a client and waits until the server has fully processed the
 * disconnect: the seat is released and "disconnected" is committed.
 */
async function drop(conn: Connected, playerId: string): Promise<void> {
  conn.client.close();
  await waitUntil(
    async () => !t.server.realtime!.registry.isControlled(playerId) && (await t.store.getPlayer(playerId))!.connectionStatus === "disconnected",
    `the server has released ${playerId}'s seat`,
  );
}

/** Waits until the reconnect monitor has armed the grace timer for `playerId`. */
const graceArmedFor = (roomId: string, playerId: string) =>
  waitUntil(() => t.server.realtime!.sessions.waitingFor(roomId) === playerId, `the grace timer is armed for ${playerId}`);

const dbRoom = async (roomId: string) => (await t.store.getRoom(roomId))!;
const dbGame = async (roomId: string) => projectGameState((await t.store.getGameSession(roomId))!.state);

/** Host rolls 6 and opens a token, then rolls 3 (auto-move): the turn passes to the guest at version 3. */
async function passTurnToGuest(host: Client): Promise<void> {
  t.dice.push(6, 3);
  expectOk(await roll(host, 0));
  expectOk(await move(host, 1, 0));
  expectOk(await roll(host, 2));
}

describe.skipIf(skip)("Phase 2D sessions over Socket.IO + PostgreSQL", () => {
  describe("resume", () => {
    it("restores a refreshed page to the same seat, with the exact saved state and the actions it missed", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      const knownBefore = 1;
      // The guest's page reloads: the old connection is gone, a new one resumes from storage.
      await drop(table.guest, table.guest.id);
      const stored = JSON.parse(JSON.stringify(table.guest.credential)) as PlayerSessionCredential; // as kept in localStorage
      const fresh = track(await open(t.url));
      const ack = await resume(fresh.client, stored, { knownStateVersion: knownBefore });
      expect(ack).toMatchObject({ ok: true, stateVersion: 3 });
      const data = expectOk(ack);
      expect(data.player).toMatchObject({ playerId: table.guest.id, seat: 2, colour: "emerald", isHost: false, connectionStatus: "connected" });
      expect(data.game).toEqual(await dbGame(table.roomId));
      expect(data.missedActions!.map((a: GameActionView) => a.stateVersion)).toEqual([2, 3]);
      expect(await t.store.listPlayers(table.roomId)).toHaveLength(2); // no duplicate player
      t.dice.push(4);
      expect(expectOk(await roll(fresh.client, 3)).action.playerId).toBe(table.guest.id); // and plays on
    });

    it("restores after every participant has gone, from credentials kept by the browser", async () => {
      const table = await seatTwo(t);
      await passTurnToGuest(table.host.client);
      const saved = JSON.stringify({ host: table.host.credential, guest: table.guest.credential }); // e.g. localStorage
      await drop(table.host, table.host.id);
      await drop(table.guest, table.guest.id);
      await graceArmedFor(table.roomId, table.guest.id); // it is the guest's turn
      expect(clock.fireAll()).toBe(1); // the grace period elapses
      await waitUntil(async () => (await dbRoom(table.roomId)).status === "paused", "the game is paused");
      expect(await dbRoom(table.roomId)).toMatchObject({ status: "paused", pauseReason: "connection-lost", pausedPlayerId: table.guest.id });
      const before = await dbGame(table.roomId);
      const kept = JSON.parse(saved) as { host: PlayerSessionCredential; guest: PlayerSessionCredential };
      const host = await reopen(kept.host);
      expect(expectOk(await ask(host.client, "room:getState", { requestId: rid() })).room.status).toBe("paused"); // still waiting for the guest
      const guest = track(await open(t.url));
      const resumed = expectOk(await resume(guest.client, kept.guest));
      expect(resumed.game).toEqual(before);
      expect(await host.rec.waitFor("game:resumed")).toMatchObject({ roomId: table.roomId });
      expect((await dbRoom(table.roomId)).status).toBe("playing");
      t.dice.push(2);
      expectOk(await roll(guest.client, 3));
    });

    it("rejects invalid, malformed and revoked credentials, and archived rooms", async () => {
      const table = await seatTwo(t, { start: false, maxPlayers: 4 });
      track(table.host);
      const c = track(await open(t.url));
      expectError(await resume(c.client, { playerId: table.guest.id, secret: "guess" }), "unauthenticated");
      expectError(await resume(c.client, { playerId: table.guest.id, secret: table.host.credential.secret }), "unauthenticated");
      expectError(await askRaw(c.client, "room:resume", { requestId: rid(), credential: "abc" }), "invalid-payload");
      expectError(await askRaw(c.client, "room:resume", { requestId: rid(), credential: { ...table.guest.credential, playerId2: "x" } }), "invalid-payload");
      // The guest leaves: their credential is revoked with the departure.
      expectOk(await ask(table.guest.client, "room:leave", { requestId: rid() }));
      const revoked = await resume(c.client, table.guest.credential);
      expectError(revoked, "session-expired");
      expect(!revoked.ok && revoked.error.details.reason).toBe("left");
    });

    it("treats a repeated resume on the same connection as one", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await drop(table.guest, table.guest.id);
      const c = track(await open(t.url));
      const first = expectOk(await resume(c.client, table.guest.credential));
      const epoch = (await t.store.getPlayer(table.guest.id))!.sessionEpoch;
      const again = expectOk(await resume(c.client, table.guest.credential));
      expect(again.player.playerId).toBe(first.player.playerId);
      expect((await t.store.getPlayer(table.guest.id))!.sessionEpoch).toBe(epoch); // no second hand-over
      expectError(await resume(c.client, table.host.credential, { takeover: true }), "already-in-room"); // one seat per connection
    });
  });

  describe("one controlling connection per seat", () => {
    it("refuses a second tab for the same player unless it explicitly takes over", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      const tab2 = track(await open(t.url));
      expectError(await resume(tab2.client, table.host.credential), "session-in-use");
      const taken = expectOk(await resume(tab2.client, table.host.credential, { takeover: true }));
      expect(taken.player.playerId).toBe(table.host.id);
      expect(await table.host.rec.waitFor("session:ended")).toEqual({ roomId: table.roomId, reason: "replaced" });
      expectError(await roll(table.host.client, 0), "not-in-room"); // the old tab can no longer act
      t.dice.push(6);
      expectOk(await roll(tab2.client, 0));
      expect(table.guest.rec.of("player:disconnected")).toHaveLength(0); // a hand-over is not a disconnect
    });

    it("lets exactly one of two simultaneous resumes win", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await drop(table.guest, table.guest.id);
      const [a, b] = [track(await open(t.url)), track(await open(t.url))];
      const results = await Promise.all([resume(a.client, table.guest.credential), resume(b.client, table.guest.credential)]);
      expect(results.map((r) => (r.ok ? "ok" : r.error.code)).sort()).toEqual(["ok", "session-in-use"]);
    });

    it("keeps different players in separate tabs of the same browser apart", async () => {
      const table = await seatTwo(t);
      await drop(table.host, table.host.id);
      await drop(table.guest, table.guest.id);
      const tabA = await reopen(table.host.credential);
      const tabB = await reopen(table.guest.credential);
      t.dice.push(6);
      expectError(await roll(tabB.client, 0), "not-your-turn"); // tab B is Ben, not Asha
      expectOk(await roll(tabA.client, 0));
      expect(expectOk(await ask(tabB.client, "room:getState", { requestId: rid() })).room.players.map((p) => p.connectionStatus)).toEqual(["connected", "connected"]);
    });

    it("does not leave a seat held by a connection that closed while it was being claimed (regression)", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      await drop(table.guest, table.guest.id);
      // The guest's page starts to resume, then its network drops before the claim completes.
      const stale = track(await open(t.url));
      const serverSide = t.server.io.sockets.sockets.get(stale.client.id!)!;
      stale.client.close();
      await waitUntil(() => !serverSide.connected, "the server has seen the connection close");
      const actor = await t.rooms.authenticate(table.guest.credential);
      await expect(t.server.realtime!.sessions.claim(serverSide, actor, false)).rejects.toMatchObject({ code: "not-in-room" });
      expect(t.server.realtime!.sessions.isControlled(table.guest.id)).toBe(false);
      // A registry entry for a closed socket never counts as control.
      t.server.realtime!.registry.set(table.guest.id, serverSide.id);
      expect(t.server.realtime!.sessions.isControlled(table.guest.id)).toBe(false);
      t.server.realtime!.registry.release(table.guest.id, serverSide.id);
      // The game still treats the guest as away (it can pause), and a real reconnect is not refused as "in use".
      await graceArmedFor(table.roomId, table.guest.id);
      const back = track(await open(t.url, table.guest.credential));
      expect((await back.rec.waitFor<{ game: GameStateView }>("game:state")).game.currentPlayerId).toBe(table.guest.id);
    });

    it("never moves twice when a retried request arrives through the new connection", async () => {
      const table = await seatTwo(t);
      track(table.guest);
      t.dice.push(6);
      const committed = expectOk(await roll(table.host.client, 0, "roll-before-handover"));
      const tab2 = await reopen(table.host.credential, { takeover: true });
      const retried = expectOk(await roll(tab2.client, 0, "roll-before-handover")); // the old tab's ack was lost; the new tab retries
      expect(retried).toMatchObject({ replayed: true, action: committed.action });
      expect((await t.store.listEvents(table.roomId)).filter((e) => e.actionType === "game:roll")).toHaveLength(1);
    });
  });

  describe("credential rotation", () => {
    it("rotates in two steps: the old secret works until the new one is confirmed, then only the new one does", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      track(table.guest);
      const rotated = expectOk(await ask(table.guest.client, "session:rotate", { requestId: rid() })).credential;
      expect(rotated.playerId).toBe(table.guest.id);
      expect(rotated.secret).not.toBe(table.guest.credential.secret);
      expectError(await ask(table.guest.client, "session:confirmCredential", { requestId: rid(), secret: table.guest.credential.secret }), "credential-conflict");
      const confirmed = expectOk(await ask(table.guest.client, "session:confirmCredential", { requestId: rid(), secret: rotated.secret }));
      expect(confirmed.credentialVersion).toBe(2);
      await drop(table.guest, table.guest.id);
      const c = track(await open(t.url));
      expectError(await resume(c.client, table.guest.credential), "unauthenticated");
      expect(expectOk(await resume(c.client, rotated)).player.playerId).toBe(table.guest.id);
    });

    it("confirms a rotation by first use when the confirmation was lost, and the old secret stops working", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      const rotated = expectOk(await ask(table.guest.client, "session:rotate", { requestId: rid() })).credential;
      await drop(table.guest, table.guest.id); // gone before confirming
      const c = track(await open(t.url));
      expectOk(await resume(c.client, rotated));
      expect((await t.store.getCredential(table.guest.id))!.version).toBe(2);
      await drop(c, table.guest.id);
      expectError(await resume(track(await open(t.url)).client, table.guest.credential), "unauthenticated");
    });

    it("keeps the current secret when a rotation is abandoned", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      expectOk(await ask(table.guest.client, "session:rotate", { requestId: rid() })); // the ack never reached storage
      await drop(table.guest, table.guest.id);
      expectOk(await resume(track(await open(t.url)).client, table.guest.credential)); // not locked out
    });
  });

  describe("disconnects, grace and pausing", () => {
    it("does not pause when the current player is back within the grace period", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      await drop(table.guest, table.guest.id);
      await graceArmedFor(table.roomId, table.guest.id);
      const back = await reopen(table.guest.credential); // back before the grace period ends
      expect(t.server.realtime!.sessions.waitingFor(table.roomId)).toBeNull(); // the timer was cancelled…
      expect(clock.fireAll()).toBe(0); // …so even if the period now elapses, nothing fires
      expect((await dbRoom(table.roomId)).status).toBe("playing");
      expect(table.host.rec.of("game:paused")).toHaveLength(0);
      t.dice.push(5);
      expectOk(await roll(back.client, 3));
    });

    it("pauses after the grace period, rejects play while paused, and resumes when that player returns", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      await drop(table.guest, table.guest.id);
      await graceArmedFor(table.roomId, table.guest.id);
      expect((await dbRoom(table.roomId)).status).toBe("playing"); // still within the grace period
      expect(clock.fireAll()).toBe(1);
      const paused = await table.host.rec.waitFor<{ roomId: string; roomVersion: number; pause: PauseInfo }>("game:paused");
      expect(paused.pause).toMatchObject({ reason: "connection-lost", playerId: table.guest.id });
      const room = (await table.host.rec.waitFor<{ room: RoomView }>("room:updated", (p) => p.room.status === "paused")).room;
      expect(room.pause?.reason).toBe("connection-lost");
      expect(room.lifecycle).toBe("paused");
      expectError(await roll(table.host.client, 3), "game-paused");
      expectError(await move(table.host.client, 3, 0), "game-paused");
      const state = await dbGame(table.roomId);
      expect(state.currentPlayerId).toBe(table.guest.id); // the turn is kept, not skipped

      const back = await reopen(table.guest.credential);
      expect(await table.host.rec.waitFor("game:resumed")).toMatchObject({ roomId: table.roomId });
      expect(await dbRoom(table.roomId)).toMatchObject({ status: "playing", pauseReason: null });
      t.dice.push(1);
      expectOk(await roll(back.client, 3));
    });

    it("lets only the host pause and resume deliberately, and refuses play meanwhile", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      expectError(await ask(table.guest.client, "game:pause", { requestId: rid() }), "not-host");
      const paused = expectOk(await ask(table.host.client, "game:pause", { requestId: rid() }));
      expect(paused).toMatchObject({ changed: true, room: { status: "paused", pause: { reason: "host", playerId: null } } });
      expect(expectOk(await ask(table.host.client, "game:pause", { requestId: rid() })).changed).toBe(false); // already paused
      expect((await table.guest.rec.waitFor<{ pause: PauseInfo }>("game:paused")).pause.reason).toBe("host");
      expectError(await roll(table.host.client, 0), "game-paused");
      expectError(await ask(table.guest.client, "game:resume", { requestId: rid() }), "not-host");
      expect(expectOk(await ask(table.host.client, "game:resume", { requestId: rid() })).changed).toBe(true);
      await table.guest.rec.waitFor("game:resumed");
      t.dice.push(2);
      expectOk(await roll(table.host.client, 0));
    });

    it("keeps the host role through a host disconnect, and the returning host can still manage the room", async () => {
      const table = await seatTwo(t, { start: false, maxPlayers: 4 });
      track(table.guest);
      await drop(table.host, table.host.id);
      const view = expectOk(await ask(table.guest.client, "room:getState", { requestId: rid() })).room;
      expect(view.hostPlayerId).toBe(table.host.id);
      expect(view.players.find((p) => p.isHost)?.connectionStatus).toBe("disconnected");
      expectError(await ask(table.guest.client, "game:start", { requestId: rid() }), "not-host");
      const host = await reopen(table.host.credential);
      expectOk(await ask(host.client, "game:start", { requestId: rid() }));
      // Leaving for good mid-game is done by handing the host role over first.
      const moved = expectOk(await ask(host.client, "room:transferHost", { requestId: rid(), playerId: table.guest.id }));
      expect(moved.room.hostPlayerId).toBe(table.guest.id);
      expectError(await ask(host.client, "game:pause", { requestId: rid() }), "not-host");
      expectOk(await ask(table.guest.client, "game:pause", { requestId: rid() }));
      expect(expectOk(await ask(table.guest.client, "room:close", { requestId: rid() })).room).toMatchObject({ status: "abandoned", endedReason: "closed-by-host" });
    });

    it("pauses for a disconnected player when the turn reaches them, not before", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await drop(table.guest, table.guest.id); // not their turn: nothing happens
      await t.server.realtime!.sessions.evaluate(table.roomId); // let the monitor finish deciding
      expect(t.server.realtime!.sessions.waitingFor(table.roomId)).toBeNull();
      expect(clock.fireAll()).toBe(0);
      expect((await dbRoom(table.roomId)).status).toBe("playing");
      await passTurnToGuest(table.host.client); // now it is
      await graceArmedFor(table.roomId, table.guest.id);
      expect(clock.fireAll()).toBe(1);
      expect((await table.host.rec.waitFor<{ pause: PauseInfo }>("game:paused")).pause.playerId).toBe(table.guest.id);
    });

    it("leaves nothing lost or duplicated: every client and the database agree after all of the above", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      await drop(table.guest, table.guest.id);
      await graceArmedFor(table.roomId, table.guest.id);
      clock.fireAll();
      await table.host.rec.waitFor("game:paused");
      const guest = await reopen(table.guest.credential, { knownStateVersion: 0 });
      await table.host.rec.waitFor("game:resumed");
      t.dice.push(6, 2);
      expectOk(await roll(guest.client, 3));
      expectOk(await move(guest.client, 4, 1));
      const last = expectOk(await roll(guest.client, 5)).game;
      await table.host.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === last.stateVersion);
      expect(table.host.rec.latestState()).toEqual(last);
      expect(await dbGame(table.roomId)).toEqual(last);
      const events = await t.store.listEvents(table.roomId);
      expect(events.map((e) => e.resultStateVersion)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  describe("retention", () => {
    it("expires and archives inactive rooms; their credentials then report an expired session", async () => {
      const table = await seatTwo(t, { start: false });
      await drop(table.host, table.host.id);
      await drop(table.guest, table.guest.id);
      const later = new Date(Date.now() + 31 * 86_400_000);
      const sweeper = new RetentionSweeper(t.store, { lobbyDays: 30, activeDays: 90, endedDays: 30 }, { intervalMs: 0, now: () => later });
      expect((await sweeper.sweepOnce()).expired).toContain(table.roomId);
      expect(await dbRoom(table.roomId)).toMatchObject({ status: "abandoned", endedReason: "expired" });
      const muchLater = new Date(Date.now() + 62 * 86_400_000);
      const archiver = new RetentionSweeper(t.store, { lobbyDays: 30, activeDays: 90, endedDays: 30 }, { intervalMs: 0, now: () => muchLater });
      expect((await archiver.sweepOnce()).archived).toContain(table.roomId);
      const c = track(await open(t.url));
      const ack = await resume(c.client, table.host.credential);
      expectError(ack, "session-expired");
      expect(!ack.ok && ack.error.details.reason).toBe("expired");
      expect(await t.store.listPlayers(table.roomId)).toHaveLength(2); // archived, not deleted
    });

    it("keeps games for the active-game period, and never expires a room while an operation holds it", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      const sixtyDays = new RetentionSweeper(t.store, { lobbyDays: 30, activeDays: 90, endedDays: 30 }, { intervalMs: 0, now: () => new Date(Date.now() + 60 * 86_400_000) });
      expect((await sixtyDays.sweepOnce()).expired).not.toContain(table.roomId);
      // Hold the room row the way an in-flight commit does.
      const holder = new pg.Client({ connectionString: db.url });
      await holder.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT 1 FROM rooms WHERE id = $1 FOR UPDATE", [table.roomId]);
        const late = new RetentionSweeper(t.store, { lobbyDays: 30, activeDays: 90, endedDays: 30 }, { intervalMs: 0, now: () => new Date(Date.now() + 91 * 86_400_000) });
        expect((await late.sweepOnce()).expired).not.toContain(table.roomId); // skipped, not blocked
        await holder.query("COMMIT");
        expect((await late.sweepOnce()).expired).toContain(table.roomId);
      } finally {
        await holder.end();
      }
      t.dice.push(6);
      expectError(await roll(table.host.client, 0), "room-closed"); // an expired game accepts no more moves
    });
  });

  it("never sends or logs a credential secret, including rotated ones", async () => {
    const table = await seatTwo(t);
    const rotated = expectOk(await ask(table.guest.client, "session:rotate", { requestId: rid() })).credential;
    const secrets = [table.host.credential.secret, table.guest.credential.secret, rotated.secret];
    const received = JSON.stringify([table.host.rec.events, table.guest.rec.events]);
    for (const s of secrets) {
      expect(received).not.toContain(s);
      expect(t.logs.join("\n")).not.toContain(s);
    }
    table.host.client.close();
    table.guest.client.close();
  });

  it("lets a page reclaim its seat from its own stale connection with its control epoch, never displacing another tab", async () => {
    const table = await seatTwo(t, { start: false });
    const credential = table.guest.credential;
    const epoch = table.guest.membership.controlEpoch;
    expect(Number.isInteger(epoch)).toBe(true);

    // Ben's network dropped silently: the server still sees his old connection as live.
    // The same page reconnects on a new transport and presents the epoch it was given.
    const back = track(await open(t.url));
    const resumed = expectOk(await ask(back.client, "room:resume", { requestId: rid(), credential, controlEpoch: epoch }));
    expect(resumed.player.playerId).toBe(table.guest.id);
    expect(resumed.controlEpoch).toBeGreaterThan(epoch);
    await table.guest.rec.waitFor<{ reason: string }>("session:ended", (p) => p.reason === "replaced");
    expect(t.server.realtime!.sessions.isControlled(table.guest.id)).toBe(true);

    // Another tab with the credential but without the epoch: refused, as before (no silent hijack).
    const other = track(await open(t.url));
    expectError(await ask(other.client, "room:resume", { requestId: rid(), credential }), "session-in-use");
    // A guessed epoch does not help either.
    expectError(await ask(other.client, "room:resume", { requestId: rid(), credential, controlEpoch: resumed.controlEpoch + 1 }), "session-in-use");
    // An explicit takeover moves the epoch on...
    const taken = expectOk(await ask(other.client, "room:resume", { requestId: rid(), credential, takeover: true }));
    expect(taken.controlEpoch).toBeGreaterThan(resumed.controlEpoch);
    // ...so the page that lost the seat cannot take it back silently with its old epoch.
    const late = track(await open(t.url));
    expectError(await ask(late.client, "room:resume", { requestId: rid(), credential, controlEpoch: resumed.controlEpoch }), "session-in-use");
    for (const c of [back, other, late, table.host, table.guest]) c.client.close();
  });
});

