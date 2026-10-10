// What a 2D renderer needs from a theme, derived once and kept pure: CSS
// custom properties for the UI accent and surfaces, and the ordered scene
// layers to draw around (never over) the board for a device class. Batch B
// draws these layers; Batch A uses the CSS variables for city cards.

import type { DeviceClass, Density } from "./cityEnvironmentPresets.js";
import { getEnvironmentPreset } from "./cityThemeRegistry.js";
import type { CityTheme } from "./cityThemeTypes.js";

/** CSS custom properties a themed surface sets (names are stable; Batch B adds more). */
export function themeCssVariables(theme: CityTheme): Record<`--city-${string}`, string> {
  const p = theme.palette;
  return {
    "--city-accent": p.accent,
    "--city-accent-ink": p.accentInk,
    "--city-surface": p.surface,
    "--city-ink": p.ink,
    "--city-sky-top": p.sky[0],
    "--city-sky-horizon": p.sky[1],
    "--city-ground": p.ground,
    "--city-ground-accent": p.groundAccent,
    "--city-water": p.water ?? p.sky[1],
    "--city-board-frame": p.boardFrame,
    "--city-board-cell": p.boardCell,
    "--city-board-line": p.boardLine,
  };
}

export type Layer2d = "sky" | "horizon-landmark" | "water" | "ground" | "edge-landmarks" | "corner-districts" | "props" | "atmosphere";

/** Back to front. The board and tokens are always drawn after (above) every layer. */
const LAYERS_BY_DENSITY: Readonly<Record<Density, readonly Layer2d[]>> = {
  minimal: ["sky", "horizon-landmark", "ground"],
  reduced: ["sky", "horizon-landmark", "water", "ground", "corner-districts"],
  full: ["sky", "horizon-landmark", "water", "edge-landmarks", "ground", "corner-districts", "props", "atmosphere"],
};

export function sceneLayers2d(theme: CityTheme, device: DeviceClass, options: { reducedMotion?: boolean } = {}): Layer2d[] {
  if (theme.id === "classic") return [];
  const density = getEnvironmentPreset(theme.id).density[device];
  return LAYERS_BY_DENSITY[density].filter((layer) => {
    if (layer === "water") return theme.palette.water !== null;
    if (layer === "atmosphere") return !options.reducedMotion;
    return true;
  });
}
