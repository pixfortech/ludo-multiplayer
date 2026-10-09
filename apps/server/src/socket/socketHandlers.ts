// Client → server events. Each handler: rate-limit, validate the envelope and
// fields, resolve the caller from the connection (never from the payload),
// call the room or gameplay service, and acknowledge with
// { ok, requestId, roomVersion, stateVersion, data | error }. Rules live in
// the services and the engine; nothing here decides gameplay.

import type { Ack, ClientToServerEvents, PresencePayload } from "@ludo/shared-types";
import type { GameplayService } from "../gameplay/gameplayService.js";
import { RoomError } from "../rooms/errors.js";
import type { SlidingWindowLimiter } from "../rooms/rateLimiter.js";
import type { AuthenticatedPlayer, RoomService } from "../rooms/roomService.js";
import type { SocketPublisher } from "./broadcaster.js";
import { RULES, peekRequestId, readEnvelope, readFields } from "./payload.js";
import type { ConnectionRegistry } from "./presence.js";
import { TransportError, toProtocolError, type Logger } from "./socketErrors.js";
import { roomChannel, type LudoServer, type LudoSocket } from "./socketEvents.js";

export interface HandlerDeps {
  io: LudoServer;
  rooms: RoomService;
  gameplay: GameplayService;
  publisher: SocketPublisher;
  registry: ConnectionRegistry;
  /** Events per connection. */
  connectionLimiter: SlidingWindowLimiter;
  /** Gameplay requests per player, across all their connections. */
  playerLimiter: SlidingWindowLimiter;
  log: Logger;
}

interface HandlerResult<T> {
  data: T;
  roomVersion?: number | null;
  stateVersion?: number | null;
}

type EventName = keyof ClientToServerEvents;

const numberOrNull = (value: unknown) => (typeof value === "number" ? value : null);

function throttle(limiter: SlidingWindowLimiter, key: string): void {
  const wait = limiter.retryAfterMs(key);
  if (wait > 0) {
    throw new RoomError("rate-limited", "Too many requests; slow down", { retryAfterSeconds: Math.ceil(wait / 1000) });
  }
  limiter.record(key);
}

/** Binds a connection to a verified player: joins the room's channel and records presence. */
export async function bindConnection(socket: LudoSocket, actor: AuthenticatedPlayer, deps: HandlerDeps): Promise<void> {
  socket.data.actor = actor;
  await socket.join(roomChannel(actor.roomId));
  if (deps.registry.add(actor.playerId, socket.id)) {
    await deps.rooms.setPresence(actor, "connected");
    const presence: PresencePayload = { roomId: actor.roomId, playerId: actor.playerId };
    socket.to(roomChannel(actor.roomId)).emit("player:connected", presence);
  }
}

/** Detaches every connection of a player who left the room. */
async function unbindPlayer(actor: AuthenticatedPlayer, deps: HandlerDeps): Promise<void> {
  for (const socketId of deps.registry.connectionsOf(actor.playerId)) {
    deps.registry.remove(actor.playerId, socketId);
    const socket = deps.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.data.actor = null;
      await socket.leave(roomChannel(actor.roomId));
    }
  }
}

/** Presence after a dropped connection. The seat, tokens and turn order are untouched. */
export async function handleDisconnect(socket: LudoSocket, deps: HandlerDeps): Promise<void> {
  const actor = socket.data.actor;
  if (!actor || !deps.registry.remove(actor.playerId, socket.id)) return;
  try {
    await deps.rooms.setPresence(actor, "disconnected");
  } catch (error) {
    toProtocolError(error, "disconnect", deps.log); // logged; presence is best-effort
  }
  const presence: PresencePayload = { roomId: actor.roomId, playerId: actor.playerId };
  deps.io.to(roomChannel(actor.roomId)).emit("player:disconnected", presence);
}

