// Room-setting vocabulary. These are the literal values the lobby offers;
// the server validates every setting before a room accepts it.

export type GameMode = "classic" | "turbo" | "arena";
export type RendererMode = "2d" | "3d";
export type PowerLevel = "off" | "light" | "full";
/** Seconds per turn; 0 means no timer. */
export type TurnTimerSeconds = 0 | 15 | 30 | 60;
export type RankingMode = "winner-only" | "full-ranking";
export type ThemeMode = "dark" | "light";

export const GAME_MODES: readonly GameMode[] = ["classic", "turbo", "arena"];
export const RENDERER_MODES: readonly RendererMode[] = ["2d", "3d"];
export const POWER_LEVELS: readonly PowerLevel[] = ["off", "light", "full"];
export const TURN_TIMER_OPTIONS: readonly TurnTimerSeconds[] = [0, 15, 30, 60];
export const RANKING_MODES: readonly RankingMode[] = ["winner-only", "full-ranking"];

/**
 * The city a room is themed as: presentation only (board dressing, colours,
 * landmarks, dialogue). It never changes rules, topology or networking.
 * "classic" is the original, unthemed table (and what rooms created before
 * city themes existed read as).
 */
export type CityThemeId = "classic" | "kolkata" | "delhi" | "chennai" | "mumbai" | "bengaluru";
export const CITY_THEME_IDS: readonly CityThemeId[] = ["classic", "kolkata", "delhi", "chennai", "mumbai", "bengaluru"];
export const DEFAULT_CITY_THEME: CityThemeId = "classic";
export const isCityThemeId = (value: unknown): value is CityThemeId => typeof value === "string" && (CITY_THEME_IDS as readonly string[]).includes(value);
