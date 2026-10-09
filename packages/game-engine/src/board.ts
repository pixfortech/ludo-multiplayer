// The engine's only window onto board geometry: the shared, approved topology
// from @ludo/board-layouts/topology. No path or index maths is duplicated here.

import { CLASSIC_TOPOLOGY, absoluteTrackIndex, isSafeIndex, type BoardTopology } from "@ludo/board-layouts/topology";
import type { GameState, PlayerState } from "./types.js";

export function topologyOf(state: Pick<GameState, "board">): BoardTopology {
  switch (state.board.variant) {
    case "classic-square":
      return CLASSIC_TOPOLOGY;
  }
}

/** Absolute shared-track index of a token, or null when it is in base, its lane or home. */
export function tokenTrackIndex(topology: BoardTopology, player: PlayerState, step: number | null): number | null {
  if (step === null) return null;
  return absoluteTrackIndex(topology, player.seat, step);
}

export function isOnSharedTrack(topology: BoardTopology, step: number | null): step is number {
  return step !== null && step <= topology.lastTrackStep;
}

export function isInLane(topology: BoardTopology, step: number | null): boolean {
  return step !== null && step > topology.lastTrackStep && step < topology.finishStep;
}

export function isHome(topology: BoardTopology, step: number | null): boolean {
  return step === topology.finishStep;
}

export { isSafeIndex };

/** Default seats per player count on the classic square (2 players sit diagonally opposite). */
export const CLASSIC_DEFAULT_SEATS: Readonly<Record<number, readonly number[]>> = {
  2: [0, 2],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
};
