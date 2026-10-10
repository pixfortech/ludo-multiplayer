// Validation of untrusted room input. Everything arrives as `unknown` (it will
// come straight off a socket in 2C) and leaves as a typed, normalised value or
// a RoomError naming the exact problem.

import {
  CITY_THEME_IDS,
  DEFAULT_CITY_THEME,
  DEFAULT_RULE_OPTIONS,
  isCityThemeId,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RANKING_MODES,
  TURN_TIMER_OPTIONS,
  colourById,
  type CityThemeId,
  type RankingMode,
  type RoomRuleOptions,
  type RoomSettings,
  type TurnTimerSeconds,
} from "@ludo/shared-types";
import { RoomError } from "./errors.js";

/** Player counts the classic engine can play today. 5–15 exist in the data model only. */
export const PLAYABLE_PLAYER_COUNTS: readonly number[] = [2, 3, 4];

export const DISPLAY_NAME_MAX = 24;
export const ROOM_NAME_MAX = 40;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Rejects unknown keys so typos and unsupported options never pass silently. */
export function assertKnownKeys(input: Record<string, unknown>, allowed: readonly string[], code: "invalid-request" | "invalid-settings"): void {
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new RoomError(code, `Unknown field: ${unknown[0]!.slice(0, 40)}`, { field: unknown[0]!.slice(0, 40) });
}

export function asRecord(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new RoomError("invalid-request", "Expected an object");
  return input;
}

// Control, format, surrogate, private-use and unassigned code points; the
// format class also covers bidi overrides and zero-width characters.
const FORBIDDEN_CHARACTERS = /\p{C}/u;

function normaliseName(input: unknown, max: number, code: "invalid-display-name" | "invalid-room-name", label: string): string {
  if (typeof input !== "string" || input.length > max * 8) throw new RoomError(code, `${label} must be text of 1–${max} characters`);
  const name = input.normalize("NFC").replace(/\s+/gu, " ").trim();
  const length = [...name].length;
  if (length < 1 || length > max) throw new RoomError(code, `${label} must be 1–${max} characters`);
  if (FORBIDDEN_CHARACTERS.test(name)) throw new RoomError(code, `${label} contains characters that are not allowed`);
  return name;
}

export function normaliseDisplayName(input: unknown): string {
  return normaliseName(input, DISPLAY_NAME_MAX, "invalid-display-name", "Display name");
}

/** Comparison key for "same name": compatibility- and case-folded ("Aman" = "AMAN" = "Ａｍａｎ"). */
export function displayNameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase();
}

/** Optional room name: missing or blank means none. */
export function normaliseRoomName(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === "string" && input.trim() === "") return null;
  return normaliseName(input, ROOM_NAME_MAX, "invalid-room-name", "Room name");
}

export type ColourChoice = { kind: "auto" } | { kind: "colour"; colour: string };

/** "auto", missing or null → automatic allocation; otherwise a known colour id. */
export function parseColourChoice(input: unknown): ColourChoice {
  if (input === undefined || input === null || input === "auto") return { kind: "auto" };
  if (typeof input !== "string" || !colourById(input)) {
    throw new RoomError("invalid-colour", "Unknown colour");
  }
  return { kind: "colour", colour: input };
}

export function parseMaxPlayers(input: unknown): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < MIN_PLAYERS || input > MAX_PLAYERS) {
    throw new RoomError("invalid-player-count", `Player count must be a whole number from ${MIN_PLAYERS} to ${MAX_PLAYERS}`);
  }
  if (!PLAYABLE_PLAYER_COUNTS.includes(input)) {
    throw new RoomError("unsupported-player-count", "Only classic 2–4 player games are available so far", { maxPlayers: input });
  }
  return input;
}

function parseBoolean(input: unknown, field: string): boolean {
  if (typeof input !== "boolean") throw new RoomError("invalid-settings", `${field} must be true or false`, { field });
  return input;
}

function parseRankingMode(input: unknown): RankingMode {
  if (!RANKING_MODES.includes(input as RankingMode)) {
    throw new RoomError("invalid-settings", `rankingMode must be one of: ${RANKING_MODES.join(", ")}`, { field: "rankingMode" });
  }
  return input as RankingMode;
}

function parseTurnTimer(input: unknown): TurnTimerSeconds {
  if (!TURN_TIMER_OPTIONS.includes(input as TurnTimerSeconds)) {
    throw new RoomError("invalid-settings", `turnTimerSeconds must be one of: ${TURN_TIMER_OPTIONS.join(", ")}`, { field: "turnTimerSeconds" });
  }
  if (input !== 0) throw new RoomError("unsupported-setting", "Turn timers are not available yet", { field: "turnTimerSeconds" });
  return 0;
}

