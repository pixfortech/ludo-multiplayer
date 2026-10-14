// Taking over an offline player's seat in a game in progress (an old game resumed by someone new), with real
// Socket.IO clients against a real server and PostgreSQL. Someone new asks; the host decides (or another player
// while the host is away); the seat keeps its place in the game and takes the newcomer's name and a new
// credential, and the absent player's secret stops working.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameStateView, MembershipData, RoomPreview, RoomView } from "@ludo/shared-types";
import { migrate } from "../../persistence/migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../../persistence/__tests__/pgHarness.js";
import { ManualScheduler, ask, closeAllClients, expectError, expectOk, open, rid, seatTwo, startTestServer, waitUntil, type Connected, type TestServer } from "./realtimeHarness.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ seat takeover PostgreSQL tests SKIPPED: ${unavailableReason()}`);

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

beforeEach(() => clock.clear());

afterAll(async () => {
  closeAllClients();
  await t?.close();
  await db?.dispose();
}, 60_000);

async function drop(conn: Connected, playerId: string): Promise<void> {
  conn.client.close();
  await waitUntil(
    async () => !t.server.realtime!.registry.isControlled(playerId) && (await t.store.getPlayer(playerId))!.connectionStatus === "disconnected",
    `the server has released ${playerId}'s seat`,
  );
}

const preview = async (conn: Connected, code: string) => expectOk(await ask(conn.client, "room:preview", { requestId: rid("preview"), code })).preview as RoomPreview;
/** Asks for the seat of the player with this id (as a newcomer would pick it from the preview: by seat). */
const requestSeat = async (conn: Connected, code: string, playerId: string, displayName: string) => {
  const seat = (await t.store.getPlayer(playerId))?.seat ?? 99;
  return ask(conn.client, "room:requestSeat", { requestId: rid("seat"), code, seat, displayName });
};
const answer = (conn: Connected, seatRequestId: string, approve: boolean) => ask(conn.client, "room:answerSeatRequest", { requestId: rid("answer"), seatRequestId, approve });

