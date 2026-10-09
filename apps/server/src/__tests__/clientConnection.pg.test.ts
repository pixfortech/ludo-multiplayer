// Phase 3A: the browser client's connection layer (apps/client/src/lib) run
// against the real server and PostgreSQL. These are the code paths the lobby
// UI uses — GameConnection over a real socket.io-client WebSocket and the
// seat store the browser persists — not mocks, so create, preview, join,
// live lobby updates, host-only start, presence, restore, takeover and
// transport-level re-attach are proven end to end at the protocol level.
// (They do not replace browser testing of the rendered pages.)
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { io } from "socket.io-client";
import { GameConnection, ProtocolRequestError, type ClientSocket, type ConnectionState, type Notice } from "../../../client/src/lib/connection.js";
import { SeatStore, TabSeat, type KeyValueStorage } from "../../../client/src/lib/session.js";
import { migrate } from "../persistence/migrate.js";
import { POSTGRES_REQUIRED, postgresAvailable, startTestDatabase, unavailableReason, type TestDatabase } from "../persistence/__tests__/pgHarness.js";
import { closeAllClients, startTestServer, waitUntil, type TestServer } from "../socket/__tests__/realtimeHarness.js";

const skip = !postgresAvailable && !POSTGRES_REQUIRED;
if (skip) console.warn(`⚠ client connection PostgreSQL tests SKIPPED: ${unavailableReason()}`);

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

/** In-memory stand-in for localStorage / sessionStorage (same interface the browser provides). */
class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

interface Tab {
  conn: GameConnection;
  socket: ClientSocket;
  notices: Notice[];
  state(): ConnectionState;
}

const tabs = new Set<Tab>();

afterEach(() => {
  for (const tab of tabs) tab.conn.dispose();
  tabs.clear();
});

/** A browser tab's connection, built exactly as the client app builds it (WebSocket transport). */
function openTab(options: { reconnection?: boolean } = {}): Tab {
  const socket: ClientSocket = io(t.url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: options.reconnection ?? false,
    reconnectionDelay: 50,
    reconnectionDelayMax: 100,
  });
  const conn = new GameConnection(socket, { requestTimeoutMs: 8000 });
  const notices: Notice[] = [];
  conn.onNotice((n) => notices.push(n));
  const tab: Tab = { conn, socket, notices, state: () => conn.getState() };
  tabs.add(tab);
  return tab;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProtocolRequestError);
    return (error as ProtocolRequestError).code;
  }
  throw new Error("expected the server to refuse the request");
}

/** Host creates a 2–4 player room as Crimson; guest joins with an automatic colour. */
async function hostAndGuest(maxPlayers = 2) {
  const host = openTab();
  const created = await host.conn.createRoom({ hostName: "Aman", maxPlayers, roomName: "Friday table", colour: "crimson", autoMove: true, rankingMode: "winner-only" });
  const guest = openTab();
  const joined = await guest.conn.joinRoom({ code: created.room.code, displayName: "Ben", colour: "auto" });
  return { host, guest, created, joined, code: created.room.code };
}

