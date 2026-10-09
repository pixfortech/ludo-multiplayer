// GameConnection's state rules with a scripted socket. Live behaviour against
// the real server is covered in apps/server/src/__tests__/clientConnection.pg.test.ts.
import { describe, expect, it } from "vitest";
import type { Ack, RoomView } from "@ludo/shared-types";
import { player, roomView } from "../../test/fakes";
import { GameConnection, ProtocolRequestError, type ClientSocket, type Notice } from "../connection";

function fakeSocket(answer: (event: string, payload: Record<string, unknown>) => Ack<unknown>) {
  const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  const sent: { event: string; payload: Record<string, unknown> }[] = [];
  const socket = {
    connected: true,
    on(event: string, handler: (...a: unknown[]) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return socket;
    },
    timeout() {
      return { emitWithAck: async (event: string, payload: Record<string, unknown>) => (sent.push({ event, payload }), answer(event, payload)) };
    },
    connect() {},
    disconnect() {},
    removeAllListeners() {},
  };
  const fire = (event: string, ...args: unknown[]) => handlers.get(event)?.forEach((h) => h(...args));
  return { socket: socket as unknown as ClientSocket, fire, sent };
}

const ok = <T,>(data: T, requestId = "r"): Ack<T> => ({ ok: true, requestId, roomVersion: 0, stateVersion: null, data });

describe("GameConnection", () => {
  it("sends a fresh request id with every request and surfaces typed errors", async () => {
    const { socket, sent } = fakeSocket((event) =>
      event === "room:preview" ? { ok: false, requestId: "x", roomVersion: null, stateVersion: null, error: { code: "room-not-found", message: "Room not found", details: {} } } : ok({}),
    );
    const conn = new GameConnection(socket);
    const error = await conn.previewRoom("ABC234").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProtocolRequestError);
    expect((error as ProtocolRequestError).code).toBe("room-not-found");
    await conn.previewRoom("ABC234").catch(() => undefined);
    expect(sent[0]!.payload.requestId).not.toBe(sent[1]!.payload.requestId);
    expect(sent[0]!.payload).toMatchObject({ code: "ABC234" });
  });

  it("binds the seat from a create, applies only newer room versions, and reports lobby changes", async () => {
    const created = roomView({ roomVersion: 0 });
    const { socket, fire } = fakeSocket(() => ok({ room: created, player: created.players[0], credential: { playerId: "p-host", secret: "s" } }));
    const conn = new GameConnection(socket);
    const notices: Notice[] = [];
    conn.onNotice((n) => notices.push(n));
    await conn.createRoom({ hostName: "Aman", maxPlayers: 4 });
    expect(conn.getState().seat).toEqual({ roomId: "room-1", roomCode: "ABC234", playerId: "p-host" });

    const withBen: RoomView = roomView({ roomVersion: 1, players: [player(), player({ playerId: "p-ben", displayName: "Ben", seat: 2, colour: "emerald", isHost: false })] });
    fire("room:updated", { room: withBen });
    fire("room:updated", { room: created }); // an older version arriving late is ignored
    expect(conn.getState().room!.players.map((p) => p.displayName)).toEqual(["Aman", "Ben"]);

    fire("player:disconnected", { roomId: "room-1", playerId: "p-ben" });
    expect(conn.getState().room!.players[1]!.connectionStatus).toBe("disconnected");
    fire("player:connected", { roomId: "room-1", playerId: "p-ben" });
    fire("room:updated", { room: { ...withBen, roomVersion: 2, status: "playing", lifecycle: "playing" } });
    expect(notices).toEqual([
      { kind: "player-joined", name: "Ben" },
      { kind: "player-disconnected", name: "Ben" },
      { kind: "player-connected", name: "Ben" },
      { kind: "game-started" },
    ]);
  });

  it("drops the seat when the server ends this connection's session", async () => {
    const created = roomView();
    const { socket, fire } = fakeSocket(() => ok({ room: created, player: created.players[0], credential: { playerId: "p-host", secret: "s" } }));
    const conn = new GameConnection(socket);
    await conn.createRoom({ hostName: "Aman", maxPlayers: 4 });
    fire("session:ended", { roomId: "room-1", reason: "replaced" });
    expect(conn.getState()).toMatchObject({ seat: null, ended: "replaced" });
  });

  it("tracks the transport: connecting, connected, reconnecting", () => {
    const { socket, fire } = fakeSocket(() => ok({}));
    (socket as unknown as { connected: boolean }).connected = false;
    const conn = new GameConnection(socket);
    expect(conn.getState().link).toBe("connecting");
    fire("connect");
    expect(conn.getState().link).toBe("connected");
    fire("disconnect");
    expect(conn.getState().link).toBe("reconnecting");
  });
});
