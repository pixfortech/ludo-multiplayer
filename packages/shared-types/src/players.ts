// Player-count vocabulary shared by every layer.
//
// Classic Ludo is 2–4 players; the platform extends to 15 using polygon boards
// (see docs/rules/expanded-players.md). Each player always has 4 tokens.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 15;
export const TOKENS_PER_PLAYER = 4;

export const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];

export function isPlayerCount(value: unknown): value is PlayerCount {
  return typeof value === "number" && (PLAYER_COUNTS as readonly number[]).includes(value);
}

/** The board's outline is chosen by how many seats the room has. */
export type BoardShape =
  | "rectangle"
  | "triangle"
  | "square"
  | "pentagon"
  | "hexagon"
  | "heptagon"
  | "octagon"
  | "nonagon"
  | "decagon"
  | "hendecagon"
  | "dodecagon"
  | "tridecagon"
  | "tetradecagon"
  | "pentadecagon";

export const BOARD_SHAPE_BY_PLAYER_COUNT: Readonly<Record<PlayerCount, BoardShape>> = {
  2: "rectangle",
  3: "triangle",
  4: "square",
  5: "pentagon",
  6: "hexagon",
  7: "heptagon",
  8: "octagon",
  9: "nonagon",
  10: "decagon",
  11: "hendecagon",
  12: "dodecagon",
  13: "tridecagon",
  14: "tetradecagon",
  15: "pentadecagon",
};

/** 2–4 players use the traditional rules; 5–15 use the expanded polygon variant. */
export type RuleFamily = "classic" | "expanded";

export function ruleFamilyFor(count: PlayerCount): RuleFamily {
  return count <= 4 ? "classic" : "expanded";
}
