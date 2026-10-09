// Seat sessions: which connection controls which seat, hand-over between
// connections, and pausing a game whose current player has gone away.
//
// Control: exactly one connection controls a seat. A connection claims a seat
// after creating, joining or resuming with a verified credential. If another
// connection already controls it, the claim fails (session-in-use) unless the
// caller asks to take over; the previous connection then receives
// session:ended "replaced". Every claim moves the seat's session epoch on in
// PostgreSQL, so an older connection — in this or any other process — cannot
// commit another action, even one already queued.
//
// Reconnect grace: when the player whose turn it is has no controlling
// connection, a timer starts. If they are still away when it fires, the game
// is paused ("connection-lost") in the database and the room is told. When
// that player claims their seat again, the game resumes automatically. Nobody's
// turn is skipped and nothing is removed.

import type { SessionEndReason } from "@ludo/shared-types";
import { ActionCoordinator } from "../gameplay/actionCoordinator.js";
import type { GameplayService } from "../gameplay/gameplayService.js";
import { RoomError } from "../rooms/errors.js";
import type { AuthenticatedPlayer, RoomService } from "../rooms/roomService.js";
import type { SocketPublisher } from "./broadcaster.js";
import type { ConnectionRegistry } from "./presence.js";
import { toProtocolError, type Logger } from "./socketErrors.js";
import { roomChannel, type LudoServer, type LudoSocket } from "./socketEvents.js";

/** Schedules the reconnect-grace callback. Injectable so tests can control time instead of waiting for it. */
export interface GraceScheduler {
  schedule(callback: () => void, delayMs: number): { cancel(): void };
}

export const realTimeScheduler: GraceScheduler = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.(); // never keeps a stopping process alive
    return { cancel: () => clearTimeout(timer) };
  },
};

export interface SessionManagerOptions {
  io: LudoServer;
  rooms: RoomService;
  gameplay: GameplayService;
  registry: ConnectionRegistry;
  publisher: SocketPublisher;
  /** How long the current player may be away before the game pauses. */
  graceMs: number;
  scheduler?: GraceScheduler;
  log: Logger;
}

export class SessionManager {
  private readonly claims = new ActionCoordinator();
  private readonly timers = new Map<string, { playerId: string; timer: { cancel(): void } }>();
  private disposed = false;

  constructor(private readonly o: SessionManagerOptions) {
    o.publisher.listener = {
      onRoom: (room) => {
        if (room.status === "playing") void this.evaluate(room.roomId);
        else this.clearTimer(room.roomId);
      },
      onGameState: (roomId, game) => this.watch(roomId, game.phase === "playing" ? "playing" : "finished", game.currentPlayerId),
    };
  }

  /**
   * Gives `socket` control of the verified seat. Serialised per player, so two
   * simultaneous claims cannot both win. Claiming a seat this socket already
   * controls returns the current identity (idempotent).
   */
  claim(socket: LudoSocket, actor: AuthenticatedPlayer, takeover: boolean): Promise<AuthenticatedPlayer> {
    return this.claims.run(`player:${actor.playerId}`, async () => {
      const { io, rooms, registry } = this.o;
      const currentId = registry.controllerOf(actor.playerId);
      if (currentId === socket.id && socket.data.actor?.playerId === actor.playerId) return socket.data.actor;
      const current = currentId ? io.sockets.sockets.get(currentId) : undefined;
      if (current && !takeover) {
        throw new RoomError("session-in-use", "This seat is open in another tab or device; resume with takeover to continue here");
      }
      // The database hand-over comes first: from here on, the previous connection's actions are refused.
      const controlled = await rooms.takeControl(actor);
      if (current) await this.detach(current, "replaced");
      else if (currentId) registry.release(actor.playerId, currentId);

      socket.data.actor = controlled;
      registry.set(controlled.playerId, socket.id);
      await socket.join(roomChannel(controlled.roomId));
      await rooms.setPresence(controlled, "connected");
      if (!current) socket.to(roomChannel(controlled.roomId)).emit("player:connected", { roomId: controlled.roomId, playerId: controlled.playerId });
      // If the game was paused waiting for this player, it continues now.
      await this.o.gameplay.resumeIfAwaited(controlled.roomId, controlled.playerId);
      void this.evaluate(controlled.roomId);
      return controlled;
    });
  }

