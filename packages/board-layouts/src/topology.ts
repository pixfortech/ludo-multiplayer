// Board TOPOLOGY — the logical structure of every board, 2–15 players.
//
// This is the single source of truth for track length, start offsets, safe
// cells, lane length and finish step. The rules engine and both renderers
// import it from "@ludo/board-layouts/topology"; nobody re-derives indices.
// Pure data and arithmetic: no geometry, no visual dependencies.
//
// Step convention (every variant): a seat's token is at step 0 on its start
// cell, steps 0…lastTrackStep on the shared track, then `laneLength` lane
// steps, then `finishStep`. Classic: 0–50 track, 51–55 lane, 56 finish.

import { isPlayerCount, type PlayerCount } from "@ludo/shared-types";

export type BoardVariant = "classic-square" | "rectangle" | "triangle" | "ring";

export interface BoardTopology {
  variant: BoardVariant;
  /** Sides of the board outline. */
  sides: number;
  /** Seats the board is built for (a 2-player game on the square uses 2 of 4). */
  boardSeats: number;
  /** Board seats occupied by players, in turn order. */
  activeSeats: readonly number[];
  /** Track cells per seat segment (`S`). */
  segmentLength: number;
  /** Shared track cells: boardSeats × segmentLength. */
  trackLength: number;
  /** Absolute track index of each board seat's start cell. */
  startIndex: readonly number[];
  /** Absolute indices where no capture can happen. Sorted. */
  safeIndices: readonly number[];
  laneLength: number;
  /** Last shared-track step (the turn-in cell): trackLength − 2. */
  lastTrackStep: number;
  /** Step of the finish: lastTrackStep + laneLength + 1. */
  finishStep: number;
}

export const LANE_LENGTH = 5;
const CLASSIC_SEGMENT = 13;
/** Classic safe offsets within a seat's segment: start, star. */
const CLASSIC_SAFE_OFFSETS = [0, 8];

/** Ring boards (5–15): cells per side, chosen so every board is ~24–28 cells across with a 60–75 cell lap. */
export const RING_SEGMENT_LENGTH: Readonly<Record<number, number>> = {
  5: 12, 6: 11, 7: 9, 8: 8, 9: 7, 10: 7, 11: 6, 12: 6, 13: 5, 14: 5, 15: 5,
};

/** Ring boards add a star per segment only when the segment is long enough to stay within 10–20% safe density. */
export const RING_STAR_MIN_SEGMENT = 11;

/** Star offset generalised from classic (8 of a 13-cell segment, measured against the 11 cells before the next turn-in). */
export const ringStarOffset = (segment: number): number => Math.round(((segment - 2) * 8) / 11);

function build(
  variant: BoardVariant,
  sides: number,
  boardSeats: number,
  segmentLength: number,
  safeOffsetsPerSegment: readonly number[],
  activeSeats: readonly number[] = Array.from({ length: boardSeats }, (_, i) => i),
): BoardTopology {
  const trackLength = boardSeats * segmentLength;
  const startIndex = Array.from({ length: boardSeats }, (_, seat) => seat * segmentLength);
  const safeIndices = [...new Set(startIndex.flatMap((start) => safeOffsetsPerSegment.map((o) => (start + o) % trackLength)))].sort(
    (a, b) => a - b,
  );
  const lastTrackStep = trackLength - 2;
  return {
    variant,
    sides,
    boardSeats,
    activeSeats,
    segmentLength,
    trackLength,
    startIndex,
    safeIndices,
    laneLength: LANE_LENGTH,
    lastTrackStep,
    finishStep: lastTrackStep + LANE_LENGTH + 1,
  };
}

/** Traditional 4-player square. */
export const CLASSIC_TOPOLOGY: BoardTopology = build("classic-square", 4, 4, CLASSIC_SEGMENT, CLASSIC_SAFE_OFFSETS);

export interface TopologyOptions {
  /** 2 players only: the default rectangle, or the classic square with diagonally opposite seats. */
  twoPlayerBoard?: "rectangle" | "square";
}

export function topologyFor(playerCount: PlayerCount, options: TopologyOptions = {}): BoardTopology {
  if (!isPlayerCount(playerCount)) throw new RangeError(`Unsupported player count ${String(playerCount)}`);
  switch (playerCount) {
    case 2:
      return options.twoPlayerBoard === "square"
        ? { ...CLASSIC_TOPOLOGY, activeSeats: [0, 2] }
        : // Two half-lap segments of 26; safe offsets reproduce classic's 8 absolute safe indices.
          build("rectangle", 4, 2, 26, [0, 8, 13, 21]);
    case 3:
      return build("triangle", 3, 3, 17, [0, 8]);
    case 4:
      return CLASSIC_TOPOLOGY;
    default: {
      const segment = RING_SEGMENT_LENGTH[playerCount]!;
      const offsets = segment >= RING_STAR_MIN_SEGMENT ? [0, ringStarOffset(segment)] : [0];
      return build("ring", playerCount, playerCount, segment, offsets);
    }
  }
}

/** Absolute track index of a seat's token at `step`, or null once it has left the shared track. */
export function absoluteTrackIndex(topology: BoardTopology, seat: number, step: number): number | null {
  if (!Number.isInteger(step) || step < 0) throw new RangeError(`Invalid step ${step}`);
  if (step > topology.lastTrackStep) return null;
  const start = topology.startIndex[seat];
  if (start === undefined) throw new RangeError(`Invalid seat ${seat}`);
  return (start + step) % topology.trackLength;
}

export function isSafeIndex(topology: BoardTopology, absoluteIndex: number): boolean {
  return topology.safeIndices.includes(absoluteIndex);
}

export type StepZone = "track" | "lane" | "finish";

export function stepZone(topology: BoardTopology, step: number): StepZone {
  if (step <= topology.lastTrackStep) return "track";
  return step < topology.finishStep ? "lane" : "finish";
}
