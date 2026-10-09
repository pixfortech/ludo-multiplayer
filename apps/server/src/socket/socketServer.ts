// Attaches the realtime layer to a Socket.IO server: handshake
// authentication, per-connection handlers, presence and the broadcaster that
// the gameplay service publishes committed changes through.

import { PROTOCOL_VERSION } from "@ludo/shared-types";
import type { GameplayService } from "../gameplay/gameplayService.js";
import { SlidingWindowLimiter, type RateLimitPolicy } from "../rooms/rateLimiter.js";
import type { RoomService } from "../rooms/roomService.js";
import { SocketPublisher } from "./broadcaster.js";
import { ConnectionRegistry } from "./presence.js";
import { handshakeAuth } from "./socketAuth.js";
import { toProtocolError, type Logger } from "./socketErrors.js";
import type { LudoServer } from "./socketEvents.js";
import { bindConnection, handleDisconnect, registerHandlers, type HandlerDeps } from "./socketHandlers.js";

export interface RealtimeOptions {
  rooms: RoomService;
  gameplay: GameplayService;
  /** Number of trusted reverse proxies in front of the server (for client addresses). Default 0. */
  trustProxyHops?: number;
  limits?: {
    perConnection?: RateLimitPolicy;
    perPlayer?: RateLimitPolicy;
    failedAuth?: RateLimitPolicy;
  };
  log?: Logger;
}

export const DEFAULT_CONNECTION_LIMIT: RateLimitPolicy = { limit: 60, windowMs: 10_000 };
export const DEFAULT_PLAYER_LIMIT: RateLimitPolicy = { limit: 40, windowMs: 10_000 };

export interface RealtimeHandle {
  publisher: SocketPublisher;
  registry: ConnectionRegistry;
}

export function attachRealtime(io: LudoServer, options: RealtimeOptions): RealtimeHandle {
  const log = options.log ?? ((line: string) => console.error(line));
  const publisher = new SocketPublisher(io);
  const registry = new ConnectionRegistry();
  options.gameplay.attachPublisher(publisher);

  const deps: HandlerDeps = {
    io,
    rooms: options.rooms,
    gameplay: options.gameplay,
    publisher,
    registry,
    connectionLimiter: new SlidingWindowLimiter(options.limits?.perConnection ?? DEFAULT_CONNECTION_LIMIT),
    playerLimiter: new SlidingWindowLimiter(options.limits?.perPlayer ?? DEFAULT_PLAYER_LIMIT),
    log,
  };

  io.use(
    handshakeAuth({
      rooms: options.rooms,
      trustProxyHops: options.trustProxyHops ?? 0,
      ...(options.limits?.failedAuth ? { failedAuthLimiter: new SlidingWindowLimiter(options.limits.failedAuth) } : {}),
    }),
  );

  io.on("connection", (socket) => {
    socket.emit("server:hello", { protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() });
    registerHandlers(socket, deps);
    socket.on("disconnect", () => {
      handleDisconnect(socket, deps).catch((error: unknown) => toProtocolError(error, "disconnect", log));
    });
    socket.on("error", (error) => toProtocolError(error, "socket", log));

    const actor = socket.data.actor;
    if (actor) {
      // Authenticated at the handshake: bind, then send the current snapshot.
      (async () => {
        await bindConnection(socket, actor, deps);
        const snapshot = await options.gameplay.snapshot(actor);
        socket.emit("room:updated", { room: snapshot.room });
        if (snapshot.game) socket.emit("game:state", { roomId: snapshot.room.roomId, game: snapshot.game });
      })().catch((error: unknown) => {
        toProtocolError(error, "connect", log);
        socket.disconnect(true);
      });
    }
  });

  return { publisher, registry };
}
