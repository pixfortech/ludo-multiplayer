// The 15 player identities. Each seat is identified by colour AND symbol, so
// colour is never the only cue. Body colours are tuned for perceptual distance
// (see __tests__/palette.test.ts and docs/design/color-identities.md); every
// other shade is derived deterministically so 2D and 3D always agree.

import { contrastRatio, hexToLab, labToHex, mixLab } from "./color.js";
import type { SymbolId } from "./symbols.js";

/** Board surfaces are identical in light and dark UI themes, so token contrast is checked once. */
export const BOARD_SURFACES = {
  /** Track and lane cell fill. */
  cell: "#F7F4EE",
  /** Board body between cells and the frame. */
  base: "#ECE6DC",
  /** Cell separators. */
  line: "#D8D0C2",
  /** Safe-cell star mark on a plain cell. */
  safeMark: "#8E8676",
} as const;

export const INK = { light: "#FFFFFF", dark: "#141821" } as const;

interface IdentitySeed {
  id: string;
  name: string;
  body: string;
  symbol: SymbolId;
  /** Overrides the automatic symbol ink (used for the gold-on-graphite identity). */
  ink?: string;
}

// Seat order: 1–4 are the traditional colours; 5–15 are ordered greedily so
// every default N-player set maximises the worst-case distance across normal
// vision and the three colour-vision deficiencies (see palette-report.md).
const SEEDS: readonly IdentitySeed[] = [
  { id: "crimson", name: "Crimson", body: "#C8102E", symbol: "heart" },
  { id: "royal-blue", name: "Royal Blue", body: "#1F5FD6", symbol: "drop" },
  { id: "emerald", name: "Emerald", body: "#16B060", symbol: "leaf" },
  { id: "golden", name: "Golden Yellow", body: "#F5BE00", symbol: "bolt" },
  { id: "graphite", name: "Graphite & Gold", body: "#3B4150", symbol: "bars", ink: "#E3B341" },
  { id: "mint", name: "Mint", body: "#86E3C6", symbol: "chevron" },
  { id: "orange", name: "Vivid Orange", body: "#F26419", symbol: "triangle" },
  { id: "turquoise", name: "Turquoise", body: "#0E8C84", symbol: "circle" },
  { id: "indigo", name: "Indigo", body: "#2E2A85", symbol: "hexagon" },
  { id: "rose", name: "Rose", body: "#F47FA4", symbol: "cross" },
  { id: "cyan", name: "Cyan", body: "#1EB8E6", symbol: "diamond" },
  { id: "magenta", name: "Magenta", body: "#C8239A", symbol: "flower" },
  { id: "amber", name: "Amber", body: "#A86A12", symbol: "square" },
  { id: "purple", name: "Royal Purple", body: "#7B3FD1", symbol: "crescent" },
  { id: "lime", name: "Lime", body: "#9ACD32", symbol: "plus" },
];

export interface PlayerIdentity {
  /** Seat order: 1–15. Seats 1–4 are the traditional red, blue, green, yellow. */
  seat: number;
  id: string;
  name: string;
  symbol: SymbolId;
  /** Main token / base / lane-accent colour. */
  body: string;
  /** Darker outline; always ≥ 3:1 against the board cell (WCAG 1.4.11). */
  rim: string;
  /** Specular/gloss tint for the 2D token and 3D sheen. */
  highlight: string;
  /** Softened lane and base fill so tokens stay legible on their own colour. */
  lane: string;
  /** Symbol colour on the body. */
  ink: string;
}

function deriveRim(body: string): string {
  const [l, a, b] = hexToLab(body);
  return labToHex([Math.min(l - 22, 28), a * 0.85, b * 0.85]);
}

function deriveHighlight(body: string): string {
  const [l, a, b] = hexToLab(body);
  return labToHex([Math.min(l + 18, 97), a * 0.55, b * 0.55]);
}

function pickInk(body: string): string {
  return contrastRatio(body, INK.light) >= contrastRatio(body, INK.dark) ? INK.light : INK.dark;
}

export const PLAYER_IDENTITIES: readonly PlayerIdentity[] = SEEDS.map((seed, index) => ({
  seat: index + 1,
  id: seed.id,
  name: seed.name,
  symbol: seed.symbol,
  body: seed.body,
  rim: deriveRim(seed.body),
  highlight: deriveHighlight(seed.body),
  lane: mixLab(seed.body, BOARD_SURFACES.cell, 0.3),
  ink: seed.ink ?? pickInk(seed.body),
}));

/** Token halo: a thin light ring outside the rim, so a token stays visible on any coloured cell. */
export const TOKEN_HALO = "#FFFFFF";

/** Default seat colours for an N-player room (players may still choose others in the lobby). */
export function defaultIdentitiesFor(playerCount: number): readonly PlayerIdentity[] {
  return PLAYER_IDENTITIES.slice(0, playerCount);
}
