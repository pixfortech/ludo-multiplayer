// GameConnection's state rules with a scripted socket. Live behaviour against
// the real server is covered in apps/server/src/__tests__/clientConnection.pg.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ack, RoomView } from "@ludo/shared-types";
import { actionData, gameView, player, roomView } from "../../test/fakes";
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

  describe("gameplay", () => {
    afterEach(() => vi.useRealTimers());

    /** A connection holding a started game at `version`, answering requests with `answer`. */
    async function playing(version: number, answer: (event: string, payload: Record<string, unknown>) => Ack<unknown>) {
      const room = roomView({ status: "playing", lifecycle: "playing", players: [player(), player({ playerId: "p-ben", displayName: "Ben", seat: 2, colour: "emerald", isHost: false })] });
      const fake = fakeSocket((event, payload) => (event === "room:create" ? ok({ room, player: room.players[0], credential: { playerId: "p-host", secret: "s" } }) : answer(event, payload)));
      const conn = new GameConnection(fake.socket);
      await conn.createRoom({ hostName: "Aman", maxPlayers: 2 });
      fake.fire("game:state", { roomId: "room-1", game: gameView({ stateVersion: version }) });
      return { conn, ...fake };
    }

    it("rolls and moves with the version it is showing, and applies the server's answer", async () => {
      const { conn, sent } = await playing(4, (event) => ok(actionData(gameView({ stateVersion: event === "game:roll" ? 5 : 6 }))));
      await conn.rollDice();
      expect(sent.at(-1)).toMatchObject({ event: "game:roll", payload: { expectedStateVersion: 4 } });
      expect(conn.getState().game!.stateVersion).toBe(5);
      await conn.moveToken(2);
      expect(sent.at(-1)).toMatchObject({ event: "game:move", payload: { expectedStateVersion: 5, tokenId: 2 } });
      expect(typeof sent.at(-1)!.payload.requestId).toBe("string");
      expect(conn.getState().game!.stateVersion).toBe(6);
    });

    it("fetches the authoritative state after a stale-state refusal", async () => {
      const room = roomView({ status: "playing", lifecycle: "playing" });
      const { conn, sent } = await playing(4, (event) =>
        event === "game:roll" ? { ok: false, requestId: "x", roomVersion: null, stateVersion: 7, error: { code: "stale-state", message: "stale", details: {} } } : ok({ room, game: gameView({ stateVersion: 7 }) }),
      );
      const error = await conn.rollDice().catch((e: unknown) => e);
      expect((error as ProtocolRequestError).code).toBe("stale-state");
      await vi.waitFor(() => expect(conn.getState().game!.stateVersion).toBe(7));
      expect(sent.map((s) => s.event)).toContain("room:getState");
    });

    it("reconciles when an announced action skips a version, and ignores old or duplicate snapshots", async () => {
      const room = roomView({ status: "playing", lifecycle: "playing" });
      const { conn, sent, fire } = await playing(4, () => ok({ room, game: gameView({ stateVersion: 9 }) }));
      fire("game:state", { roomId: "room-1", game: gameView({ stateVersion: 3 }) });
      expect(conn.getState().game!.stateVersion).toBe(4);
      fire("game:event", { roomId: "room-1", action: { ...actionData(gameView({ stateVersion: 7 })).action } });
      await vi.waitFor(() => expect(conn.getState().game!.stateVersion).toBe(9));
      expect(sent.filter((s) => s.event === "room:getState")).toHaveLength(1);
    });

    it("reconciles when an announced action's snapshot never arrives", async () => {
      vi.useFakeTimers();
      const room = roomView({ status: "playing", lifecycle: "playing" });
      const { conn, sent, fire } = await playing(4, () => ok({ room, game: gameView({ stateVersion: 5 }) }));
      fire("game:event", { roomId: "room-1", action: actionData(gameView({ stateVersion: 5 })).action });
      expect(sent.some((s) => s.event === "room:getState")).toBe(false);
      await vi.advanceTimersByTimeAsync(2100);
      expect(sent.some((s) => s.event === "room:getState")).toBe(true);
      expect(conn.getState().game!.stateVersion).toBe(5);
    });
  });
});
