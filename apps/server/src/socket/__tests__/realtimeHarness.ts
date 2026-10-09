// Real-server test harness: a disposable PostgreSQL, the production server
// (startServer + attachRealtime) on a random port, and real socket.io-client
// connections. The only test seam is the dice source handed to the gameplay
// service at construction — no socket event can set a die.

import { io as connect, type Socket } from "socket.io-client";
import { expect } from "vitest";
import type { DiceSource, GameState } from "@ludo/game-engine";
import type { Ack, ClientToServerEvents, GameStateView, MembershipData, PlayerSessionCredential, ServerToClientEvents } from "@ludo/shared-types";
import { GameplayService } from "../../gameplay/gameplayService.js";
import { startServer, type RunningServer } from "../../httpServer.js";
import { PostgresGameStore } from "../../persistence/postgresStore.js";
import type { GameStore } from "../../persistence/types.js";
import { CodeLookupGuard, SlidingWindowLimiter, type RateLimitPolicy } from "../../rooms/rateLimiter.js";
import { RoomService } from "../../rooms/roomService.js";

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Dice whose next values the test queues; drawing from an empty queue fails the action loudly. */
export class ScriptedDice implements DiceSource {
  private readonly queue: number[] = [];
  draws = 0;
  push(...values: number[]): void {
    this.queue.push(...values);
  }
  get remaining(): number {
    return this.queue.length;
  }
  roll(): number {
    const value = this.queue.shift();
    if (value === undefined) throw new Error("ScriptedDice: no value queued");
    this.draws++;
    return value;
  }
}

const GENEROUS: RateLimitPolicy = { limit: 1_000_000, windowMs: 1000 };

export interface TestServer {
  url: string;
  server: RunningServer;
  store: GameStore;
  rooms: RoomService;
  gameplay: GameplayService;
  dice: ScriptedDice;
  logs: string[];
  close(): Promise<void>;
}

export interface TestServerOptions {
  /** Wraps the real store (e.g. to inject a commit failure). */
  wrapStore?: (store: PostgresGameStore) => GameStore;
  perConnection?: RateLimitPolicy;
}

export async function startTestServer(databaseUrl: string, options: TestServerOptions = {}): Promise<TestServer> {
  const pgStore = PostgresGameStore.connect(databaseUrl);
  const store = options.wrapStore ? options.wrapStore(pgStore) : pgStore;
  const logs: string[] = [];
  const rooms = new RoomService({
    store,
    drawFirstPlayer: () => 0, // the host (seat 0) always starts, so scripts are deterministic
    lookupGuard: new CodeLookupGuard({ lookups: GENEROUS, misses: GENEROUS }),
    creationLimiter: new SlidingWindowLimiter(GENEROUS),
  });
  const dice = new ScriptedDice();
  const gameplay = new GameplayService({ store, rooms, dice, onPublishError: (e) => logs.push(String(e)) });
  const server = await startServer({
    port: 0,
    clientOrigins: ["http://localhost:5173"],
    realtime: { rooms, gameplay, log: (line) => logs.push(line), limits: { perConnection: options.perConnection ?? GENEROUS, perPlayer: GENEROUS } },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    server,
    store,
    rooms,
    gameplay,
    dice,
    logs,
    close: async () => {
      await server.close();
      await pgStore.close();
    },
  };
}

/** Everything a client receives, in order. */
export class Recorder {
  readonly events: { event: string; payload: unknown }[] = [];
  constructor(readonly client: Client) {
    client.onAny((event: string, payload: unknown) => this.events.push({ event, payload }));
  }
  of<T>(event: string): T[] {
    return this.events.filter((e) => e.event === event).map((e) => e.payload as T);
  }
  /** Resolves with the first matching event already received or arriving within the timeout. */
  async waitFor<T>(event: string, predicate: (payload: T) => boolean = () => true, timeoutMs = 4000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.of<T>(event).find(predicate);
      if (hit !== undefined) return hit;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${event}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  latestState(): GameStateView | null {
    const states = this.of<{ game: GameStateView }>("game:state");
    return states.length ? states.reduce((a, b) => (b.game.stateVersion > a.game.stateVersion ? b : a)).game : null;
  }
}

export interface Connected {
  client: Client;
  rec: Recorder;
}

/** Opens a real Socket.IO connection (WebSocket); rejects with the server's refusal reason. */
export function open(url: string, credential?: unknown): Promise<Connected> {
  const client: Client = connect(url, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    ...(credential === undefined ? {} : { auth: { credential } }),
  });
  const rec = new Recorder(client);
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve({ client, rec }));
    client.once("connect_error", (error) => {
      client.close();
      reject(error);
    });
  });
}

