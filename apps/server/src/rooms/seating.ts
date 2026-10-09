// Seat and colour allocation. On every board, colour i belongs to seat i
// (classic: Crimson top-left, Royal Blue top-right, Emerald bottom-right,
// Golden Yellow bottom-left), so choosing a colour chooses a seat. The server
// is the only authority; clients only express a preference.

import { boardSeatCount, coloursForRoom, type PlayerColour } from "@ludo/shared-types";
import { RoomError } from "./errors.js";
import type { ColourChoice } from "./validation.js";

export interface SeatAssignment {
  seat: number;
  colour: string;
}

/** Circular distance between two seats on a ring of `size`. */
const ringDistance = (a: number, b: number, size: number) => Math.min(Math.abs(a - b), size - Math.abs(a - b));

/**
 * Deterministic automatic seat: the free seat farthest from every occupied one
 * (ties → lowest seat). An empty room gets seat 0; on the classic board a
 * second player sits opposite (seat 2), the traditional two-player layout.
 */
export function autoSeat(seatCount: number, occupied: readonly number[]): number | null {
  let best: number | null = null;
  let bestDistance = -1;
  for (let seat = 0; seat < seatCount; seat++) {
    if (occupied.includes(seat)) continue;
    const distance = occupied.length === 0 ? seatCount : Math.min(...occupied.map((o) => ringDistance(seat, o, seatCount)));
    if (distance > bestDistance) {
      best = seat;
      bestDistance = distance;
    }
  }
  return best;
}

/** The colours of the room's board that nobody active holds, in seat order. */
export function freeColours(maxPlayers: number, takenColours: readonly string[]): PlayerColour[] {
  return coloursForRoom(maxPlayers).filter((c) => !takenColours.includes(c.id));
}

/**
 * Assigns a seat and colour for a new member. Throws invalid-colour if the
 * colour is not on this room's board, colour-taken if someone holds it.
 * Capacity is checked by the caller.
 */
export function assignSeat(maxPlayers: number, occupied: readonly SeatAssignment[], choice: ColourChoice): SeatAssignment {
  const colours = coloursForRoom(maxPlayers);
  if (choice.kind === "colour") {
    const seat = colours.findIndex((c) => c.id === choice.colour);
    if (seat < 0) throw new RoomError("invalid-colour", "That colour is not available on this board");
    if (occupied.some((o) => o.colour === choice.colour || o.seat === seat)) {
      throw new RoomError("colour-taken", `${colours[seat]!.name} is already taken`, {
        colour: choice.colour,
        availableColours: freeColours(maxPlayers, occupied.map((o) => o.colour)).map((c) => c.id),
      });
    }
    return { seat, colour: choice.colour };
  }
  const seat = autoSeat(boardSeatCount(maxPlayers), occupied.map((o) => o.seat));
  if (seat === null) throw new RoomError("room-full", "The room is full");
  return { seat, colour: colours[seat]!.id };
}
