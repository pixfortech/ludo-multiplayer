// Sends committed changes to everyone in a room. Called only after the
// database has committed. Within this process it never sends a game state or
// room view older than one it already sent for that room, so a slow request
// can never roll clients back; clients also ignore older versions.

import type { GameActionView, GameStateView, PauseInfo, RoomView } from "@ludo/shared-types";
import type { GameFinishedNotice, GamePublisher } from "../gameplay/gameEvents.js";
import { roomChannel, type LudoServer } from "./socketEvents.js";

const MAX_TRACKED_ROOMS = 10_000;

/** Observers of committed changes (the reconnect monitor uses these to decide when to pause). */
export interface PublishListener {
  onRoom?(room: RoomView): void;
  onGameState?(roomId: string, game: GameStateView): void;
}

export class SocketPublisher implements GamePublisher {
  private readonly stateVersions = new Map<string, number>();
  private readonly roomVersions = new Map<string, number>();
  listener: PublishListener = {};

  constructor(private readonly io: LudoServer) {}

  private advance(map: Map<string, number>, roomId: string, version: number, allowEqual: boolean): boolean {
    const last = map.get(roomId);
    if (last !== undefined && (version < last || (!allowEqual && version === last))) return false;
    map.delete(roomId);
    map.set(roomId, version);
    if (map.size > MAX_TRACKED_ROOMS) map.delete(map.keys().next().value!);
    return true;
  }

  roomUpdated(room: RoomView): void {
    // Equal versions pass: presence changes do not bump the room version.
    if (this.advance(this.roomVersions, room.roomId, room.roomVersion, true)) {
      this.io.to(roomChannel(room.roomId)).emit("room:updated", { room });
    }
    this.listener.onRoom?.(room);
  }

  gameAction(roomId: string, action: GameActionView): void {
    this.io.to(roomChannel(roomId)).emit("game:event", { roomId, action });
  }

  gameState(roomId: string, game: GameStateView): void {
    if (this.advance(this.stateVersions, roomId, game.stateVersion, false)) {
      this.io.to(roomChannel(roomId)).emit("game:state", { roomId, game });
    }
    this.listener.onGameState?.(roomId, game);
  }

  gameFinished(roomId: string, notice: GameFinishedNotice): void {
    this.io.to(roomChannel(roomId)).emit("game:finished", { roomId, ...notice });
  }

  gamePaused(roomId: string, notice: { roomVersion: number; pause: PauseInfo }): void {
    this.io.to(roomChannel(roomId)).emit("game:paused", { roomId, ...notice });
  }

  gameResumed(roomId: string, notice: { roomVersion: number }): void {
    this.io.to(roomChannel(roomId)).emit("game:resumed", { roomId, ...notice });
  }
}
