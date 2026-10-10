// The one place renderers and screens look themes up. Unknown or missing ids
// fall back to the classic table, so an old room or a newer server never
// leaves a client without a theme.

import { DEFAULT_CITY_THEME, isCityThemeId } from "@ludo/shared-types";
import { CITY_DIALOGUE_PACKS, type DialogueLine, type DialoguePack } from "./cityDialoguePacks.js";
import { CITY_EMOTION_PACKS, type EmotionPack } from "./cityEmotionPacks.js";
import { CITY_ENVIRONMENT_PRESETS, type EnvironmentPreset } from "./cityEnvironmentPresets.js";
import type { CityTheme, CityThemeId, GameMoment } from "./cityThemeTypes.js";
import { CITY_THEMES } from "./cityThemes.js";

/** The order the cities are offered in: the five cities, then the classic table. */
export const CITY_ORDER: readonly CityThemeId[] = ["kolkata", "delhi", "chennai", "mumbai", "bengaluru", "classic"];

export function resolveCityThemeId(id: unknown): CityThemeId {
  return isCityThemeId(id) ? id : DEFAULT_CITY_THEME;
}

export function getCityTheme(id: unknown): CityTheme {
  return CITY_THEMES[resolveCityThemeId(id)];
}

export function listCityThemes(): CityTheme[] {
  return CITY_ORDER.map((id) => CITY_THEMES[id]);
}

export function getDialoguePack(id: unknown): DialoguePack {
  return CITY_DIALOGUE_PACKS[getCityTheme(id).id];
}

export function getEmotionPack(id: unknown): EmotionPack {
  return CITY_EMOTION_PACKS[getCityTheme(id).id];
}

export function getEnvironmentPreset(id: unknown): EnvironmentPreset {
  const theme = getCityTheme(id);
  const preset = CITY_ENVIRONMENT_PRESETS[theme.environmentPreset];
  if (!preset) throw new Error(`city theme ${theme.id} names a missing environment preset ${theme.environmentPreset}`);
  return preset;
}

/**
 * A line for a moment. `pick` chooses among the pack's lines (pass a counter
 * or a seeded value; the default is the first), so callers decide how varied
 * dialogue is and tests stay deterministic.
 */
export function dialogueFor(id: unknown, moment: GameMoment, pick = 0): DialogueLine {
  const lines = getDialoguePack(id).lines[moment];
  const index = ((Math.trunc(pick) % lines.length) + lines.length) % lines.length;
  return lines[index]!;
}
