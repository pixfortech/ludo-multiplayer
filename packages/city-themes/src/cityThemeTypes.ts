// The shape of a city theme. A theme is presentation data only: it dresses
// the one classic board (same cells, path, safe cells, bases and lanes) and
// never touches rules, topology, networking or persistence beyond its id.
// Renderers (2D and 3D) read these fields; nothing here draws anything.

import type { CityThemeId } from "@ludo/shared-types";

export type { CityThemeId };

/** Board seat 0–3: 0 crimson (top left), 1 royal blue (top right), 2 emerald (bottom right), 3 golden (bottom left). */
export type SeatIndex = 0 | 1 | 2 | 3;

/**
 * Where an asset stands today (in 2D). "procedural": original artwork drawn in
 * code; "placeholder": a simple stand-in shape; "planned": not drawn yet (not
 * shown). 3D models are tracked separately (docs/architecture/3d-readiness.md).
 */
export type AssetStatus = "procedural" | "placeholder" | "planned";

export interface AssetRef {
  id: string;
  status: AssetStatus;
  /** What the asset should show (a brief for whoever makes it). */
  brief: string;
}

export interface ThemePalette {
  /** Sky gradient, top to horizon. */
  sky: readonly [string, string];
  /** The world around the board (paving, promenade). */
  ground: string;
  groundAccent: string;
  /** River or sea, when the city has one. */
  water: string | null;
  /** The board's frame or plinth. */
  boardFrame: string;
  /** Track and lane cells: always light, so tokens and the path stay readable. */
  boardCell: string;
  boardLine: string;
  /** The city's UI accent, and text on it. */
  accent: string;
  accentInk: string;
  /** A soft card tint for city panels. */
  surface: string;
  ink: string;
}

/** One colour corner of the board, reimagined as a district of the city. */
export interface District {
  seat: SeatIndex;
  name: string;
  /** Three words, like a district's signboard. */
  motto: string;
  /** The landmark or feature that stands in this corner. */
  feature: string;
}

export interface Landmark {
  id: string;
  name: string;
  /** "hero": the one seen on the horizon. "supporting": smaller, around the edge. */
  role: "hero" | "supporting";
  placement: "horizon" | "edge" | "corner";
  /** For corner landmarks, the district they belong to. */
  seat?: SeatIndex;
  asset: AssetRef;
}

export interface WorldProp {
  id: string;
  name: string;
  kind: "vehicle" | "street" | "nature" | "water" | "signage" | "architecture";
  /** How often it may appear; renderers thin props out further on small screens. */
  density: "low" | "medium";
  asset: AssetRef;
}

export interface SignageVoice {
  /** The city wordmark. */
  wordmark: string;
  /** Short lines for signboards and loading screens (original copy). */
  slogans: readonly string[];
  /** A sample in the city's script, for typography accents (with its meaning). */
  script: { language: LanguageTag; text: string; meaning: string } | null;
}

export type LanguageTag = "en" | "bn" | "hi" | "ta" | "kn" | "mr";

/** Game moments a theme can react to (dialogue, emotions, world reactions). */
export type GameMoment = "game-start" | "dice-roll" | "six" | "capture" | "captured" | "home" | "bonus-turn" | "turn-lost" | "near-win" | "victory";
export const GAME_MOMENTS: readonly GameMoment[] = ["game-start", "dice-roll", "six", "capture", "captured", "home", "bonus-turn", "turn-lost", "near-win", "victory"];

/** A restrained, city-specific world reaction (Batch D renders these). */
export interface CityReaction {
  moment: GameMoment;
  /** What happens, e.g. "a tram bell and a brief river shimmer". */
  description: string;
  /** Hook for the audio profile; no audio ships yet. */
  cue: string | null;
}

export interface AudioProfile {
  ambience: string;
  /** Cue ids per moment (hooks only: no audio files exist yet). */
  cues: Partial<Record<GameMoment, string>>;
}

export interface CityTheme {
  id: CityThemeId;
  name: string;
  /** The name in the city's own script (null for the classic table). */
  nativeName: string | null;
  tagline: string;
  descriptor: string;
  mood: readonly string[];
  /** How the city "speaks": guides dialogue and copy. */
  tone: string;
  palette: ThemePalette;
  districts: readonly [District, District, District, District];
  landmarks: readonly Landmark[];
  props: readonly WorldProp[];
  groundPattern: { id: string; brief: string };
  signage: SignageVoice;
  reactions: readonly CityReaction[];
  audio: AudioProfile;
  /** Ids into the other registries. */
  environmentPreset: string;
  dialoguePack: string;
  emotionPack: string;
  /** The city card's illustration. */
  preview: AssetRef;
}
