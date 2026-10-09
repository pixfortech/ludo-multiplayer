// Complete games, start to finish, for 2, 3 and 4 players: real Socket.IO
// clients, real PostgreSQL, seeded dice injected at the gameplay service.
// Every client plays its own seat; token choices are seeded too. At the end
// every client, the database and the action log must agree exactly.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameStateView, RankingMode, RoomView } from "@ludo/shared-types";
import { projectGameState } from "../../gameplay/stateProjection.js";
import { migrate } from "../../persistence/migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../../persistence/__tests__/pgHarness.js";
import { ask, closeAllClients, expectOk, open, rid, seededDieValues, startTestServer, type Connected, type TestServer } from "./realtimeHarness.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ full-game PostgreSQL tests SKIPPED: ${unavailableReason()}`);

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

const NAMES = ["Asha", "Ben", "Chen", "Dev"];

async function playFullGame(players: number, rankingMode: RankingMode, seed: number) {
  t.dice.push(...seededDieValues(seed, 20_000));
  const choose = seededDieValues(seed + 1, 20_000);
  const host = await open(t.url);
  const created = expectOk(await ask(host.client, "room:create", { requestId: rid(), hostName: NAMES[0]!, maxPlayers: players, rankingMode }));
  const seats = new Map<string, Connected>([[created.player.playerId, host]]);
  for (let i = 1; i < players; i++) {
    const c = await open(t.url);
    const joined = expectOk(await ask(c.client, "room:join", { requestId: rid(), code: created.room.code, displayName: NAMES[i]! }));
    seats.set(joined.player.playerId, c);
  }
  let game = expectOk(await ask(host.client, "game:start", { requestId: rid() })).game!;
  const started = Date.now();
  let actions = 0;
  while (game.phase === "playing") {
    const actor = seats.get(game.currentPlayerId!)!;
    const ack =
      game.turn.phase === "awaiting-roll"
        ? await ask(actor.client, "game:roll", { requestId: rid("r"), expectedStateVersion: game.stateVersion })
        : await ask(actor.client, "game:move", {
            requestId: rid("m"),
            expectedStateVersion: game.stateVersion,
            tokenId: game.turn.legalMoves[choose[actions % choose.length]! % game.turn.legalMoves.length]!.tokenId,
          });
    const next = expectOk(ack).game;
    expect(next.stateVersion).toBe(game.stateVersion + 1);
    game = next;
    actions++;
    if (actions > 10_000) throw new Error("the game did not finish");
  }
  const elapsedMs = Date.now() - started;
  return { created, seats, game, actions, elapsedMs };
}

async function verifyFinish(result: Awaited<ReturnType<typeof playFullGame>>, players: number, rankingMode: RankingMode) {
  const { created, seats, game } = result;
  const roomId = created.room.roomId;
  expect(game.phase).toBe("finished");
  expect(game.winnerId).not.toBeNull();
  expect(game.players.find((p) => p.id === game.winnerId)!.tokens.every((tok) => tok.step === 56)).toBe(true);
  if (rankingMode === "full-ranking") {
    expect(game.ranking).toHaveLength(players);
    expect(new Set(game.ranking)).toEqual(new Set(seats.keys()));
  } else {
    expect(game.ranking[0]).toBe(game.winnerId);
  }
  for (const [, c] of seats) {
    const finished = await c.rec.waitFor<{ winnerId: string; ranking: string[] }>("game:finished");
    expect(finished).toMatchObject({ winnerId: game.winnerId, ranking: game.ranking });
    await c.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === game.stateVersion);
    expect(c.rec.latestState()).toEqual(game);
    expect((await c.rec.waitFor<{ room: RoomView }>("room:updated", (p) => p.room.status === "finished")).room.lifecycle).toBe("finished");
    // Every committed version arrived exactly once and in order.
    expect(c.rec.of<{ game: GameStateView }>("game:state").map((s) => s.game.stateVersion)).toEqual([...Array(game.stateVersion + 1).keys()]);
  }
  const session = (await t.store.getGameSession(roomId))!;
  expect(projectGameState(session.state)).toEqual(game);
  const events = await t.store.listEvents(roomId, { limit: 500, afterSeq: 0 });
  let all = events;
  while (all.length > 0 && all.length % 500 === 0) {
    const more = await t.store.listEvents(roomId, { limit: 500, afterSeq: all.at(-1)!.seq });
    if (more.length === 0) break;
    all = [...all, ...more];
  }
  expect(all).toHaveLength(result.actions + 1);
  expect(all.map((e) => e.resultStateVersion)).toEqual([...Array(game.stateVersion + 1).keys()]);
  expect((await t.store.getRoom(roomId))!.status).toBe("finished");
  for (const [place, playerId] of game.ranking.entries()) expect((await t.store.getPlayer(playerId))!.finishPlace).toBe(place + 1);
  const stateBytes = Buffer.byteLength(JSON.stringify(session.state));
  console.log(
    `full game ${players}p ${rankingMode}: actions=${result.actions} historyEntries=${session.state.history.length} ` +
      `stateBytes=${stateBytes} elapsedMs=${result.elapsedMs} msPerAction=${(result.elapsedMs / result.actions).toFixed(2)}`,
  );
  for (const [, c] of seats) c.client.close();
}

// A complete game is hundreds to a few thousand committed actions over real sockets and PostgreSQL;
// that legitimately needs more than the default 5 s, especially on Windows.
const FULL_GAME_TIMEOUT_MS = 180_000;

describe.skipIf(skip)("complete games over Socket.IO + PostgreSQL", () => {
  it("plays a 2-player game to the winner", async () => {
    const result = await playFullGame(2, "winner-only", 2026);
    await verifyFinish(result, 2, "winner-only");
  }, FULL_GAME_TIMEOUT_MS);

  it("plays a 3-player game to a full ranking", async () => {
    const result = await playFullGame(3, "full-ranking", 3003);
    await verifyFinish(result, 3, "full-ranking");
  }, FULL_GAME_TIMEOUT_MS);

  it("plays a 4-player game to a full ranking", async () => {
    const result = await playFullGame(4, "full-ranking", 4004);
    await verifyFinish(result, 4, "full-ranking");
  }, FULL_GAME_TIMEOUT_MS);

  it("plays a 4-player winner-only game", async () => {
    const result = await playFullGame(4, "winner-only", 4114);
    await verifyFinish(result, 4, "winner-only");
  }, FULL_GAME_TIMEOUT_MS);
});
