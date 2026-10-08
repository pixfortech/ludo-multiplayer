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
