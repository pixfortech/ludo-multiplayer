// Which human characters play for which seat, and where their files are.
//
// Kolkata: four teams of four (C.3A built the first, C.3B the other three),
// one team per seat. Characters are not tied to a colour: each file's
// team-coloured clothing (material "team") is tinted to the player's colour
// at runtime, so a team can play for any seat and any colour.
//
// characters.json is written by the character build (tools/characters); the
// GLB files are served from /characters/.

import type { CityThemeId } from "@ludo/city-themes";
import type { QualityLevel } from "../capabilities";
import type { IdleBehaviour } from "./brain";
import manifest from "./characters.json";

export interface CharacterLevel {
  file: string;
  bytes: number;
  triangles: number;
}

export interface CharacterEntry {
  number: number;
  role: string;
  idle: IdleBehaviour;
  prop: "cup" | "newspaper" | null;
  /** Height in metres (top of the head). */
  height: number;
  clips: Record<string, { frames: number; loop: boolean; speed?: number }>;
  levels: Record<QualityLevel, CharacterLevel>;
  /** Materials of the body (one draw call each): plain colours share one, with vertex colours. */
  materials: number;
}

export const CHARACTERS = (manifest as unknown as { characters: Record<string, CharacterEntry> }).characters;

/** Token 0..3 of a seat -> character, per city. */
export const CHARACTER_TEAMS: Partial<Record<CityThemeId, Partial<Record<number, readonly string[]>>>> = {
  kolkata: {
    0: ["adda", "tea", "newspaper", "exercise"],
    1: ["dida", "rickshaw", "student", "footballer"],
    2: ["kaku", "didi", "professor", "yoga"],
    3: ["kobi", "boudi", "dokandar", "kishore"],
  },
};

/**
 * Each team's base routine runs on the same schedule but starts at a different point in it (seconds), so the
 * four bases are not doing the same thing at the same moment.
 */
export function routinePhase(seat: number): number {
  return [0, 17, 29, 8][seat % 4]! + 43 * Math.floor(seat / 4);
}

/**
 * The order the teams' files load in, one team at a time: the player's own team first, then the others by
 * seat. Until a character has loaded its token stands as a pawn, so the board is playable at once.
 */
export function loadOrder(seats: readonly number[], you: number | null): number[] {
  return [...new Set(seats)].sort((a, b) => Number(b === you) - Number(a === you) || a - b);
}

/** The seats whose characters may load now: every team in order up to and including the first not yet loaded. */
export function loadableSeats(order: readonly number[], loaded: (seat: number) => boolean): ReadonlySet<number> {
  const allowed = new Set<number>();
  for (const seat of order) {
    allowed.add(seat);
    if (!loaded(seat)) break;
  }
  return allowed;
}

/**
 * A person of average height (1.75 m) stands this tall on the board (a cell is 1 unit; a pawn is 0.62): legible
 * from the aerial camera, slim enough not to hide the next cell. Everyone is drawn at the same scale, so a
 * schoolboy is shorter than his uncle (from about 0.75 to 1.01 units).
 */
export const CHARACTER_HEIGHT = 0.95;
const REFERENCE_HEIGHT_M = 1.75;

/** The character for a seat's token, or null (a pawn). */
export function characterFor(city: CityThemeId | null, seat: number, tokenId: number): string | null {
  if (!city) return null;
  const team = CHARACTER_TEAMS[city]?.[seat];
  const key = team?.[tokenId];
  return key && CHARACTERS[key] ? key : null;
}

/** Seats of a city that are shown as characters. */
export function characterSeats(city: CityThemeId | null): ReadonlySet<number> {
  const teams = city ? CHARACTER_TEAMS[city] : undefined;
  return new Set(Object.keys(teams ?? {}).map(Number));
}

export function characterUrl(key: string, quality: QualityLevel): string {
  const entry = CHARACTERS[key];
  if (!entry) throw new Error(`unknown character ${key}`);
  return `${import.meta.env.BASE_URL}characters/${entry.levels[quality].file}`;
}

/** World units per metre: the same for every character, so their heights differ as people's do. */
export function characterScale(_key?: string): number {
  return CHARACTER_HEIGHT / REFERENCE_HEIGHT_M;
}
