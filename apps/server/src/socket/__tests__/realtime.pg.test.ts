// Real-time multiplayer over real Socket.IO connections against a real,
// disposable PostgreSQL. Every scenario goes client → server → engine →
// PostgreSQL → broadcast; only the dice are scripted (at the service).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameActionView, GameStateView, RoomPreview, RoomView } from "@ludo/shared-types";
import { projectGameState } from "../../gameplay/stateProjection.js";
import { migrate } from "../../persistence/migrate.js";
import type { PostgresGameStore } from "../../persistence/postgresStore.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../../persistence/__tests__/pgHarness.js";
import {
  ask,
  askRaw,
  expectError,
  expectOk,
  forceState,
  open,
  rid,
  seatTwo,
  sleep,
  startTestServer,
  versionOf,
  type Client,
  type TestServer,
} from "./realtimeHarness.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ realtime PostgreSQL tests SKIPPED: ${unavailableReason()}`);

let db: TestDatabase;
let t: TestServer;
const clients: Client[] = [];

beforeAll(async () => {
  if (skip) return;
  db = (await startTestDatabase())!;
  const pool = new pg.Pool({ connectionString: db.url });
  await migrate(pool);
  await pool.end();
  t = await startTestServer(db.url);
}, 120_000);

afterAll(async () => {
  for (const c of clients) c.close();
  await t?.close();
  await db?.dispose();
}, 60_000);

/** Tracks every client so afterAll closes them. */
const track = <T extends { client: Client }>(x: T): T => (clients.push(x.client), x);

const roll = (client: Client, expectedStateVersion: number, requestId = rid("roll")) => ask(client, "game:roll", { requestId, expectedStateVersion });
const move = (client: Client, expectedStateVersion: number, tokenId: number, requestId = rid("move")) =>
  ask(client, "game:move", { requestId, expectedStateVersion, tokenId });

/** Emits without an acknowledgement callback, bypassing the typed contract. */
const emitRaw = (client: Client, event: string, payload: unknown) => (client as unknown as { emit(e: string, p: unknown): void }).emit(event, payload);

async function dbState(roomId: string) {
  return (await t.store.getGameSession(roomId))!;
}

