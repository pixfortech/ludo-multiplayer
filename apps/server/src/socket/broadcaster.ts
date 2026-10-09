// Sends committed changes to everyone in a room. Called only after the
// database has committed. Within this process it never sends a game state or
// room view older than one it already sent for that room, so a slow request
// can never roll clients back; clients also ignore older versions.

import type { GameActionView, GameStateView, RoomView } from "@ludo/shared-types";
import type { GameFinishedNotice, GamePublisher } from "../gameplay/gameEvents.js";
import { roomChannel, type LudoServer } from "./socketEvents.js";

const MAX_TRACKED_ROOMS = 10_000;

export class SocketPublisher implements GamePublisher {
  private readonly stateVersions = new Map<string, number>();
  private readonly roomVersions = new Map<string, number>();

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
  }

  gameAction(roomId: string, action: GameActionView): void {
    this.io.to(roomChannel(roomId)).emit("game:event", { roomId, action });
  }

  gameState(roomId: string, game: GameStateView): void {
    if (this.advance(this.stateVersions, roomId, game.stateVersion, false)) {
      this.io.to(roomChannel(roomId)).emit("game:state", { roomId, game });
    }
  }

  gameFinished(roomId: string, notice: GameFinishedNotice): void {
    this.io.to(roomChannel(roomId)).emit("game:finished", { roomId, ...notice });
  }
}