describe.skipIf(skip)("browser connection layer against the real server", () => {
  it("creates a room and binds the host's seat from the server's answer", async () => {
    const host = openTab();
    const created = await host.conn.createRoom({ hostName: "Aman", maxPlayers: 3, roomName: null, colour: "crimson", autoMove: false, rankingMode: "full-ranking" });
    expect(created.room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.player).toMatchObject({ displayName: "Aman", colour: "crimson", seat: 0, isHost: true });
    expect(created.room.settings).toMatchObject({ maxPlayers: 3, autoMove: false, rankingMode: "full-ranking" });
    const state = host.state();
    expect(state.link).toBe("connected");
    expect(state.seat).toEqual({ roomId: created.room.roomId, roomCode: created.room.code, playerId: created.player.playerId });
    expect(state.room?.players).toHaveLength(1);
    // The credential reaches the caller once (to be stored) and never appears in shared state.
    expect(created.credential.secret.length).toBeGreaterThan(20);
    expect(JSON.stringify(state)).not.toContain(created.credential.secret);
  });

  it("previews a room with taken colours and no ids or secrets", async () => {
    const { created, code } = await hostAndGuest(4);
    const visitor = openTab();
    const preview = await visitor.conn.previewRoom(code);
    expect(preview).toMatchObject({ code, name: "Friday table", hostName: "Aman", joinedCount: 2, maxPlayers: 4, joinable: true, blockedReason: null });
    const crimson = preview.colours.find((c) => c.colour === "crimson")!;
    expect(crimson).toMatchObject({ taken: true, takenBy: "Aman", colourName: "Crimson" });
    expect(preview.colours.filter((c) => c.taken)).toHaveLength(2);
    expect(preview.availableColours).toHaveLength(2);
    const text = JSON.stringify(preview);
    expect(text).not.toContain(created.room.roomId);
    expect(text).not.toContain(created.player.playerId);
    expect(text).not.toContain(created.credential.secret);
    expect(text).not.toMatch(/secret|hash|playerId|roomId/i);
    // Previewing does not seat the visitor.
    expect(visitor.state().seat).toBeNull();
  });

  it("refuses malformed and unknown codes", async () => {
    const visitor = openTab();
    expect(await refusal(visitor.conn.previewRoom("AB"))).toBe("invalid-room-code");
    expect(await refusal(visitor.conn.previewRoom("ZZZZZZ"))).toBe("room-not-found");
    expect(await refusal(visitor.conn.joinRoom({ code: "ZZZZZZ", displayName: "Cara", colour: "auto" }))).toBe("room-not-found");
  });

  it("gives an automatic colour, refuses a taken colour and a full room", async () => {
    const { joined, code } = await hostAndGuest(2);
    // Auto: the server picks a free colour away from the host (the opposite corner).
    expect(joined.player.colour).not.toBe("crimson");
    expect(joined.player.seat).toBe(2);
    const late = openTab();
    expect(await refusal(late.conn.joinRoom({ code, displayName: "Cara", colour: "crimson" }))).toBe("room-full");
    const preview = await late.conn.previewRoom(code);
    expect(preview).toMatchObject({ joinable: false, blockedReason: "room-full" });

    const { code: bigger } = await hostAndGuest(4);
    expect(await refusal(late.conn.joinRoom({ code: bigger, displayName: "Cara", colour: "crimson" }))).toBe("colour-taken");
    expect(late.state().seat).toBeNull();
  });

  it("updates the host's lobby live when a player joins", async () => {
    const host = openTab();
    const created = await host.conn.createRoom({ hostName: "Aman", maxPlayers: 2, colour: "auto" });
    const guest = openTab();
    await guest.conn.joinRoom({ code: created.room.code, displayName: "Ben", colour: "auto" });
    await waitUntil(() => host.state().room?.players.length === 2, "the host sees the guest");
    expect(host.notices).toContainEqual({ kind: "player-joined", name: "Ben" });
    const names = host.state().room!.players.map((p) => `${p.displayName}:${p.connectionStatus}`);
    expect(names.sort()).toEqual(["Aman:connected", "Ben:connected"]);
    expect(guest.state().room?.hostPlayerId).toBe(created.player.playerId);
  });

  it("lets only the host start, and both lobbies follow the start", async () => {
    const { host, guest } = await hostAndGuest(2);
    await waitUntil(() => host.state().room?.players.length === 2, "the host sees the guest");
    expect(await refusal(guest.conn.startGame())).toBe("not-host");
    expect(guest.state().room?.status).toBe("lobby");
    await host.conn.startGame();
    expect(host.state().room?.status).toBe("playing");
    await waitUntil(() => guest.state().room?.status === "playing" && guest.state().game !== null, "the guest sees the game start");
    expect(guest.notices).toContainEqual({ kind: "game-started" });
    expect(guest.state().game?.stateVersion).toBe(0);
  });

  it("shows a player as away when their connection drops", async () => {
    const { host, guest, joined } = await hostAndGuest(2);
    await waitUntil(() => host.state().room?.players.length === 2, "the host sees the guest");
    guest.socket.disconnect();
    await waitUntil(() => host.state().room?.players.find((p) => p.playerId === joined.player.playerId)?.connectionStatus === "disconnected", "the host sees the guest as away");
    expect(host.notices).toContainEqual({ kind: "player-disconnected", name: "Ben" });
  });

  it("restores the same seat after a refresh from the stored credential", async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const seats = new SeatStore(local);
    const tabMarker = new TabSeat(session);
    const { host, guest, joined, code } = await hostAndGuest(2);
    // What the join page stores.
    seats.save({ roomCode: code, playerId: joined.player.playerId, secret: joined.credential.secret, displayName: "Ben", roomName: joined.room.name });
    tabMarker.set({ roomCode: code, playerId: joined.player.playerId });

    // Refresh: the page's socket goes away and a new one comes up.
    guest.conn.dispose();
    await waitUntil(() => host.state().room?.players.find((p) => p.displayName === "Ben")?.connectionStatus === "disconnected", "the old connection is released");
    const reloaded = openTab();
    const marker = tabMarker.get()!;
    const stored = seats.get(marker.roomCode, marker.playerId)!;
    const resumed = await reloaded.conn.resume({ playerId: stored.playerId, secret: stored.secret });
    expect(resumed.player.playerId).toBe(joined.player.playerId);
    expect(resumed.player.colour).toBe(joined.player.colour);
    expect(reloaded.state().seat?.playerId).toBe(joined.player.playerId);
    await waitUntil(() => host.state().room?.players.find((p) => p.displayName === "Ben")?.connectionStatus === "connected", "the host sees Ben back");
    expect(host.notices).toContainEqual({ kind: "player-connected", name: "Ben" });
  });

  it("does not let a second tab silently take a seat; takeover is explicit and ends the first", async () => {
    const { guest, joined } = await hostAndGuest(2);
    const credential = { playerId: joined.player.playerId, secret: joined.credential.secret };
    const second = openTab();
    expect(await refusal(second.conn.resume(credential))).toBe("session-in-use");
    expect(second.state().seat).toBeNull();
    expect(guest.state().seat?.playerId).toBe(joined.player.playerId);

    await second.conn.resume(credential, { takeover: true });
    expect(second.state().seat?.playerId).toBe(joined.player.playerId);
    await waitUntil(() => guest.state().ended === "replaced", "the first tab is told it was replaced");
    expect(guest.state().seat).toBeNull();
    expect(guest.notices).toContainEqual({ kind: "session-ended", reason: "replaced" });
    // The replaced tab no longer acts for the seat.
    expect(await refusal(guest.conn.refresh())).toBe("not-in-room");
  });

  it("refuses a wrong secret without revealing anything", async () => {
    const { joined } = await hostAndGuest(2);
    const stranger = openTab();
    const code = await refusal(stranger.conn.resume({ playerId: joined.player.playerId, secret: "x".repeat(43) }));
    expect(code).toBe("unauthenticated");
    expect(stranger.state().room).toBeNull();
  });

  it("re-attaches the seat by itself after the transport reconnects", async () => {
    const host = openTab();
    const created = await host.conn.createRoom({ hostName: "Aman", maxPlayers: 2, colour: "crimson" });
    const guest = openTab({ reconnection: true });
    const joined = await guest.conn.joinRoom({ code: created.room.code, displayName: "Ben", colour: "auto" });
    await waitUntil(() => host.state().room?.players.length === 2, "the host sees the guest");

    // A network blip: the underlying engine closes; socket.io-client reconnects with a new server socket.
    guest.socket.io.engine.close();
    await waitUntil(() => guest.notices.some((n) => n.kind === "seat-restored"), "the guest's seat is re-attached", 8000);
    expect(guest.state().link).toBe("connected");
    expect(guest.state().seat?.playerId).toBe(joined.player.playerId);
    // And it acts for the seat again.
    const state = await guest.conn.refresh();
    expect(state.room.code).toBe(created.room.code);
    await waitUntil(() => host.state().room?.players.find((p) => p.displayName === "Ben")?.connectionStatus === "connected", "the host sees Ben connected");
  });

  it("removes a player who leaves from every lobby", async () => {
    const { host, guest } = await hostAndGuest(2);
    await waitUntil(() => host.state().room?.players.length === 2, "the host sees the guest");
    await guest.conn.leaveRoom();
    expect(guest.state().seat).toBeNull();
    await waitUntil(() => host.state().room?.players.length === 1, "the host sees the guest leave");
    expect(host.notices).toContainEqual({ kind: "player-left", name: "Ben" });
  });
});