describe.skipIf(skip)("taking over an offline player's seat", () => {
  it("the host lets a newcomer take an offline player's seat: same seat and tokens, the newcomer's name, a new credential; the old secret stops working", async () => {
    const table = await seatTwo(t);
    const { host, guest, code } = table;
    await drop(guest, guest.id);

    const dev = await open(t.url);
    const seats = (await preview(dev, code)).takeoverSeats;
    expect(seats).toEqual([{ displayName: "Ben", seat: 2, colour: "emerald" }]);
    // Public previews never carry player ids.
    expect(JSON.stringify(await preview(dev, code))).not.toContain(guest.id);
    const asked = expectOk(await requestSeat(dev, code, guest.id, "Dev"));
    // The host hears the request (and nobody learns any secret from it).
    const notice = await host.rec.waitFor<{ seatRequestId: string; playerId: string; displayName: string }>("seat:requested");
    expect(notice).toMatchObject({ seatRequestId: asked.seatRequestId, playerId: guest.id, displayName: "Dev" });
    expect(JSON.stringify(notice)).not.toMatch(/secret/);

    const before = (await t.store.getGameSession(table.roomId))!.stateVersion;
    expectOk(await answer(host, asked.seatRequestId, true));
    const granted = await dev.rec.waitFor<{ seatRequestId: string; membership: MembershipData }>("seat:granted");
    expect(granted.membership.player).toMatchObject({ playerId: guest.id, displayName: "Dev", seat: 2, colour: "emerald" });
    expect(granted.membership.credential.playerId).toBe(guest.id);
    // Everyone sees the seat under the new name; the game itself did not move.
    const updated = await host.rec.waitFor<{ room: RoomView }>("room:updated", (p) => p.room.players.some((x) => x.displayName === "Dev"));
    expect(updated.room.players.find((x) => x.playerId === guest.id)).toMatchObject({ displayName: "Dev", connectionStatus: "connected" });
    expect((await t.store.getGameSession(table.roomId))!.stateVersion).toBe(before);
    await host.rec.waitFor("seat:requestClosed", (p: { outcome: string }) => p.outcome === "approved");

    // Dev's connection now controls the seat: Dev plays Ben's turns.
    const state = expectOk(await ask(dev.client, "room:getState", { requestId: rid("state") })).game as GameStateView;
    expect(state.players.map((p) => p.id)).toContain(guest.id);
    // Ben's old secret no longer opens anything.
    const ben = await open(t.url);
    expectError(await ask(ben.client, "room:resume", { requestId: rid("resume"), credential: guest.credential }), "unauthenticated");
    // Dev's new one does (a refresh).
    dev.client.close();
    await waitUntil(async () => (await t.store.getPlayer(guest.id))!.connectionStatus === "disconnected", "Dev's connection released");
    const again = await open(t.url);
    expect(expectOk(await ask(again.client, "room:resume", { requestId: rid("resume"), credential: granted.membership.credential })).player.displayName).toBe("Dev");
  });

  it("refuses requests for a connected player, before the game starts, with a member's name, or from a connection that already has a seat", async () => {
    const lobby = await seatTwo(t, { start: false });
    const someone = await open(t.url);
    expectError(await requestSeat(someone, lobby.code, lobby.guest.id, "Dev"), "seat-not-available");
    const table = await seatTwo(t);
    expectError(await requestSeat(someone, table.code, table.guest.id, "Dev"), "seat-not-available"); // Ben is connected
    expect((await preview(someone, table.code)).takeoverSeats).toEqual([]);
    await drop(table.guest, table.guest.id);
    expectError(await requestSeat(someone, table.code, table.guest.id, "asha"), "name-taken");
    expectError(await requestSeat(table.host, table.code, table.guest.id, "Dev"), "already-in-room");
  });

  it("only the host answers while present; when the host is the one away, the remaining player answers", async () => {
    // Three players: Asha (host), Ben, Cara. Ben goes away; Cara may not answer while Asha is here.
    const asha = await open(t.url);
    const created = expectOk(await ask(asha.client, "room:create", { requestId: rid("create"), hostName: "Asha", maxPlayers: 3 }));
    const ben = await open(t.url);
    const benJoined = expectOk(await ask(ben.client, "room:join", { requestId: rid("join"), code: created.room.code, displayName: "Ben" }));
    const cara = await open(t.url);
    expectOk(await ask(cara.client, "room:join", { requestId: rid("join"), code: created.room.code, displayName: "Cara" }));
    expectOk(await ask(asha.client, "game:start", { requestId: rid("start") }));
    await drop(ben, benJoined.player.playerId);
    const dev = await open(t.url);
    const asked = expectOk(await requestSeat(dev, created.room.code, benJoined.player.playerId, "Dev"));
    await cara.rec.waitFor("seat:requested");
    expectError(await answer(cara, asked.seatRequestId, true), "not-host");
    // The host away (and asked about): Cara decides.
    await drop(asha, created.player.playerId);
    const eve = await open(t.url);
    const forHost = expectOk(await requestSeat(eve, created.room.code, created.player.playerId, "Eve"));
    expectOk(await answer(cara, forHost.seatRequestId, true));
    const granted = await eve.rec.waitFor<{ membership: MembershipData }>("seat:granted");
    expect(granted.membership.player).toMatchObject({ playerId: created.player.playerId, displayName: "Eve" });
    // Eve now holds the host's seat (and so the host role): she answers Dev's request.
    expectOk(await answer(eve, asked.seatRequestId, false));
    expect(await dev.rec.waitFor<{ reason: string }>("seat:declined")).toMatchObject({ reason: "declined" });
  });

  it("a declined, expired or withdrawn request gives nothing; a request can be approved only once", async () => {
    const table = await seatTwo(t);
    await drop(table.guest, table.guest.id);
    // Declined.
    const dev = await open(t.url);
    const first = expectOk(await requestSeat(dev, table.code, table.guest.id, "Dev"));
    expectOk(await answer(table.host, first.seatRequestId, false));
    expect(await dev.rec.waitFor<{ reason: string }>("seat:declined")).toMatchObject({ seatRequestId: first.seatRequestId, reason: "declined" });
    expectError(await answer(table.host, first.seatRequestId, true), "seat-request-gone");
    // Expired: nobody answered in time.
    const second = expectOk(await requestSeat(dev, table.code, table.guest.id, "Dev"));
    expect(clock.fireAll()).toBeGreaterThan(0);
    expect(await dev.rec.waitFor<{ seatRequestId: string; reason: string }>("seat:declined", (p) => p.seatRequestId === second.seatRequestId)).toMatchObject({ reason: "expired" });
    // Withdrawn: the asker left before the answer.
    const third = expectOk(await requestSeat(dev, table.code, table.guest.id, "Dev"));
    dev.client.close();
    await table.host.rec.waitFor("seat:requestClosed", (p: { seatRequestId: string; outcome: string }) => p.seatRequestId === third.seatRequestId && p.outcome === "withdrawn");
    expectError(await answer(table.host, third.seatRequestId, true), "seat-request-gone");
    // Approved once: a second approval of the same request finds nothing.
    const zed = await open(t.url);
    const fourth = expectOk(await requestSeat(zed, table.code, table.guest.id, "Zed"));
    const [a, b] = await Promise.all([answer(table.host, fourth.seatRequestId, true), answer(table.host, fourth.seatRequestId, true)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    await zed.rec.waitFor("seat:granted");
    expect((await t.store.getPlayer(table.guest.id))!.displayName).toBe("Zed");
  });
});