let counter = 0;
export const rid = (label = "r") => `${label}-${++counter}-${Date.now().toString(36)}`;

/** Sends a request and returns the typed acknowledgement. */
export function ask<E extends keyof ClientToServerEvents>(
  client: Client,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<Parameters<Parameters<ClientToServerEvents[E]>[1]>[0]> {
  return (client.timeout(8000) as unknown as { emitWithAck(e: string, p: unknown): Promise<never> }).emitWithAck(event, payload);
}

/** Sends anything at all (for malformed-payload tests). */
export function askRaw(client: Client, event: string, payload: unknown): Promise<Ack<unknown>> {
  return (client.timeout(8000) as unknown as { emitWithAck(e: string, p: unknown): Promise<Ack<unknown>> }).emitWithAck(event, payload);
}

export function expectOk<T>(ack: Ack<T>): T {
  if (!ack.ok) throw new Error(`expected success, got ${ack.error.code}: ${ack.error.message}`);
  return ack.data;
}

export function expectError(ack: Ack<unknown>, code: string): void {
  expect(ack.ok, ack.ok ? "expected an error" : ack.error.message).toBe(false);
  if (!ack.ok) expect(ack.error.code).toBe(code);
}

export interface Table {
  host: Connected & { membership: MembershipData; credential: PlayerSessionCredential; id: string };
  guest: Connected & { membership: MembershipData; credential: PlayerSessionCredential; id: string };
  code: string;
  roomId: string;
}

/** Host creates (seat 0, Crimson), guest joins as Emerald (seat 2); optionally starts the game. */
export async function seatTwo(t: TestServer, options: { autoMove?: boolean; maxPlayers?: number; start?: boolean } = {}): Promise<Table> {
  const hostConn = await open(t.url);
  const created = expectOk(
    await ask(hostConn.client, "room:create", { requestId: rid("create"), hostName: "Asha", maxPlayers: options.maxPlayers ?? 2, autoMove: options.autoMove ?? true }),
  );
  const guestConn = await open(t.url);
  const joined = expectOk(await ask(guestConn.client, "room:join", { requestId: rid("join"), code: created.room.code, displayName: "Ben", colour: "emerald" }));
  const table: Table = {
    host: { ...hostConn, membership: created, credential: created.credential, id: created.player.playerId },
    guest: { ...guestConn, membership: joined, credential: joined.credential, id: joined.player.playerId },
    code: created.room.code,
    roomId: created.room.roomId,
  };
  if (options.start ?? true) {
    expectOk(await ask(hostConn.client, "game:start", { requestId: rid("start") }));
    await guestConn.rec.waitFor<{ game: GameStateView }>("game:state", (p) => p.game.stateVersion === 0);
  }
  return table;
}

/** Current committed version, as a client would learn it. */
export async function versionOf(client: Client): Promise<number> {
  const state = expectOk(await ask(client, "room:getState", { requestId: rid("state") }));
  return state.game!.stateVersion;
}

/** Test setup at the storage boundary: commits a hand-made (engine-valid) position, as a separate system action. */
export async function forceState(store: GameStore, roomId: string, mutate: (state: GameState) => void): Promise<void> {
  const session = (await store.getGameSession(roomId))!;
  const next = structuredClone(session.state);
  mutate(next);
  next.stateVersion = session.stateVersion + 1;
  await store.commitGameAction({ roomId, expectedStateVersion: session.stateVersion, state: next, event: { playerId: null, actionType: "test:setup", requestId: null, payload: {} } });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
