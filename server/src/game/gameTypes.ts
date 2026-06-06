// Re-export the shared types so all existing server imports
// (`./gameTypes.js`) keep working, while the definitions live in one place
// (shared/types.d.ts at the repo root).
export type * from "../../../shared/types";

import type { GameState, PlayerColor } from "../../../shared/types";

// Server-only types (the client never needs these).
export interface Room {
  id: string;
  hostId: string;
  maxPlayers: number;
  gameState: GameState;
}

export interface MoveResult {
  valid: boolean;
  reason?: string;
  capturedToken?: { color: PlayerColor; tokenId: number };
  reachedHome?: boolean;
}
