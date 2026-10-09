// Client → server events. Each handler: rate-limit, validate the envelope and
// fields, resolve the caller from the connection (never from the payload),
// call the room or gameplay service, and acknowledge with
// { ok, requestId, roomVersion, stateVersion, data | error }. Rules live in
// the services and the engine; nothing here decides gameplay.

import type { Ack, ClientToServerEvents } from "@ludo/shared-types";
import type { GameplayService } from "../gameplay/gameplayService.js";
import { RoomError } from "../rooms/errors.js";
import type { SlidingWindowLimiter } from "../rooms/rateLimiter.js";
import type { AuthenticatedPlayer, RoomService } from "../rooms/roomService.js";
import type { SocketPublisher } from "./broadcaster.js";
import { RULES, peekRequestId, readEnvelope, readFields } from "./payload.js";
import type { SessionManager } from "./sessions.js";
import { TransportError, toProtocolError, type Logger } from "./socketErrors.js";
import type { LudoSocket } from "./socketEvents.js";

export interface HandlerDeps {
  rooms: RoomService;
  gameplay: GameplayService;
  publisher: SocketPublisher;
  sessions: SessionManager;
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

export function registerHandlers(socket: LudoSocket, deps: HandlerDeps): void {
  const { rooms, gameplay, publisher, sessions } = deps;

  const requireActor = (): AuthenticatedPlayer => {
    const actor = socket.data.actor;
    if (!actor) throw new TransportError("not-in-room", "Create, join or resume a room first");
    throttle(deps.playerLimiter, actor.playerId);
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
          // Control moved to a newer connection (possibly in another server process): detach this one.
          if (protocolError.code === "session-replaced") await sessions.detach(socket, "replaced").catch(() => undefined);
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
    const actor = await sessions.claim(socket, await rooms.authenticate(created.credential), false);
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
    const actor = await sessions.claim(socket, await rooms.authenticate(joined.credential), false);
    const { room } = await gameplay.snapshot(actor);
    publisher.roomUpdated(room);
    return { data: { room, player: room.players.find((p) => p.playerId === actor.playerId)!, credential: joined.credential }, roomVersion: room.roomVersion };
  });

  on("room:resume", async (_requestId, body) => {
    const input = readFields<{ credential: unknown; takeover?: boolean; knownStateVersion?: number }>(body, RULES.resume);
    const verified = await rooms.authenticate(input.credential);
    const bound = socket.data.actor;
    if (bound && bound.playerId !== verified.playerId) throw new TransportError("already-in-room", "This connection already controls another seat");
    // Claiming again from the controlling connection is a no-op, so a retried resume is harmless.
    const actor = await sessions.claim(socket, verified, input.takeover === true);
    const snapshot = await gameplay.snapshot(actor);
    const missedActions =
      input.knownStateVersion !== undefined && snapshot.game && input.knownStateVersion < snapshot.game.stateVersion
        ? await gameplay.actionsSince(actor, input.knownStateVersion)
        : input.knownStateVersion !== undefined && snapshot.game
          ? []
          : null;
    return {
      data: { ...snapshot, player: snapshot.room.players.find((p) => p.playerId === actor.playerId)!, missedActions },
      roomVersion: snapshot.room.roomVersion,
      stateVersion: snapshot.game?.stateVersion ?? null,
    };
  });

  on("room:leave", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedRoomVersion?: number }>(body, RULES.roomVersionOnly);
    const room = await rooms.leaveRoom(actor, input);
    await sessions.forget(socket);
    publisher.roomUpdated(room);
    return { data: { left: true as const }, roomVersion: room.roomVersion };
  });

  on("room:getState", async (_requestId, body) => {
    const actor = requireActor();
    readFields(body, RULES.none);
    const snapshot = await gameplay.snapshot(actor);
    return { data: snapshot, roomVersion: snapshot.room.roomVersion, stateVersion: snapshot.game?.stateVersion ?? null };
  });

  on("room:transferHost", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ playerId: string; expectedRoomVersion?: number }>(body, RULES.transferHost);
    const room = await rooms.transferHost(actor, input);
    publisher.roomUpdated(room);
    return { data: { room }, roomVersion: room.roomVersion };
  });

  on("room:close", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedRoomVersion?: number }>(body, RULES.roomVersionOnly);
    const room = await rooms.closeRoom(actor, input);
    publisher.roomUpdated(room);
    return { data: { room }, roomVersion: room.roomVersion };
  });

  // ── Sessions ─────────────────────────────────────────────────────────────

  on("session:rotate", async (_requestId, body) => {
    const actor = requireActor();
    readFields(body, RULES.none);
    return { data: { credential: await rooms.rotateCredential(actor) } };
  });

  on("session:confirmCredential", async (_requestId, body) => {
    const actor = requireActor();
    const { secret } = readFields<{ secret: string }>(body, RULES.confirmCredential);
    return { data: { credentialVersion: await rooms.confirmRotation(actor, secret) } };
  });

  // ── Gameplay ─────────────────────────────────────────────────────────────

  on("game:start", async (requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedRoomVersion?: number }>(body, RULES.roomVersionOnly);
    const started = await gameplay.start(actor, { requestId, ...input });
    return { data: { room: started.room, game: started.game }, roomVersion: started.room.roomVersion, stateVersion: started.game.stateVersion };
  });

  on("game:roll", async (requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedStateVersion: number }>(body, RULES.roll);
    const outcome = await gameplay.roll(actor, { requestId, ...input });
    return { data: { action: outcome.action, replayed: outcome.replayed, game: outcome.game }, roomVersion: outcome.roomVersion, stateVersion: outcome.game.stateVersion };
  });

  on("game:move", async (requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedStateVersion: number; tokenId: number }>(body, RULES.move);
    const outcome = await gameplay.move(actor, { requestId, ...input });
    return { data: { action: outcome.action, replayed: outcome.replayed, game: outcome.game }, roomVersion: outcome.roomVersion, stateVersion: outcome.game.stateVersion };
  });

  on("game:pause", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedRoomVersion?: number }>(body, RULES.roomVersionOnly);
    const outcome = await gameplay.pause(actor, input);
    return { data: outcome, roomVersion: outcome.room.roomVersion };
  });

  on("game:resume", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ expectedRoomVersion?: number }>(body, RULES.roomVersionOnly);
    const outcome = await gameplay.resume(actor, input);
    return { data: outcome, roomVersion: outcome.room.roomVersion };
  });

  on("game:getHistory", async (_requestId, body) => {
    const actor = requireActor();
    const input = readFields<{ afterSeq?: number; limit?: number }>(body, RULES.history);
    return { data: await gameplay.history(actor, input) };
  });
}
