// How committed changes leave the gameplay layer. The service calls a
// GamePublisher only after PostgreSQL has committed; the Socket.IO
// broadcaster implements it, tests record it. Nothing here knows about sockets.

import type { GameActionView, GameStateView, RoomView } from "@ludo/shared-types";

export interface GameFinishedNotice {
  stateVersion: number;
  winnerId: string | null;
  ranking: string[];
}

export interface GamePublisher {
  roomUpdated(room: RoomView): void;
  gameAction(roomId: string, action: GameActionView): void;
  gameState(roomId: string, game: GameStateView): void;
  gameFinished(roomId: string, notice: GameFinishedNotice): void;
}

export const SILENT_PUBLISHER: GamePublisher = {
  roomUpdated: () => undefined,
  gameAction: () => undefined,
  gameState: () => undefined,
  gameFinished: () => undefined,
};
