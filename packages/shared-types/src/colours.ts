// Player colour identities as the server knows them: stable ids and display
// names, in seat order. The visual definition (shades, symbols, contrast) lives
// in @ludo/design-tokens, whose palette test checks that ids and names match
// this list exactly.

import { MAX_PLAYERS } from "./players.js";

export interface PlayerColour {
  /** Stable id, stored in players.colour. */
  id: string;
  /** Display name. */
  name: string;
}

export const PLAYER_COLOURS: readonly PlayerColour[] = [
  { id: "crimson", name: "Crimson" },
  { id: "royal-blue", name: "Royal Blue" },
  { id: "emerald", name: "Emerald" },
  { id: "golden", name: "Golden Yellow" },
  { id: "graphite", name: "Graphite & Gold" },
  { id: "mint", name: "Mint" },
  { id: "orange", name: "Vivid Orange" },
  { id: "turquoise", name: "Turquoise" },
  { id: "indigo", name: "Indigo" },
  { id: "rose", name: "Rose" },
  { id: "cyan", name: "Cyan" },
  { id: "magenta", name: "Magenta" },
  { id: "amber", name: "Amber" },
  { id: "purple", name: "Royal Purple" },
  { id: "lime", name: "Lime" },
];

/** The classic square board always has four corner seats, whatever the room size. */
export const CLASSIC_BOARD_SEATS = 4;

/**
 * Seats on the board a room of `maxPlayers` plays on: 4 for classic (2–4
 * players), and one seat per player on the expanded polygon boards (5–15).
 */
export function boardSeatCount(maxPlayers: number): number {
  return maxPlayers <= CLASSIC_BOARD_SEATS ? CLASSIC_BOARD_SEATS : Math.min(maxPlayers, MAX_PLAYERS);
}

/** Colours offered in a room, in seat order: colour i belongs to seat i. */
export function coloursForRoom(maxPlayers: number): readonly PlayerColour[] {
  return PLAYER_COLOURS.slice(0, boardSeatCount(maxPlayers));
}

export function colourById(id: string): PlayerColour | undefined {
  return PLAYER_COLOURS.find((c) => c.id === id);
}
