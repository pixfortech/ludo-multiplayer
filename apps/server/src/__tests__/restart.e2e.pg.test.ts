// Server restart recovery with real processes: play on one server process,
// stop it, start a new process on the same PostgreSQL database, resume both
// players with their stored credentials, and carry on. Production dice; the
// reconnect grace period is 1 s. Source mode by default; LUDO_E2E_COMPILED=1
// runs dist/server.js instead.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameStateView, PauseInfo, PlayerSessionCredential } from "@ludo/shared-types";
import { projectGameState } from "../gameplay/stateProjection.js";
import { migrate } from "../persistence/migrate.js";
import { PostgresGameStore } from "../persistence/postgresStore.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../persistence/__tests__/pgHarness.js";
import { ask, expectOk, open, rid, sleep, type Connected } from "../socket/__tests__/realtimeHarness.js";
import { spawnServer, type ServerProcess } from "./childProcess.js";

const COMPILED = process.env.LUDO_E2E_COMPILED === "1";
const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ restart end-to-end test SKIPPED: ${unavailableReason()}`);

let db: TestDatabase;
let store: PostgresGameStore;
const servers: ServerProcess[] = [];
const connections: Connected[] = [];

beforeAll(async () => {
  if (skip) return;
  db = (await startTestDatabase())!;
  const pool = new pg.Pool({ connectionString: db.url });
  await migrate(pool);
  await pool.end();
  store = PostgresGameStore.connect(db.url);
}, 120_000);

afterAll(async () => {
  for (const c of connections) c.client.close();
  for (const s of servers) await s.stop();
  await store?.close();
  await db?.dispose();
}, 60_000);

const start = async () => {
  const s = await spawnServer(db.url, { compiled: COMPILED, env: { RECONNECT_GRACE_SECONDS: "1" } });
  servers.push(s);
  return s;
};
const connect = async (url: string) => {
  const c = await open(url);
  connections.push(c);
  return c;
};

/** Plays real turns: whoever's turn it is rolls, or moves the first legal token. Returns the final state and counts. */
async function play(players: Map<string, Connected>, from: GameStateView, actions: number): Promise<{ game: GameStateView; done: number }> {
  let game = from;
  let done = 0;
  while (game.phase === "playing" && done < actions) {
    const actor = players.get(game.currentPlayerId!)!;
    const request =
      game.turn.phase === "awaiting-roll"
        ? ({ event: "game:roll", payload: { requestId: rid("roll"), expectedStateVersion: game.stateVersion } } as const)
        : ({ event: "game:move", payload: { requestId: rid("move"), expectedStateVersion: game.stateVersion, tokenId: game.turn.legalMoves[0]!.tokenId } } as const);
    let ack = await ask(actor.client, request.event, request.payload as never);
    while (!ack.ok && ack.error.code === "rate-limited") {
      await sleep(Number(ack.error.details.retryAfterSeconds) * 1000);
      ack = await ask(actor.client, request.event, request.payload as never);
    }
    const next = (expectOk(ack) as { game: GameStateView }).game;
    expect(next.stateVersion).toBe(game.stateVersion + 1);
    game = next;
    done++;
  }
  return { game, done };
}

describe.skipIf(skip)(`server restart recovery (${COMPILED ? "compiled" : "source-mode"} server processes)`, () => {
  it("restores the exact room and game in a new server process and continues without losing a committed action", async () => {
    // ── First server process: create, join, start, play.
    const first = await start();
    const a = await connect(first.url);
    const b = await connect(first.url);
    const created = expectOk(await ask(a.client, "room:create", { requestId: rid(), hostName: "Asha", maxPlayers: 2 }));
    const joined = expectOk(await ask(b.client, "room:join", { requestId: rid(), code: created.room.code, displayName: "Ben", colour: "golden" }));
    const credentials = new Map<string, PlayerSessionCredential>([
      [created.player.playerId, created.credential],
      [joined.player.playerId, joined.credential],
    ]);
    const started = expectOk(await ask(a.client, "game:start", { requestId: rid() }));
    const before = await play(
      new Map([
        [created.player.playerId, a],
        [joined.player.playerId, b],
      ]),
      started.game!,
      14,
    );
    const roomId = created.room.roomId;
    expect(projectGameState((await store.getGameSession(roomId))!.state)).toEqual(before.game); // committed

    // ── Stop the process. Nothing committed may be lost.
    await first.stop();
    expect(projectGameState((await store.getGameSession(roomId))!.state)).toEqual(before.game);

    // ── A new process on the same database.
    const second = await start();
    expect((await store.listPlayers(roomId)).map((p) => p.connectionStatus)).toEqual(["disconnected", "disconnected"]); // presence reset
    const waitingFor = before.game.currentPlayerId!;
    const otherId = [...credentials.keys()].find((id) => id !== waitingFor)!;

    // The player who is not on turn comes back first, from their stored credential.
    const other = await connect(second.url);
    const otherResume = expectOk(
      await ask(other.client, "room:resume", { requestId: rid(), credential: credentials.get(otherId)!, knownStateVersion: before.game.stateVersion }),
    );
    expect(otherResume.player.playerId).toBe(otherId);
    expect(otherResume.game).toEqual(before.game); // exactly the same tokens, dice, turn and history
    expect(otherResume.missedActions).toEqual([]);

    // The player on turn is still away after the grace period: the game pauses for them, nothing is skipped.
    const paused = await other.rec.waitFor<{ pause: PauseInfo }>("game:paused", () => true, 8000);
    expect(paused.pause).toMatchObject({ reason: "connection-lost", playerId: waitingFor });
    expect((await store.getRoom(roomId))!.status).toBe("paused");

    // They return: the game resumes where it was.
    const current = await connect(second.url);
    const currentResume = expectOk(await ask(current.client, "room:resume", { requestId: rid(), credential: credentials.get(waitingFor)! }));
    expect(currentResume.game).toEqual(before.game);
    await other.rec.waitFor("game:resumed", () => true, 8000);

    // ── Carry on playing on the new process.
    const after = await play(
      new Map([
        [otherId, other],
        [waitingFor, current],
      ]),
      before.game,
      12,
    );
    for (const c of [other, current]) {
      await c.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === after.game.stateVersion, 8000);
      expect(c.rec.latestState()).toEqual(after.game);
    }
    expect(projectGameState((await store.getGameSession(roomId))!.state)).toEqual(after.game);
    const events = await store.listEvents(roomId, { limit: 500 });
    expect(events.map((e) => e.resultStateVersion)).toEqual([...Array(after.game.stateVersion + 1).keys()]); // every action exactly once
    expect(await store.listPlayers(roomId)).toHaveLength(2); // same two players, no duplicates
    console.log(
      `restart e2e (${COMPILED ? "compiled" : "source"}): actionsBefore=${before.done} stateVersionAtStop=${before.game.stateVersion} ` +
        `pausedFor=${waitingFor === created.player.playerId ? "host" : "guest"} actionsAfter=${after.done} finalStateVersion=${after.game.stateVersion} ` +
        `dbEvents=${events.length} identical=true`,
    );
  }, 180_000);
});
