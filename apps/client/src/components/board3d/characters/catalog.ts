// Which human characters play for which seat, and where their files are.
//
// C.3A: the first team only, Kolkata's Crimson seat (seat 0). Characters are
// not tied to a colour: each file's team-coloured clothing (material "team")
// is tinted to the seat's colour at runtime, so the same four people can play
// for any seat once the other teams are approved.
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
}

export const CHARACTERS = (manifest as unknown as { characters: Record<string, CharacterEntry> }).characters;

/** Token 0..3 of a seat -> character, per city. */
export const CHARACTER_TEAMS: Partial<Record<CityThemeId, Partial<Record<number, readonly string[]>>>> = {
  kolkata: { 0: ["adda", "tea", "newspaper", "exercise"] },
};

/** Characters stand this tall on the board (a cell is 1 unit; a pawn is 0.62): legible from the aerial camera, slim enough not to hide the next cell. */
export const CHARACTER_HEIGHT = 0.95;

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

/** World units per metre for a character, so it stands CHARACTER_HEIGHT tall. */
export function characterScale(key: string): number {
  return CHARACTER_HEIGHT / (CHARACTERS[key]?.height ?? 1.7);
}
