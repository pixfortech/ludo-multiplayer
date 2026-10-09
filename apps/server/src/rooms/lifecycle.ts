// Room lifecycle rules. The stored status is the single source of truth;
// "waiting" and "ready" are derived from it (lobby, split by member count), so
// there is never a second status to fall out of sync.
//
//   waiting ─(2nd player joins)─▶ ready ─(host starts)─▶ playing ⇄ paused
//      ▲            │                                      │
//      └(a player leaves)                                  ▼
//   lobby/playing/paused ─(host closes / everyone leaves)─▶ abandoned
//   finished | abandoned ─(host archives)─▶ archived

import { MIN_PLAYERS, canTransitionRoom, type JoinBlockReason, type RoomLifecycle, type RoomStatus } from "@ludo/shared-types";
import { RoomError } from "./errors.js";

export function deriveLifecycle(status: RoomStatus, activeCount: number): RoomLifecycle {
  if (status === "lobby") return activeCount >= MIN_PLAYERS ? "ready" : "waiting";
  return status;
}

/** Whether the host may start the game now. */
export const canStart = (status: RoomStatus, activeCount: number) => status === "lobby" && activeCount >= MIN_PLAYERS;

/** Why a new player cannot join (null = joinable). Archived rooms are treated as not found by callers. */
export function joinBlockReason(status: RoomStatus, activeCount: number, maxPlayers: number): JoinBlockReason | null {
  if (status === "playing" || status === "paused") return "game-already-started";
  if (status !== "lobby") return "room-closed";
  if (activeCount >= maxPlayers) return "room-full";
  return null;
}

const JOIN_BLOCK_MESSAGES: Record<JoinBlockReason, string> = {
  "room-full": "The room is full",
  "game-already-started": "The game has already started; players who were in it can rejoin from their own device",
  "room-closed": "This room has closed",
};

export function joinBlockError(reason: JoinBlockReason): RoomError {
  return new RoomError(reason, JOIN_BLOCK_MESSAGES[reason]);
}

export function assertTransition(from: RoomStatus, to: RoomStatus): void {
  if (!canTransitionRoom(from, to)) {
    throw new RoomError("invalid-transition", `A ${from} room cannot become ${to}`, { from, to });
  }
}
