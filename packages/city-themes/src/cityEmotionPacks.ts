// Emotion states for tokens and player avatars. A state is a small, restrained
// expression (an icon, a motion and a short label) that a renderer may show
// beside a token or a player panel. States never replace game information:
// the label is for assistive tech and captions, and every motion has a
// still equivalent under reduced motion.

import type { CityThemeId } from "./cityThemeTypes.js";

export type EmotionState =
  | "idle"
  | "selected"
  | "excited"
  | "confident"
  | "shocked"
  | "celebratory"
  | "disappointed"
  | "victory"
  | "capture-reaction"
  | "near-home-tension";

export const EMOTION_STATES: readonly EmotionState[] = [
  "idle",
  "selected",
  "excited",
  "confident",
  "shocked",
  "celebratory",
  "disappointed",
  "victory",
  "capture-reaction",
  "near-home-tension",
];

/** Motions a renderer knows how to play (all short, all optional). */
export type EmotionMotion = "none" | "breathe" | "lift" | "bounce" | "hop" | "jolt" | "sway" | "sag" | "spin" | "pulse" | "tremble";

export interface Emotion {
  /** An icon id from the internal icon set (drawn, not emoji). */
  icon: string;
  motion: EmotionMotion;
  /** A short label for screen readers and captions. */
  label: string;
  /** The city's flavour of the expression (art direction for Batch D). */
  flavour: string;
}

export interface EmotionPack {
  id: CityThemeId;
  states: Readonly<Record<EmotionState, Emotion>>;
}

// The shared base: the same motions everywhere, so every city reads the same way. Cities add flavour.
const BASE: Readonly<Record<EmotionState, Omit<Emotion, "flavour">>> = {
  idle: { icon: "face.calm", motion: "breathe", label: "Waiting" },
  selected: { icon: "face.ready", motion: "lift", label: "Ready" },
  excited: { icon: "face.excited", motion: "bounce", label: "Excited" },
  confident: { icon: "face.confident", motion: "sway", label: "Confident" },
  shocked: { icon: "face.shocked", motion: "jolt", label: "Shocked" },
  celebratory: { icon: "face.joy", motion: "hop", label: "Celebrating" },
  disappointed: { icon: "face.sad", motion: "sag", label: "Disappointed" },
  victory: { icon: "face.victory", motion: "spin", label: "Victorious" },
  "capture-reaction": { icon: "face.fierce", motion: "pulse", label: "Captured a token" },
  "near-home-tension": { icon: "face.tense", motion: "tremble", label: "Nearly home" },
};

function pack(id: CityThemeId, flavour: Readonly<Record<EmotionState, string>>): EmotionPack {
  const states = Object.fromEntries(EMOTION_STATES.map((s) => [s, { ...BASE[s], flavour: flavour[s] }])) as Record<EmotionState, Emotion>;
  return { id, states };
}

export const CITY_EMOTION_PACKS: Readonly<Record<CityThemeId, EmotionPack>> = {
  classic: pack("classic", {
    idle: "Still",
    selected: "A small lift",
    excited: "A quick bounce",
    confident: "A slow sway",
    shocked: "A short jolt",
    celebratory: "A hop",
    disappointed: "A slight sag",
    victory: "One turn",
    "capture-reaction": "One pulse",
    "near-home-tension": "A faint tremble",
  }),
  kolkata: pack("kolkata", {
    idle: "Unhurried, like an afternoon adda",
    selected: "Looks up from a book",
    excited: "Bounces like a tram over points",
    confident: "A knowing sway",
    shocked: "A startled jolt, then a laugh",
    celebratory: "A festive hop, Puja-bright",
    disappointed: "A sigh by the river",
    victory: "A slow, proud turn under the lamps",
    "capture-reaction": "A bright pulse, like a tram bell",
    "near-home-tension": "Holding breath on the bridge",
  }),
  delhi: pack("delhi", {
    idle: "Upright and composed",
    selected: "Squares up, ready to march",
    excited: "A drum-beat bounce",
    confident: "A swagger",
    shocked: "A sharp jolt",
    celebratory: "A parade hop",
    disappointed: "Shoulders drop, then rise",
    victory: "A ceremonial turn",
    "capture-reaction": "A bold pulse",
    "near-home-tension": "Steady, then a tremble at the gate",
  }),
  chennai: pack("chennai", {
    idle: "Calm, like the morning tide",
    selected: "A graceful lift",
    excited: "A rhythmic, measured bounce",
    confident: "An easy sway",
    shocked: "A small, polite jolt",
    celebratory: "A hop in time, like a beat",
    disappointed: "A gentle sag",
    victory: "A turn like a temple bell's ring",
    "capture-reaction": "A wave-like pulse",
    "near-home-tension": "A held breath before the gopuram",
  }),
  mumbai: pack("mumbai", {
    idle: "Ready to rush",
    selected: "A quick lift, on cue",
    excited: "A filmy bounce",
    confident: "A hero sway",
    shocked: "A dramatic jolt",
    celebratory: "A big hop",
    disappointed: "A monsoon sag",
    victory: "A spotlight spin",
    "capture-reaction": "A fast pulse",
    "near-home-tension": "Last-train tremble",
  }),
  bengaluru: pack("bengaluru", {
    idle: "Relaxed, coffee in hand",
    selected: "A crisp lift",
    excited: "A light bounce",
    confident: "A cool sway",
    shocked: "A glitchy jolt",
    celebratory: "A hop under the rain trees",
    disappointed: "A brief sag, then a shrug",
    victory: "A clean spin",
    "capture-reaction": "A neon pulse",
    "near-home-tension": "A focused tremble",
  }),
};
