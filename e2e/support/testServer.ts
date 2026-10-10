// TEST ONLY — the server the browser end-to-end tests play against.
//
// It is the production HTTP + Socket.IO server (startServer) and the
// production room and gameplay services, on an isolated, disposable
// PostgreSQL (the same harness as the server's integration tests). Two
// differences:
//  - the gameplay service's dice source, the documented test seam
//    (GameplayServiceOptions.dice): values queued by the tests are drawn
//    first, then secure random dice. Clients can never choose a die: the
//    queue is reachable only through a separate control port on 127.0.0.1
//    that requires a per-run token;
//  - the per-client limits on creating rooms and looking up codes are
//    relaxed, because every browser in the suite connects from 127.0.0.1.
// None of this is part of the server build (apps/server/src) or reachable
// from a production deployment.
//
// Control port (JSON, header x-e2e-token):
//   POST /dice   { values: number[] }  queue die values
//   GET  /state?code=ABC234            authoritative room, players, game state, full history and event log
//   POST /shutdown                      stop the server and dispose of the database

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import pg from "pg";
import { createCryptoDice } from "@ludo/game-engine";
import { startTestDatabase } from "../../apps/server/src/persistence/__tests__/pgHarness.js";
import { migrate } from "../../apps/server/src/persistence/migrate.js";
import { PostgresGameStore } from "../../apps/server/src/persistence/postgresStore.js";
import { projectGameState } from "../../apps/server/src/gameplay/stateProjection.js";
import { CodeLookupGuard, SlidingWindowLimiter } from "../../apps/server/src/rooms/rateLimiter.js";
import { RoomService } from "../../apps/server/src/rooms/roomService.js";
import { GameplayService } from "../../apps/server/src/gameplay/gameplayService.js";
import { startServer } from "../../apps/server/src/httpServer.js";

const API_PORT = Number(process.env.E2E_API_PORT ?? 4310);
const CONTROL_PORT = Number(process.env.E2E_CONTROL_PORT ?? 4311);
const TOKEN = process.env.E2E_CONTROL_TOKEN;
const ORIGINS = (process.env.E2E_CLIENT_ORIGINS ?? "http://127.0.0.1:4173,http://localhost:4173").split(",");
if (!TOKEN || TOKEN.length < 16) throw new Error("E2E_CONTROL_TOKEN (16+ characters) is required");

const db = await startTestDatabase();
if (!db) throw new Error("PostgreSQL is required for the browser tests (set PG_BIN_DIR or TEST_DATABASE_URL)");
const pool = new pg.Pool({ connectionString: db.url });
await migrate(pool);
await pool.end();

const store = PostgresGameStore.connect(db.url, {});
const queue: number[] = [];
const random = createCryptoDice();
const dice = { roll: () => queue.shift() ?? random.roll() };
// The host (first seat) starts, so scripted games are reproducible. Every browser in the suite connects
// from 127.0.0.1, so the per-client limits on creating rooms and looking up codes are relaxed here (as in
// the server's own integration harness); the limits themselves are covered by the server's tests.
const GENEROUS = { limit: 1_000_000, windowMs: 1000 };
const rooms = new RoomService({
  store,
  drawFirstPlayer: () => 0,
  creationLimiter: new SlidingWindowLimiter(GENEROUS),
  lookupGuard: new CodeLookupGuard({ lookups: GENEROUS, misses: GENEROUS }),
});
const gameplay = new GameplayService({ store, rooms, dice });
const server = await startServer({ port: API_PORT, clientOrigins: ORIGINS, realtime: { rooms, gameplay, log: () => undefined } });

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) text += String(chunk);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function stateOf(code: string) {
  const room = await store.getRoomByCode(code);
  if (!room) return null;
  const [players, session, events] = await Promise.all([store.listPlayers(room.id), store.getGameSession(room.id), store.listEvents(room.id, { limit: 10_000 })]);
  return {
    room: { id: room.id, code: room.code, status: room.status, hostPlayerId: room.hostPlayerId, settings: room.settings },
    players: players.map((p) => ({ id: p.id, displayName: p.displayName, seat: p.seat, colour: p.colour, connectionStatus: p.connectionStatus, finishPlace: p.finishPlace })),
    game: session ? projectGameState(session.state) : null,
    history: session ? session.state.history : [],
    events: events.map((e) => ({ seq: e.seq, actionType: e.actionType, playerId: e.playerId, requestId: e.requestId, resultStateVersion: e.resultStateVersion })),
    queuedDice: queue.length,
  };
}

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  control.close();
  await server.close();
  await store.close();
  await db!.dispose();
}

const control = createServer((req: IncomingMessage, res: ServerResponse) => {
  const reply = (status: number, data: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.headers["x-e2e-token"] !== TOKEN) return reply(403, { error: "forbidden" });
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  void (async () => {
    try {
      if (req.method === "POST" && url.pathname === "/dice") {
        const values = (await body(req)).values;
        if (!Array.isArray(values) || !values.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)) return reply(400, { error: "values must be 1–6" });
        queue.push(...(values as number[]));
        return reply(200, { queued: queue.length });
      }
      if (req.method === "GET" && url.pathname === "/state") {
        const state = await stateOf(url.searchParams.get("code") ?? "");
        return state ? reply(200, state) : reply(404, { error: "room not found" });
      }
      if (req.method === "POST" && url.pathname === "/shutdown") {
        reply(200, { stopping: true });
        await shutdown();
        process.exit(0);
      }
      reply(404, { error: "not found" });
    } catch (error) {
      reply(500, { error: String(error) });
    }
  })();
}).listen(CONTROL_PORT, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void shutdown().then(() => process.exit(0)));
console.log(`e2e server ready: api ${API_PORT}, control 127.0.0.1:${CONTROL_PORT}`);
