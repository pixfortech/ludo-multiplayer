// Design tokens for the Ludo client.
//
// PLAYER_COLORS holds full Tailwind class strings (never built by concatenation)
// so the JIT compiler can see every class. PLAYER_PALETTE is a future-facing
// list of up to 15 distinct hues used for the player-count selector preview and
// for slot avatars; only the first four map to real, playable PlayerColors today.

import type { PlayerColor } from "./types";

export interface ColorTokens {
  /** Solid fill, e.g. token / dot background. */
  solid: string;
  /** Light text in the player's hue. */
  text: string;
  /** Focus / selection ring. */
  ring: string;
  /** Card border in the player's hue. */
  border: string;
  /** Faint tinted surface for panels. */
  soft: string;
  /** Coloured glow shadow. */
  glow: string;
  /** Raw hex for inline styles (dots, gradients). */
  hex: string;
}

export const PLAYER_COLORS: Record<PlayerColor, ColorTokens> = {
  red: {
    solid: "bg-rose-500",
    text: "text-rose-300",
    ring: "ring-rose-400",
    border: "border-rose-500/50",
    soft: "bg-rose-500/10",
    glow: "shadow-rose-500/40",
    hex: "#f43f5e",
  },
  blue: {
    solid: "bg-sky-500",
    text: "text-sky-300",
    ring: "ring-sky-400",
    border: "border-sky-500/50",
    soft: "bg-sky-500/10",
    glow: "shadow-sky-500/40",
    hex: "#0ea5e9",
  },
  green: {
    solid: "bg-emerald-500",
    text: "text-emerald-300",
    ring: "ring-emerald-400",
    border: "border-emerald-500/50",
    soft: "bg-emerald-500/10",
    glow: "shadow-emerald-500/40",
    hex: "#10b981",
  },
  yellow: {
    solid: "bg-amber-400",
    text: "text-amber-300",
    ring: "ring-amber-300",
    border: "border-amber-400/50",
    soft: "bg-amber-400/10",
    glow: "shadow-amber-400/40",
    hex: "#fbbf24",
  },
};

export function colorTokens(color: PlayerColor): ColorTokens {
  return PLAYER_COLORS[color];
}

export const COLOR_LABEL: Record<PlayerColor, string> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
};

// Up to 15 distinct hues. The first four match the real PlayerColors; the rest
// are reserved for future large-table support (visual only for now).
export const PLAYER_PALETTE: string[] = [
  "#f43f5e", // 1 red
  "#0ea5e9", // 2 blue
  "#10b981", // 3 green
  "#fbbf24", // 4 yellow
  "#a855f7", // 5 purple
  "#f97316", // 6 orange
  "#ec4899", // 7 pink
  "#14b8a6", // 8 teal
  "#06b6d4", // 9 cyan
  "#84cc16", // 10 lime
  "#6366f1", // 11 indigo
  "#f59e0b", // 12 amber
  "#22d3ee", // 13 light cyan
  "#d946ef", // 14 fuchsia
  "#fb7185", // 15 light rose
];

// Player counts the server can actually run today. The selector renders 2–15
// but only these are enabled; the rest are shown as "soon".
export const PLAYABLE_COUNTS = [2, 3, 4] as const;
export const MAX_VISUAL_PLAYERS = 15;
