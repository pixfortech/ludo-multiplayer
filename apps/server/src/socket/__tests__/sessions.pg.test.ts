// Phase 2D: resume, single-seat control, credential rotation, automatic
// pause/resume and retention — with real Socket.IO clients against a real
// server and PostgreSQL. The reconnect grace period is shortened to 400 ms.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameActionView, GameStateView, PauseInfo, PlayerSessionCredential, RoomView } from "@ludo/shared-types";
import { projectGameState } from "../../gameplay/stateProjection.js";
import { migrate } from "../../persistence/migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../../persistence/__tests__/pgHarness.js";
import { RetentionSweeper } from "../../rooms/retention.js";
import { ask, askRaw, expectError, expectOk, open, rid, seatTwo, sleep, startTestServer, type Client, type Connected, type TestServer } from "./realtimeHarness.js";

const GRACE_MS = 400;
const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ session PostgreSQL tests SKIPPED: ${unavailableReason()}`);

let db: TestDatabase;
let t: TestServer;
const clients: Client[] = [];

beforeAll(async () => {
  if (skip) return;
  db = (await startTestDatabase())!;
  const pool = new pg.Pool({ connectionString: db.url });
  await migrate(pool);
  await pool.end();
  t = await startTestServer(db.url, { reconnectGraceMs: GRACE_MS });
}, 120_000);

afterAll(async () => {
  for (const c of clients) c.close();
  await t?.close();
  await db?.dispose();
}, 60_000);

const track = <T extends { client: Client }>(x: T): T => (clients.push(x.client), x);
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

/** Closes a client and waits until the server has processed the disconnect. */
async function drop(conn: Connected, observer: Connected, playerId: string): Promise<void> {
  const seen = observer.rec.of<{ playerId: string }>("player:disconnected").filter((p) => p.playerId === playerId).length;
  conn.client.close();
  for (let i = 0; i < 300 && observer.rec.of<{ playerId: string }>("player:disconnected").filter((p) => p.playerId === playerId).length <= seen; i++) await sleep(10);
}

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
      await drop(table.guest, table.host, table.guest.id);
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
      table.host.client.close();
      table.guest.client.close();
      for (let i = 0; i < 200 && (await dbRoom(table.roomId)).status !== "paused"; i++) await sleep(10);
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
      await drop(table.guest, table.host, table.guest.id);
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
      await drop(table.guest, table.host, table.guest.id);
      const [a, b] = [track(await open(t.url)), track(await open(t.url))];
      const results = await Promise.all([resume(a.client, table.guest.credential), resume(b.client, table.guest.credential)]);
      expect(results.map((r) => (r.ok ? "ok" : r.error.code)).sort()).toEqual(["ok", "session-in-use"]);
    });

    it("keeps different players in separate tabs of the same browser apart", async () => {
      const table = await seatTwo(t);
      await drop(table.host, table.guest, table.host.id);
      await drop(table.guest, table.guest, table.guest.id).catch(() => undefined);
      const tabA = await reopen(table.host.credential);
      const tabB = await reopen(table.guest.credential);
      t.dice.push(6);
      expectError(await roll(tabB.client, 0), "not-your-turn"); // tab B is Ben, not Asha
      expectOk(await roll(tabA.client, 0));
      expect(expectOk(await ask(tabB.client, "room:getState", { requestId: rid() })).room.players.map((p) => p.connectionStatus)).toEqual(["connected", "connected"]);
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
      await drop(table.guest, table.host, table.guest.id);
      const c = track(await open(t.url));
      expectError(await resume(c.client, table.guest.credential), "unauthenticated");
      expect(expectOk(await resume(c.client, rotated)).player.playerId).toBe(table.guest.id);
    });

    it("confirms a rotation by first use when the confirmation was lost, and the old secret stops working", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      const rotated = expectOk(await ask(table.guest.client, "session:rotate", { requestId: rid() })).credential;
      await drop(table.guest, table.host, table.guest.id); // gone before confirming
      const c = track(await open(t.url));
      expectOk(await resume(c.client, rotated));
      expect((await t.store.getCredential(table.guest.id))!.version).toBe(2);
      await drop(c, table.host, table.guest.id);
      expectError(await resume(track(await open(t.url)).client, table.guest.credential), "unauthenticated");
    });

    it("keeps the current secret when a rotation is abandoned", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      expectOk(await ask(table.guest.client, "session:rotate", { requestId: rid() })); // the ack never reached storage
      await drop(table.guest, table.host, table.guest.id);
      expectOk(await resume(track(await open(t.url)).client, table.guest.credential)); // not locked out
    });
  });

  describe("disconnects, grace and pausing", () => {
    it("does not pause when the current player is back within the grace period", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      await drop(table.guest, table.host, table.guest.id);
      const back = await reopen(table.guest.credential);
      await sleep(GRACE_MS + 300);
      expect((await dbRoom(table.roomId)).status).toBe("playing");
      expect(table.host.rec.of("game:paused")).toHaveLength(0);
      t.dice.push(5);
      expectOk(await roll(back.client, 3));
    });

    it("pauses after the grace period, rejects play while paused, and resumes when that player returns", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      await drop(table.guest, table.host, table.guest.id);
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
      await drop(table.host, table.guest, table.host.id);
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
      await drop(table.guest, table.host, table.guest.id); // not their turn: nothing happens
      await sleep(GRACE_MS + 200);
      expect((await dbRoom(table.roomId)).status).toBe("playing");
      await passTurnToGuest(table.host.client); // now it is
      expect((await table.host.rec.waitFor<{ pause: PauseInfo }>("game:paused")).pause.playerId).toBe(table.guest.id);
    });

    it("leaves nothing lost or duplicated: every client and the database agree after all of the above", async () => {
      const table = await seatTwo(t);
      track(table.host);
      await passTurnToGuest(table.host.client);
      await drop(table.guest, table.host, table.guest.id);
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
      await drop(table.host, table.guest, table.host.id);
      await drop(table.guest, table.guest, table.guest.id).catch(() => undefined);
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
});