describe.skipIf(skip)("real-time multiplayer over Socket.IO + PostgreSQL", () => {
  describe("rooms", () => {
    it("creates a room: hello, typed ack with requestId and version, credential only in the ack", async () => {
      const a = track(await open(t.url));
      await a.rec.waitFor("server:hello");
      const ack = await ask(a.client, "room:create", { requestId: "create-1", hostName: "Asha", maxPlayers: 4 });
      expect(ack).toMatchObject({ ok: true, requestId: "create-1", roomVersion: 0, stateVersion: null });
      const data = expectOk(ack);
      expect(data.credential.secret).toMatch(/^[\w-]{43}$/);
      expect(data.room.players).toEqual([expect.objectContaining({ displayName: "Asha", colour: "crimson", isHost: true, connectionStatus: "connected" })]);
      expect(JSON.stringify(a.rec.events)).not.toContain(data.credential.secret);
    });

    it("joins from a second client: both see the same room, nobody receives the other's secret", async () => {
      const a = track(await open(t.url));
      const created = expectOk(await ask(a.client, "room:create", { requestId: rid(), hostName: "Asha", maxPlayers: 4 }));
      const b = track(await open(t.url));
      const joinAck = await ask(b.client, "room:join", { requestId: rid(), code: created.room.code.toLowerCase(), displayName: "Ben", colour: "golden" });
      const joined = expectOk(joinAck);
      expect(joinAck.roomVersion).toBe(1);
      expect(joined.player).toMatchObject({ displayName: "Ben", seat: 3, colour: "golden", isHost: false, connectionStatus: "connected" });

      const update = await a.rec.waitFor<{ room: RoomView }>("room:updated", (p) => p.room.roomVersion === 1);
      expect(update.room).toEqual(joined.room);
      expect(await a.rec.waitFor("player:connected")).toEqual({ roomId: created.room.roomId, playerId: joined.player.playerId });
      expect(JSON.stringify(a.rec.events)).not.toContain(joined.credential.secret);
      expect(JSON.stringify(b.rec.events)).not.toContain(created.credential.secret);
    });

    it("previews a room without ids or secrets, and rejects invalid, unknown and full rooms", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      track(table.guest);
      const c = track(await open(t.url));
      const preview = expectOk(await ask(c.client, "room:preview", { requestId: rid(), code: table.code })).preview as RoomPreview;
      expect(preview).toMatchObject({ code: table.code, joinedCount: 2, joinable: false, blockedReason: "room-full" });
      expect(JSON.stringify(preview)).not.toMatch(new RegExp(`${table.host.id}|${table.guest.id}|${table.host.credential.secret}`));

      expectError(await ask(c.client, "room:join", { requestId: rid(), code: table.code, displayName: "Cy" }), "room-full");
      expectError(await ask(c.client, "room:join", { requestId: rid(), code: "nope!", displayName: "Cy" }), "invalid-room-code");
      expectError(await ask(c.client, "room:preview", { requestId: rid(), code: "ZZZZZZ" }), "room-not-found");
    });

    it("lets only the host start, then both clients hold the identical version-0 state", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      track(table.guest);
      expectError(await ask(table.guest.client, "game:start", { requestId: rid() }), "not-host");
      const ack = await ask(table.host.client, "game:start", { requestId: rid() });
      expect(ack).toMatchObject({ ok: true, stateVersion: 0, roomVersion: 2 });
      const [h, g] = await Promise.all([
        table.host.rec.waitFor<{ game: GameStateView }>("game:state"),
        table.guest.rec.waitFor<{ game: GameStateView }>("game:state"),
      ]);
      expect(h.game).toEqual(g.game);
      expect(h.game).toMatchObject({ stateVersion: 0, currentPlayerId: table.host.id, phase: "playing" });
      expect(h.game.players.map((p) => p.seat)).toEqual([0, 2]);
      expect(h.game).toEqual(projectGameState((await dbState(table.roomId)).state));
      await table.guest.rec.waitFor<{ room: RoomView }>("room:updated", (p) => p.room.status === "playing");
      expectError(await ask(table.host.client, "game:start", { requestId: rid() }), "game-already-started");
      const late = track(await open(t.url));
      expectError(await ask(late.client, "room:join", { requestId: rid(), code: table.code, displayName: "Late" }), "game-already-started");
    });

    it("keeps one connection in one room and lets a lobby member leave", async () => {
      const table = await seatTwo(t, { start: false, maxPlayers: 4 });
      track(table.host);
      track(table.guest);
      expectError(await ask(table.host.client, "room:join", { requestId: rid(), code: table.code, displayName: "Again" }), "already-in-room");
      expectError(await ask(table.host.client, "room:create", { requestId: rid(), hostName: "Again", maxPlayers: 2 }), "already-in-room");
      expectOk(await ask(table.guest.client, "room:leave", { requestId: rid() }));
      const update = await table.host.rec.waitFor<{ room: RoomView }>("room:updated", (p) => p.room.players.length === 1);
      expect(update.room.lifecycle).toBe("waiting");
      expectError(await ask(table.guest.client, "room:getState", { requestId: rid() }), "not-in-room");
    });
  });

  describe("gameplay", () => {
    it("rolls for the current player only, with both clients receiving the same committed versions", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      expectError(await roll(table.guest.client, 0), "not-your-turn");
      t.dice.push(6);
      const ack = await roll(table.host.client, 0, "first-roll");
      expect(ack).toMatchObject({ ok: true, requestId: "first-roll", stateVersion: 1 });
      const data = expectOk(ack);
      expect(data.action).toMatchObject({ type: "game:roll", playerId: table.host.id, dice: 6, stateVersion: 1, seq: 2 });
      expect(data.game.turn.phase).toBe("awaiting-move"); // four tokens can open: the player chooses
      expect(data.game.turn.legalMoves.map((m) => m.tokenId)).toEqual([0, 1, 2, 3]);
      const [h, g] = await Promise.all([
        table.host.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === 1),
        table.guest.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === 1),
      ]);
      expect(h.game).toEqual(g.game);
      expect(g.game).toEqual(data.game);
      expect((await table.guest.rec.waitFor<{ action: GameActionView }>("game:event", (p) => p.action.stateVersion === 1)).action).toEqual(data.action);
      expect(projectGameState((await dbState(table.roomId)).state)).toEqual(data.game);
    });

    it("applies a legal move with its six bonus, and rejects illegal and out-of-phase actions without touching the database", async () => {
      const table = await seatTwo(t, { autoMove: false });
      track(table.host);
      track(table.guest);
      t.dice.push(6);
      expectOk(await roll(table.host.client, 0));
      expectError(await roll(table.host.client, 1), "not-awaiting-roll"); // a token must be chosen first
      expectError(await move(table.guest.client, 1, 0), "not-your-turn"); // cannot move for the opponent
      const moved = expectOk(await move(table.host.client, 1, 0));
      expect(moved.action.entries.map((e) => e.type)).toEqual(["move", "bonus-roll"]);
      expect(moved.game.players[0]!.tokens[0]!.step).toBe(0);
      expect(moved.game.currentPlayerId).toBe(table.host.id);
      expectError(await move(table.host.client, 2, 0), "not-awaiting-move");

      t.dice.push(3);
      expectOk(await roll(table.host.client, 2)); // autoMove off: one legal move still waits for a choice
      const before = await dbState(table.roomId);
      const illegal = await move(table.host.client, 3, 1); // token 1 is in base and a 3 cannot open it
      expectError(illegal, "illegal-move");
      expect(illegal.stateVersion).toBe(3);
      expectError(await move(table.host.client, 3, 9), "invalid-payload");
      expect((await dbState(table.roomId)).stateVersion).toBe(before.stateVersion);
      expect((await t.store.listEvents(table.roomId)).length).toBe(4);
    });

    it("auto-moves the only movable token and passes the turn", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      t.dice.push(6, 3);
      expectOk(await roll(table.host.client, 0));
      expectOk(await move(table.host.client, 1, 0));
      const auto = expectOk(await roll(table.host.client, 2));
      expect(auto.action.entries.map((e) => e.type)).toEqual(["roll", "auto-move", "turn"]);
      expect(auto.game.lastAutoMove).toEqual({ playerId: table.host.id, tokenId: 0, from: 0, to: 3, dice: 3 });
      expect(auto.game.currentPlayerId).toBe(table.guest.id);
      expect((await table.guest.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === 3)).game).toEqual(auto.game);
    });

    it("forfeits the turn on a third consecutive six", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      t.dice.push(6, 6, 6);
      expectOk(await roll(table.host.client, 0));
      expectOk(await move(table.host.client, 1, 0));
      expectOk(await roll(table.host.client, 2));
      expectOk(await move(table.host.client, 3, 0));
      const third = expectOk(await roll(table.host.client, 4));
      expect(third.action.entries).toEqual([
        expect.objectContaining({ type: "roll", value: 6 }),
        expect.objectContaining({ type: "forfeit", playerId: table.host.id }),
        expect.objectContaining({ type: "turn", playerId: table.guest.id, reason: "three-sixes" }),
      ]);
      expect(third.game.players[0]!.tokens[0]!.step).toBe(6); // the third six moves nothing
      expect(third.game.currentPlayerId).toBe(table.guest.id);
    });

    it("captures an opponent on a plain cell and grants the capture bonus", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      const h = table.host.client;
      const g = table.guest.client;
      t.dice.push(6, 6, 5); // host: open, 0→6, auto 6→11
      expectOk(await roll(h, 0));
      expectOk(await move(h, 1, 0));
      expectOk(await roll(h, 2));
      expectOk(await move(h, 3, 0));
      expectOk(await roll(h, 4));
      t.dice.push(6, 2); // guest: open at cell 26, auto to step 2 (cell 28, not safe)
      expectOk(await roll(g, 5));
      expectOk(await move(g, 6, 0));
      expectOk(await roll(g, 7));
      t.dice.push(6, 6, 5); // host: 11→17, 17→23, auto 23→28 lands on the guest
      expectOk(await roll(h, 8));
      expectOk(await move(h, 9, 0));
      expectOk(await roll(h, 10));
      expectOk(await move(h, 11, 0));
      const capture = expectOk(await roll(h, 12));
      expect(capture.action.entries).toEqual([
        expect.objectContaining({ type: "roll", value: 5 }),
        expect.objectContaining({ type: "auto-move", tokenId: 0, from: 23, to: 28 }),
        expect.objectContaining({ type: "capture", cell: 28, victimPlayerId: table.guest.id, victimTokenId: 0 }),
        expect.objectContaining({ type: "bonus-roll", reasons: ["capture"] }),
      ]);
      expect(capture.game.players[1]!.tokens[0]!.step).toBeNull();
      expect(capture.game.currentPlayerId).toBe(table.host.id);
      expect(capture.game.turn).toMatchObject({ phase: "awaiting-roll", consecutiveSixes: 0 });
      expect((await table.guest.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === 13)).game).toEqual(capture.game);
    });

    it("grants the home bonus, and a client that missed updates recovers with room:getState", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      await forceState(t.store, table.roomId, (s) => {
        s.players[0]!.tokens[0]!.step = 53;
      });
      const recovered = expectOk(await ask(table.guest.client, "room:getState", { requestId: rid() }));
      expect(recovered.game!.stateVersion).toBe(1); // no broadcast was sent for the setup: the snapshot is the recovery path
      t.dice.push(3);
      const home = expectOk(await roll(table.host.client, 1));
      expect(home.action.entries.map((e) => e.type)).toEqual(["roll", "auto-move", "home", "bonus-roll"]);
      expect(home.action.entries.at(-1)).toMatchObject({ reasons: ["home"] });
      expect(home.game.players[0]!.tokens[0]!.step).toBe(56);
      expect(home.game.currentPlayerId).toBe(table.host.id);
      t.dice.push(4);
      const after = expectOk(await roll(table.host.client, 2)); // home tokens never move; nothing else can: auto-pass
      expect(after.action.entries.map((e) => e.type)).toEqual(["roll", "auto-pass", "turn"]);
    });

    it("finishes the game: game:finished and the finished room reach both clients, and nothing more is accepted", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      await forceState(t.store, table.roomId, (s) => {
        const tokens = s.players[0]!.tokens;
        for (const tok of tokens) tok.step = 56;
        tokens[3]!.step = 50;
      });
      t.dice.push(6);
      const last = expectOk(await roll(table.host.client, 1));
      expect(last.game).toMatchObject({ phase: "finished", winnerId: table.host.id, currentPlayerId: null });
      for (const rec of [table.host.rec, table.guest.rec]) {
        expect(await rec.waitFor("game:finished")).toEqual({ roomId: table.roomId, stateVersion: 2, winnerId: table.host.id, ranking: last.game.ranking });
        expect((await rec.waitFor<{ room: RoomView }>("room:updated", (p) => p.room.status === "finished")).room.lifecycle).toBe("finished");
      }
      expect((await t.store.getRoom(table.roomId))!.status).toBe("finished");
      expect((await t.store.getPlayer(table.host.id))!.finishPlace).toBe(1);
      expectError(await roll(table.guest.client, 2), "game-finished");
      expectError(await ask(table.host.client, "game:start", { requestId: rid() }), "room-closed");
    });

    it("pages the action history separately from state updates", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      t.dice.push(6, 3, 2);
      expectOk(await roll(table.host.client, 0));
      expectOk(await move(table.host.client, 1, 0));
      expectOk(await roll(table.host.client, 2));
      const last = expectOk(await roll(table.guest.client, 3));
      expect(last.game.recentHistory.length).toBeLessThanOrEqual(20);
      expect(last.game.historyLength).toBeGreaterThan(0);
      const page1 = expectOk(await ask(table.guest.client, "game:getHistory", { requestId: rid(), limit: 2 }));
      expect(page1.actions.map((a) => a.type)).toEqual(["game:start", "game:roll"]);
      expect(page1).toMatchObject({ nextAfterSeq: 2, hasMore: true });
      const page2 = expectOk(await ask(table.guest.client, "game:getHistory", { requestId: rid(), afterSeq: page1.nextAfterSeq, limit: 10 }));
      expect(page2.actions.map((a) => [a.seq, a.type, a.stateVersion])).toEqual([
        [3, "game:move", 2],
        [4, "game:roll", 3],
        [5, "game:roll", 4],
      ]);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe("ordering, idempotency and failures", () => {
    it("executes a duplicated roll once: the retry returns the committed result and draws no die", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      t.dice.push(6);
      const first = expectOk(await roll(table.host.client, 0, "dup-roll"));
      const drawsAfterFirst = t.dice.draws;
      const again = await roll(table.host.client, 0, "dup-roll"); // same request, e.g. resent after a lost ack
      const retry = expectOk(again);
      expect(retry).toMatchObject({ replayed: true, action: first.action });
      expect(again.stateVersion).toBe(1);
      expect(t.dice.draws).toBe(drawsAfterFirst);
      // Concurrent copies of a new request: one commits, the other is the replay.
      const copies = await Promise.all([move(table.host.client, 1, 0, "dup-move"), move(table.host.client, 1, 0, "dup-move")]);
      expect(copies.map((c) => expectOk(c).replayed).sort()).toEqual([false, true]);
      await sleep(150);
      const rolls = table.guest.rec.of<{ action: GameActionView }>("game:event").filter((e) => e.action.type !== "game:start");
      expect(rolls.map((e) => e.action.stateVersion)).toEqual([1, 2]); // one broadcast per committed action
      expect((await t.store.listEvents(table.roomId)).map((e) => e.actionType)).toEqual(["game:start", "game:roll", "game:move"]);
      expectError(await move(table.host.client, 2, 1, "dup-roll"), "request-id-reused");
    });

    it("lets only one of two conflicting actions commit, and rejects stale versions", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      t.dice.push(6, 6);
      const [a, b] = await Promise.all([roll(table.host.client, 0), roll(table.host.client, 0)]);
      const results = [a, b].map((r) => (r.ok ? "ok" : r.error.code)).sort();
      expect(results).toEqual(["ok", "stale-state"]);
      const stale = [a, b].find((r) => !r.ok)!;
      expect(stale.stateVersion).toBe(1);
      expect((await t.store.listEvents(table.roomId)).filter((e) => e.actionType === "game:roll")).toHaveLength(1);
      expectError(await move(table.host.client, 0, 0), "stale-state");
      expect(t.dice.remaining).toBe(1); // the losing request never drew a die
      t.dice.roll(); // discard
    });

    it("keeps conflicting actions from two server processes on one database to a single commit", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      const second = await startTestServer(db.url); // separate pool, services and coordinator: another process
      try {
        const viaSecond = track(await open(second.url, table.host.credential));
        await viaSecond.rec.waitFor("game:state");
        t.dice.push(6);
        second.dice.push(5);
        const results = await Promise.all([roll(table.host.client, 0), roll(viaSecond.client, 0)]);
        expect(results.map((r) => (r.ok ? "ok" : r.error.code)).sort()).toEqual(["ok", "stale-state"]);
        expect((await t.store.listEvents(table.roomId)).filter((e) => e.actionType === "game:roll")).toHaveLength(1);
        expect((await dbState(table.roomId)).stateVersion).toBe(1);
      } finally {
        await second.close();
      }
      while (t.dice.remaining > 0) t.dice.roll();
    });

    it("never reports or broadcasts success when the database commit fails", async () => {
      let failCommits = false;
      const failing = await startTestServer(db.url, {
        wrapStore: (store: PostgresGameStore) =>
          new Proxy(store, {
            get(target, prop, receiver) {
              if (prop === "commitGameAction" && failCommits) {
                return () => Promise.reject(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }));
              }
              const value = Reflect.get(target, prop, receiver) as unknown;
              return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
            },
          }),
      });
      try {
        const table = await seatTwo(failing);
        track(table.host);
        track(table.guest);
        failCommits = true;
        failing.dice.push(6);
        const failed = await roll(table.host.client, 0);
        expectError(failed, "storage-unavailable");
        expect(JSON.stringify(failed)).not.toMatch(/57P01|administrator|postgres:\/\//);
        await sleep(200);
        expect(table.guest.rec.of<{ game: GameStateView }>("game:state").map((s) => s.game.stateVersion)).toEqual([0]);
        expect(table.guest.rec.of("game:event")).toHaveLength(1); // only the start
        expect((await failing.store.getGameSession(table.roomId))!.stateVersion).toBe(0);
        failCommits = false;
        failing.dice.push(4);
        expect(expectOk(await roll(table.host.client, 0)).action.dice).toBe(4); // recovers once the database does
      } finally {
        await failing.close();
      }
    });

    it("converges every client and the database on the same strictly increasing versions", async () => {
      const table = await seatTwo(t, { maxPlayers: 4 });
      track(table.host);
      track(table.guest);
      t.dice.push(6, 4, 1, 6, 3);
      expectOk(await roll(table.host.client, 0));
      expectOk(await move(table.host.client, 1, 0));
      expectOk(await roll(table.host.client, 2));
      expectOk(await roll(table.guest.client, 3));
      expectOk(await roll(table.host.client, 4));
      expectOk(await move(table.host.client, 5, 1));
      const final = expectOk(await roll(table.host.client, 6)).game;
      for (const rec of [table.host.rec, table.guest.rec]) {
        await rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === final.stateVersion);
        expect(rec.of<{ game: GameStateView }>("game:state").map((s) => s.game.stateVersion)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(rec.of<{ action: GameActionView }>("game:event").map((e) => e.action.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(rec.latestState()).toEqual(final);
      }
      expect(projectGameState((await dbState(table.roomId)).state)).toEqual(final);
      expect(await versionOf(table.guest.client)).toBe(7);
    });

    it("handles a disconnect: seat, tokens and turn preserved, others notified, reconnect by credential", async () => {
      const table = await seatTwo(t);
      track(table.host);
      t.dice.push(6);
      expectOk(await roll(table.host.client, 0));
      const before = await dbState(table.roomId);
      table.guest.client.close();
      expect(await table.host.rec.waitFor("player:disconnected")).toEqual({ roomId: table.roomId, playerId: table.guest.id });
      expect(await t.store.getPlayer(table.guest.id)).toMatchObject({ connectionStatus: "disconnected", leftAt: null, seat: 2 });
      expect((await dbState(table.roomId)).state).toEqual(before.state);
      expect(expectOk(await move(table.host.client, 1, 0)).game.currentPlayerId).toBe(table.host.id); // play continues; no turn is skipped

      const back = track(await open(t.url, table.guest.credential));
      const snapshot = await back.rec.waitFor<{ game: GameStateView }>("game:state");
      expect(snapshot.game.stateVersion).toBe(2);
      expect(await back.rec.waitFor<{ room: RoomView }>("room:updated")).toBeDefined();
      for (let i = 0; i < 200 && table.host.rec.of<{ playerId: string }>("player:connected").filter((p) => p.playerId === table.guest.id).length < 2; i++) await sleep(10);
      expect(table.host.rec.of<{ playerId: string }>("player:connected").filter((p) => p.playerId === table.guest.id)).toHaveLength(2); // joined, then came back
      expect((await t.store.getPlayer(table.guest.id))!.connectionStatus).toBe("connected");
    });
  });

  describe("security", () => {
    it("refuses connections with invalid or forged credentials", async () => {
      const table = await seatTwo(t, { start: false });
      track(table.host);
      track(table.guest);
      const refused = async (credential: unknown) => {
        const error = await open(t.url, credential).then(
          (c) => (c.client.close(), null),
          (e: Error & { data?: { code: string } }) => e,
        );
        expect(error?.message).toBe("unauthenticated");
      };
      await refused({ playerId: table.host.id, secret: table.guest.credential.secret }); // someone else's id with my secret
      await refused({ playerId: table.host.id, secret: "guessed" });
      await refused({ playerId: "not-a-uuid", secret: "x" });
      await refused("just a string");
      const ok = track(await open(t.url, table.guest.credential));
      expect(ok.client.connected).toBe(true);
    });

    it("ignores identity claims in payloads and refuses unauthorised actions", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      // The guest cannot act as the host by naming them.
      expectError(await askRaw(table.guest.client, "game:roll", { requestId: rid(), expectedStateVersion: 0, playerId: table.host.id }), "invalid-payload");
      expectError(await askRaw(table.guest.client, "game:roll", { requestId: rid(), expectedStateVersion: 0, roomId: table.roomId }), "invalid-payload");
      expectError(await roll(table.guest.client, 0), "not-your-turn");
      // An anonymous connection can do nothing in a room.
      const stranger = track(await open(t.url));
      for (const [event, payload] of [
        ["room:getState", {}],
        ["game:start", {}],
        ["game:roll", { expectedStateVersion: 0 }],
        ["game:move", { expectedStateVersion: 0, tokenId: 0 }],
        ["game:getHistory", {}],
        ["room:leave", {}],
      ] as const) {
        expectError(await askRaw(stranger.client, event, { requestId: rid(), ...payload }), "not-in-room");
      }
      expect((await dbState(table.roomId)).stateVersion).toBe(0);
    });

    it("rejects malformed payloads safely, including attempts to choose the dice", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      const c = table.host.client;
      for (const payload of ["roll", 42, null, [1, 2], { expectedStateVersion: 0 }, { requestId: "bad id!", expectedStateVersion: 0 }]) {
        expectError(await askRaw(c, "game:roll", payload), "invalid-payload");
      }
      expectError(await askRaw(c, "game:roll", { requestId: rid(), expectedStateVersion: 0, dice: 6 }), "invalid-payload");
      expectError(await askRaw(c, "game:roll", { requestId: rid() }), "invalid-payload");
      expectError(await askRaw(c, "game:roll", { requestId: rid(), expectedStateVersion: -1 }), "invalid-payload");
      expectError(await askRaw(c, "game:move", { requestId: rid(), expectedStateVersion: 0, tokenId: "0" }), "invalid-payload");
      expectError(await askRaw(c, "room:create", { requestId: rid(), hostName: "x".repeat(5000), maxPlayers: 2 }), "payload-too-large");
      const ack = await askRaw(c, "room:preview", { requestId: "echo-me", code: 7 });
      expect(ack).toMatchObject({ ok: false, requestId: "echo-me", error: { code: "invalid-payload" } });
      t.dice.push(6);
      emitRaw(c, "game:roll", { requestId: rid(), expectedStateVersion: 0 }); // no ack callback: ignored
      await sleep(100);
      expect((await dbState(table.roomId)).stateVersion).toBe(0);
      expect(t.dice.remaining).toBe(1); // no malformed or unacknowledged request ever drew a die
      t.dice.roll();
    });

    it("survives an oversized frame: that connection is dropped, everyone else carries on", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      const rogue = track(await open(t.url));
      const dropped = new Promise((resolve) => rogue.client.once("disconnect", resolve));
      emitRaw(rogue.client, "room:preview", { requestId: rid(), code: "A".repeat(200_000) });
      await dropped;
      expect(await versionOf(table.guest.client)).toBe(0);
    });

    it("rate-limits a connection that floods requests", async () => {
      const limited = await startTestServer(db.url, { perConnection: { limit: 5, windowMs: 60_000 } });
      try {
        const c = track(await open(limited.url));
        const acks = [];
        for (let i = 0; i < 7; i++) acks.push(await ask(c.client, "room:preview", { requestId: rid(), code: "ZZZZZZ" }));
        expect(acks.slice(0, 5).every((a) => !a.ok && a.error.code === "room-not-found")).toBe(true);
        expectError(acks[5]!, "rate-limited");
      } finally {
        await limited.close();
      }
    });

    it("never logs or broadcasts a credential secret", async () => {
      const table = await seatTwo(t);
      track(table.host);
      track(table.guest);
      t.dice.push(6);
      expectOk(await roll(table.host.client, 0));
      const secrets = [table.host.credential.secret, table.guest.credential.secret];
      const received = JSON.stringify([table.host.rec.events, table.guest.rec.events]);
      for (const s of secrets) {
        expect(received).not.toContain(s);
        expect(t.logs.join("\n")).not.toContain(s);
      }
    });
  });
});

