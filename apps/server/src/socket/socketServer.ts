// Attaches the realtime layer to a Socket.IO server: handshake
// authentication, per-connection handlers, seat sessions (control, hand-over,
// reconnect grace) and the broadcaster the gameplay service publishes
// committed changes through.

import { PROTOCOL_VERSION } from "@ludo/shared-types";
import type { GameplayService } from "../gameplay/gameplayService.js";
import { SlidingWindowLimiter, type RateLimitPolicy } from "../rooms/rateLimiter.js";
import type { RoomService } from "../rooms/roomService.js";
import { SocketPublisher } from "./broadcaster.js";
import { ConnectionRegistry } from "./presence.js";
import { SessionManager, type GraceScheduler } from "./sessions.js";
import { handshakeAuth } from "./socketAuth.js";
import { toProtocolError, type Logger } from "./socketErrors.js";
import type { LudoServer } from "./socketEvents.js";
import { registerHandlers, type HandlerDeps } from "./socketHandlers.js";

export interface RealtimeOptions {
  rooms: RoomService;
  gameplay: GameplayService;
  /** Number of trusted reverse proxies in front of the server (for client addresses). Default 0. */
  trustProxyHops?: number;
  /** How long the current player may be disconnected before the game pauses (default 15 s). */
  reconnectGraceMs?: number;
  /** Clock for the grace period (tests drive it explicitly). */
  graceScheduler?: GraceScheduler;
  limits?: {
    perConnection?: RateLimitPolicy;
    perPlayer?: RateLimitPolicy;
    failedAuth?: RateLimitPolicy;
  };
  log?: Logger;
}

export const DEFAULT_CONNECTION_LIMIT: RateLimitPolicy = { limit: 60, windowMs: 10_000 };
export const DEFAULT_PLAYER_LIMIT: RateLimitPolicy = { limit: 40, windowMs: 10_000 };
export const DEFAULT_RECONNECT_GRACE_MS = 15_000;

export interface RealtimeHandle {
  publisher: SocketPublisher;
  registry: ConnectionRegistry;
  sessions: SessionManager;
  /** Stops timers; call before closing the server. */
  dispose(): void;
}

export function attachRealtime(io: LudoServer, options: RealtimeOptions): RealtimeHandle {
  const log = options.log ?? ((line: string) => console.error(line));
  const publisher = new SocketPublisher(io);
  const registry = new ConnectionRegistry();
  options.gameplay.attachPublisher(publisher);
  const sessions = new SessionManager({
    io,
    rooms: options.rooms,
    gameplay: options.gameplay,
    registry,
    publisher,
    graceMs: options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS,
    ...(options.graceScheduler ? { scheduler: options.graceScheduler } : {}),
    log,
  });

  const deps: HandlerDeps = {
    rooms: options.rooms,
    gameplay: options.gameplay,
    publisher,
    sessions,
    connectionLimiter: new SlidingWindowLimiter(options.limits?.perConnection ?? DEFAULT_CONNECTION_LIMIT),
    playerLimiter: new SlidingWindowLimiter(options.limits?.perPlayer ?? DEFAULT_PLAYER_LIMIT),
    log,
  };

  io.use(
    handshakeAuth({
      rooms: options.rooms,
      trustProxyHops: options.trustProxyHops ?? 0,
      isControlled: (playerId) => sessions.isControlled(playerId),
      ...(options.limits?.failedAuth ? { failedAuthLimiter: new SlidingWindowLimiter(options.limits.failedAuth) } : {}),
    }),
  );

  io.on("connection", (socket) => {
    socket.emit("server:hello", { protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() });
    registerHandlers(socket, deps);
    socket.on("disconnect", () => {
      sessions.release(socket).catch((error: unknown) => toProtocolError(error, "disconnect", log));
    });
    socket.on("error", (error) => toProtocolError(error, "socket", log));

    const pending = socket.data.pending;
    socket.data.pending = null;
    if (pending) {
      // Credential verified at the handshake: claim the seat, then send the current snapshot.
      (async () => {
        const actor = await sessions.claim(socket, pending.actor, pending.takeover);
        const snapshot = await options.gameplay.snapshot(actor);
        socket.emit("room:updated", { room: snapshot.room });
        if (snapshot.game) socket.emit("game:state", { roomId: snapshot.room.roomId, game: snapshot.game });
      })().catch((error: unknown) => {
        toProtocolError(error, "connect", log);
        socket.disconnect(true);
      });
    }
  });

  return { publisher, registry, sessions, dispose: () => sessions.dispose() };
}
