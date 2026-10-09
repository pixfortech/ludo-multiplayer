// End-to-end demonstration: the real server entry point runs as its own
// process (source mode via tsx, or the compiled dist/server.js with
// LUDO_E2E_COMPILED=1) against a real PostgreSQL, with production crypto
// dice. Two independent Socket.IO clients play until the turn has passed
// several times, then both clients and the database must agree exactly.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { GameStateView } from "@ludo/shared-types";
import { projectGameState } from "../gameplay/stateProjection.js";
import { migrate } from "../persistence/migrate.js";
import { PostgresGameStore } from "../persistence/postgresStore.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../persistence/__tests__/pgHarness.js";
import { ask, expectOk, open, rid, type Connected } from "../socket/__tests__/realtimeHarness.js";
import { SERVER_DIR, TSX_CLI, baseChildEnv } from "./childProcess.js";

const COMPILED = process.env.LUDO_E2E_COMPILED === "1";
const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ two-client end-to-end test SKIPPED: ${unavailableReason()}`);

let db: TestDatabase;
let server: ChildProcess | null = null;
let url = "";
let serverOutput = "";

beforeAll(async () => {
  if (skip) return;
  db = (await startTestDatabase())!;
  const pool = new pg.Pool({ connectionString: db.url });
  await migrate(pool);
  await pool.end();

  const entry = COMPILED ? [join(SERVER_DIR, "dist", "server.js")] : [TSX_CLI, "--conditions=source", "src/server.ts"];
  if (COMPILED && !existsSync(entry[0]!)) throw new Error("LUDO_E2E_COMPILED=1 needs a build: run npm run build first");
  server = spawn(process.execPath, entry, { cwd: SERVER_DIR, windowsHide: true, env: { ...baseChildEnv(), PORT: "0", DATABASE_URL: db.url } });
  url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${serverOutput}`)), 60_000);
    const onData = (chunk: Buffer) => {
      serverOutput += chunk.toString();
      const m = /listening on http:\/\/localhost:(\d+)/.exec(serverOutput);
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    };
    server!.stdout!.on("data", onData);
    server!.stderr!.on("data", onData);
    server!.once("exit", (code) => reject(new Error(`server exited with ${code}:\n${serverOutput}`)));
  });
}, 120_000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server!.once("exit", r));
    server.kill("SIGTERM");
    await exited;
  }
  await db?.dispose();
}, 60_000);

describe.skipIf(skip)(`two real clients against the ${COMPILED ? "compiled" : "source-mode"} server process`, () => {
  it("plays a game with turns passing; both clients and PostgreSQL converge on the same state", async () => {
    const a: Connected = await open(url);
    const b: Connected = await open(url);
    try {
      // A creates and hosts; B joins with another name and colour.
      const created = expectOk(await ask(a.client, "room:create", { requestId: rid("create"), hostName: "Asha", maxPlayers: 2, colour: "royal-blue" }));
      const joined = expectOk(await ask(b.client, "room:join", { requestId: rid("join"), code: created.room.code, displayName: "Ben", colour: "golden" }));
      expect(joined.room.players.map((p) => [p.displayName, p.colour])).toEqual([
        ["Asha", "royal-blue"],
        ["Ben", "golden"],
      ]);
      const started = expectOk(await ask(a.client, "game:start", { requestId: rid("start") }));
      const byId = new Map([
        [created.player.playerId, a],
        [joined.player.playerId, b],
      ]);

      // Play: whoever's turn it is rolls, or moves the first legal token the server offers.
      let game: GameStateView = started.game!;
      let rolls = 0;
      let moves = 0;
      const turnHolders: string[] = [game.currentPlayerId!];
      while (game.phase === "playing" && (turnHolders.length < 6 || rolls + moves < 36) && rolls + moves < 300) {
        const actor = byId.get(game.currentPlayerId!)!;
        const request =
          game.turn.phase === "awaiting-roll"
            ? ({ event: "game:roll", payload: { requestId: rid("roll"), expectedStateVersion: game.stateVersion } } as const)
            : ({ event: "game:move", payload: { requestId: rid("move"), expectedStateVersion: game.stateVersion, tokenId: game.turn.legalMoves[0]!.tokenId } } as const);
        if (request.event === "game:roll") rolls++;
        else moves++;
        let outcome = await ask(actor.client, request.event, request.payload as never);
        // A bot outpaces the production rate limit; a well-behaved client waits and resends the same request.
        while (!outcome.ok && outcome.error.code === "rate-limited") {
          await new Promise((r) => setTimeout(r, Number(outcome.ok ? 0 : outcome.error.details.retryAfterSeconds) * 1000));
          outcome = await ask(actor.client, request.event, request.payload as never);
        }
        const next = (expectOk(outcome) as { game: GameStateView }).game;
        expect(next.stateVersion).toBe(game.stateVersion + 1);
        game = next;
        if (game.currentPlayerId && game.currentPlayerId !== turnHolders.at(-1)) turnHolders.push(game.currentPlayerId);
      }
      expect(turnHolders.length).toBeGreaterThanOrEqual(6); // the turn changed hands at least five times

      // Both clients converge on the final committed state.
      const finalVersion = game.stateVersion;
      const latest = async (c: Connected) => {
        await c.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === finalVersion, 8000);
        return c.rec.latestState()!;
      };
      const [stateA, stateB] = await Promise.all([latest(a), latest(b)]);
      expect(stateA).toEqual(game);
      expect(stateB).toEqual(game);
      for (const c of [a, b]) {
        const versions = c.rec.of<{ game: GameStateView }>("game:state").map((s) => s.game.stateVersion);
        expect(versions).toEqual([...Array(finalVersion + 1).keys()]); // every version, in order, exactly once
      }

      // The database holds exactly that state, and one event per action.
      const store = PostgresGameStore.connect(db.url);
      try {
        const session = (await store.getGameSession(created.room.roomId))!;
        expect(projectGameState(session.state)).toEqual(game);
        const events = await store.listEvents(created.room.roomId, { limit: 500 });
        expect(events).toHaveLength(1 + rolls + moves);
        expect(events.at(-1)!.resultStateVersion).toBe(finalVersion);
        console.log(
          `two-client e2e (${COMPILED ? "compiled" : "source"} server): clients=2 rolls=${rolls} moves=${moves} ` +
            `finalStateVersion=${finalVersion} turnChanges=${turnHolders.length - 1} dbEvents=${events.length} identical=true`,
        );
      } finally {
        await store.close();
      }
    } finally {
      a.client.close();
      b.client.close();
    }
  }, 120_000);
});