  /** Detaches a connection from its seat (taken over elsewhere, or the session ended) and tells it why. */
  async detach(socket: LudoSocket, reason: SessionEndReason): Promise<void> {
    const actor = socket.data.actor;
    if (!actor) return;
    socket.data.actor = null;
    this.o.registry.release(actor.playerId, socket.id);
    await socket.leave(roomChannel(actor.roomId));
    socket.emit("session:ended", { roomId: actor.roomId, reason });
  }

  /** The player left the room on purpose: unbind without reporting a lost connection. */
  async forget(socket: LudoSocket): Promise<void> {
    const actor = socket.data.actor;
    if (!actor) return;
    socket.data.actor = null;
    this.o.registry.release(actor.playerId, socket.id);
    await socket.leave(roomChannel(actor.roomId));
  }

  /** A connection dropped. Seat, tokens and turn stay; the room is told, and the grace timer may start. */
  async release(socket: LudoSocket): Promise<void> {
    const actor = socket.data.actor;
    socket.data.actor = null;
    if (!actor || !this.o.registry.release(actor.playerId, socket.id)) return;
    try {
      await this.o.rooms.setPresence(actor, "disconnected");
    } catch (error) {
      toProtocolError(error, "disconnect", this.o.log); // logged; presence is best-effort
    }
    this.o.io.to(roomChannel(actor.roomId)).emit("player:disconnected", { roomId: actor.roomId, playerId: actor.playerId });
    await this.evaluate(actor.roomId);
  }

  /** After a restart: nobody is connected yet, so every running game gets a fresh grace period. */
  async recoverAfterRestart(): Promise<{ playersReset: number; gamesWatched: number }> {
    const playersReset = await this.o.gameplay.resetPresence();
    const rooms = await this.o.gameplay.roomsInPlay(10_000);
    await Promise.all(rooms.map((roomId) => this.evaluate(roomId)));
    return { playersReset, gamesWatched: rooms.length };
  }

  /** Re-reads whose turn it is and starts or stops the grace timer. */
  async evaluate(roomId: string): Promise<void> {
    try {
      const info = await this.o.gameplay.turnInfo(roomId);
      if (info) this.watch(roomId, info.status, info.currentPlayerId);
      else this.clearTimer(roomId);
    } catch (error) {
      toProtocolError(error, "reconnect monitor", this.o.log);
    }
  }

  /** Whether a grace timer is running for the room (tests and diagnostics). */
  waitingFor(roomId: string): string | null {
    return this.timers.get(roomId)?.playerId ?? null;
  }

  dispose(): void {
    this.disposed = true;
    for (const roomId of [...this.timers.keys()]) this.clearTimer(roomId);
  }

  private watch(roomId: string, status: string, currentPlayerId: string | null): void {
    if (this.disposed) return;
    const existing = this.timers.get(roomId);
    if (status !== "playing" || !currentPlayerId || this.o.registry.isControlled(currentPlayerId)) {
      this.clearTimer(roomId);
      return;
    }
    if (existing?.playerId === currentPlayerId) return;
    this.clearTimer(roomId);
    const timer = (this.o.scheduler ?? realTimeScheduler).schedule(() => {
      if (this.timers.get(roomId)?.timer !== timer) return; // cancelled or superseded
      this.timers.delete(roomId);
      this.o.gameplay
        .pauseIfAway(roomId, currentPlayerId, () => !this.o.registry.isControlled(currentPlayerId))
        .catch((error: unknown) => toProtocolError(error, "auto-pause", this.o.log));
    }, this.o.graceMs);
    this.timers.set(roomId, { playerId: currentPlayerId, timer });
  }

  private clearTimer(roomId: string): void {
    this.timers.get(roomId)?.timer.cancel();
    this.timers.delete(roomId);
  }
}