/** The city theme is presentation only; it is validated so every player loads a theme that exists. */
export function parseCityTheme(input: unknown): CityThemeId {
  if (!isCityThemeId(input)) throw new RoomError("invalid-settings", `cityTheme must be one of: ${CITY_THEME_IDS.join(", ")}`, { field: "cityTheme" });
  return input;
}

/** Settings as stored: rooms created before city themes have none and read as the classic table. */
export function normaliseSettings(settings: RoomSettings): RoomSettings {
  return isCityThemeId(settings.cityTheme) ? settings : { ...settings, cityTheme: DEFAULT_CITY_THEME };
}

function parseVisibility(input: unknown): "private" {
  if (input === "private") return input;
  if (input === "public") throw new RoomError("unsupported-setting", "Public rooms are not available yet; rooms are private (join by code)", { field: "visibility" });
  throw new RoomError("invalid-settings", "visibility must be private", { field: "visibility" });
}

/**
 * Only the defaults are implemented by the engine, so any other value is
 * refused rather than silently ignored.
 */
function parseRules(input: unknown): RoomRuleOptions {
  if (!isRecord(input)) throw new RoomError("invalid-settings", "rules must be an object", { field: "rules" });
  const keys = Object.keys(DEFAULT_RULE_OPTIONS) as (keyof RoomRuleOptions)[];
  assertKnownKeys(input, keys, "invalid-settings");
  const rules = { ...DEFAULT_RULE_OPTIONS };
  for (const key of keys) {
    if (input[key] === undefined) continue;
    const value = parseBoolean(input[key], `rules.${key}`);
    if (value !== DEFAULT_RULE_OPTIONS[key]) {
      throw new RoomError("unsupported-rule", `The rule option ${key}=${value} is not available yet`, { field: `rules.${key}` });
    }
    rules[key] = value;
  }
  return rules;
}

export const SETTINGS_FIELDS = ["maxPlayers", "autoMove", "rankingMode", "visibility", "turnTimerSeconds", "rules", "cityTheme"] as const;

/** Full settings for a new room; omitted fields take their defaults. */
export function parseNewRoomSettings(input: Record<string, unknown>): RoomSettings {
  return {
    maxPlayers: parseMaxPlayers(input.maxPlayers),
    autoMove: input.autoMove === undefined ? true : parseBoolean(input.autoMove, "autoMove"),
    rankingMode: input.rankingMode === undefined ? "winner-only" : parseRankingMode(input.rankingMode),
    visibility: input.visibility === undefined ? "private" : parseVisibility(input.visibility),
    turnTimerSeconds: input.turnTimerSeconds === undefined ? 0 : parseTurnTimer(input.turnTimerSeconds),
    rules: input.rules === undefined ? { ...DEFAULT_RULE_OPTIONS } : parseRules(input.rules),
    cityTheme: input.cityTheme === undefined ? DEFAULT_CITY_THEME : parseCityTheme(input.cityTheme),
  };
}

/** Applies a partial settings change to the current settings. */
export function applySettingsPatch(current: RoomSettings, input: Record<string, unknown>): RoomSettings {
  return {
    maxPlayers: input.maxPlayers === undefined ? current.maxPlayers : parseMaxPlayers(input.maxPlayers),
    autoMove: input.autoMove === undefined ? current.autoMove : parseBoolean(input.autoMove, "autoMove"),
    rankingMode: input.rankingMode === undefined ? current.rankingMode : parseRankingMode(input.rankingMode),
    visibility: input.visibility === undefined ? current.visibility : parseVisibility(input.visibility),
    turnTimerSeconds: input.turnTimerSeconds === undefined ? current.turnTimerSeconds : parseTurnTimer(input.turnTimerSeconds),
    rules: input.rules === undefined ? current.rules : parseRules({ ...current.rules, ...asRules(input.rules) }),
    cityTheme: input.cityTheme === undefined ? normaliseSettings(current).cityTheme : parseCityTheme(input.cityTheme),
  };
}

function asRules(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new RoomError("invalid-settings", "rules must be an object", { field: "rules" });
  return input;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePlayerId(input: unknown, code: "invalid-request" | "unauthenticated" = "invalid-request"): string {
  if (typeof input !== "string" || !UUID.test(input)) throw new RoomError(code, code === "unauthenticated" ? "Not signed in to this room" : "Invalid player id");
  return input.toLowerCase();
}

export function parseExpectedVersion(input: unknown): number | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
    throw new RoomError("invalid-request", "expectedRoomVersion must be a non-negative whole number");
  }
  return input;
}

export function parseRequestId(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "string" || !/^[\w-]{1,64}$/.test(input)) throw new RoomError("invalid-request", "requestId must be 1–64 letters, digits, - or _");
  return input;
}