export function registerHandlers(socket: LudoSocket, deps: HandlerDeps): void {
  const { rooms, gameplay, publisher } = deps;

  const requireActor = (): AuthenticatedPlayer => {
    const actor = socket.data.actor;
    if (!actor) throw new TransportError("not-in-room", "Create or join a room first");
    return actor;
  };
  const requireUnbound = (): void => {
    if (socket.data.actor) throw new TransportError("already-in-room", "This connection already belongs to a room; leave it or open a new connection");
  };

  function on<T>(event: EventName, handler: (requestId: string, body: Record<string, unknown>) => Promise<HandlerResult<T>>): void {
    // Typed per event in ClientToServerEvents; the runtime payload is untrusted, so it is taken as unknown here.
    (socket as unknown as { on(e: string, l: (raw: unknown, ack: unknown) => void): void }).on(event, (raw, ack) => {
      if (typeof ack !== "function") return; // nothing can be returned; every event in the contract requires an ack
      const reply = (response: Ack<T>) => {
        try {
          (ack as (r: Ack<T>) => void)(response);
        } catch (error) {
          toProtocolError(error, `${event} ack`, deps.log);
        }
      };
      let requestId = peekRequestId(raw);
      void (async () => {
        try {
          throttle(deps.connectionLimiter, socket.id);
          const envelope = readEnvelope(raw);
          requestId = envelope.requestId;
          const result = await handler(envelope.requestId, envelope.body);
          reply({ ok: true, requestId, roomVersion: result.roomVersion ?? null, stateVersion: result.stateVersion ?? null, data: result.data });
        } catch (error) {
          const protocolError = toProtocolError(error, event, deps.log);
          reply({
            ok: false,
            requestId,
            roomVersion: numberOrNull(protocolError.details.roomVersion),
            stateVersion: numberOrNull(protocolError.details.stateVersion),
            error: protocolError,
          });
        }
      })();
    });
  }

  // ── Rooms ────────────────────────────────────────────────────────────────

  on("room:create", async (_requestId, body) => {
    requireUnbound();
    const created = await rooms.createRoom(body, { clientKey: socket.data.clientKey });
    const actor = await rooms.authenticate(created.credential);
    await bindConnection(socket, actor, deps);
    const { room } = await gameplay.snapshot(actor);
    return { data: { room, player: room.players.find((p) => p.playerId === actor.playerId)!, credential: created.credential }, roomVersion: room.roomVersion };
  });

  on("room:preview", async (_requestId, body) => {
    const { code } = readFields<{ code: string }>(body, RULES.preview);
    const preview = await rooms.previewRoom(code, { clientKey: socket.data.clientKey });
    return { data: { preview } };
  });

  on("room:join", async (_requestId, body) => {
    requireUnbound();
    const joined = await rooms.joinRoom(body, { clientKey: socket.data.clientKey });
    const actor = await rooms.authenticate(joined.credential);
    await bindConnection(socket, actor, deps);
    const { room } = await gameplay.snapshot(actor);
    publisher.roomUpdated(room);
    return { data: { room, player: room.players.find((p) => p.playerId === actor.playerId)!, credential: joined.credential }, roomVersion: room.roomVersion };
  });

  on("room:leave", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedRoomVersion?: number }>(body, RULES.roomVersionOnly);
    throttle(deps.playerLimiter, actor.playerId);
    const room = await rooms.leaveRoom(actor, input);
    await unbindPlayer(actor, deps);
    publisher.roomUpdated(room);
    return { data: { left: true as const }, roomVersion: room.roomVersion };
  });

  on("room:getState", async (_requestId, body) => {
    const actor = requireActor();
    readFields(body, RULES.none);
    throttle(deps.playerLimiter, actor.playerId);
    const snapshot = await gameplay.snapshot(actor);
    return { data: snapshot, roomVersion: snapshot.room.roomVersion, stateVersion: snapshot.game?.stateVersion ?? null };
  });

  // ── Gameplay ─────────────────────────────────────────────────────────────

  on("game:start", async (requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedRoomVersion?: number }>(body, RULES.roomVersionOnly);
    throttle(deps.playerLimiter, actor.playerId);
    const started = await gameplay.start(actor, { requestId, ...input });
    return { data: { room: started.room, game: started.game }, roomVersion: started.room.roomVersion, stateVersion: started.game.stateVersion };
  });

  on("game:roll", async (requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedStateVersion: number }>(body, RULES.roll);
    throttle(deps.playerLimiter, actor.playerId);
    const outcome = await gameplay.roll(actor, { requestId, ...input });
    return { data: { action: outcome.action, replayed: outcome.replayed, game: outcome.game }, roomVersion: outcome.roomVersion, stateVersion: outcome.game.stateVersion };
  });

  on("game:move", async (requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedStateVersion: number; tokenId: number }>(body, RULES.move);
    throttle(deps.playerLimiter, actor.playerId);
    const outcome = await gameplay.move(actor, { requestId, ...input });
    return { data: { action: outcome.action, replayed: outcome.replayed, game: outcome.game }, roomVersion: outcome.roomVersion, stateVersion: outcome.game.stateVersion };
  });

  on("game:getHistory", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ afterSeq?: number; limit?: number }>(body, RULES.history);
    throttle(deps.playerLimiter, actor.playerId);
    return { data: await gameplay.history(actor, input) };
  });
}
