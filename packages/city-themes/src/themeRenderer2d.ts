// What a 2D renderer needs from a theme, derived once and kept pure: CSS
// custom properties for the UI accent and surfaces, and the ordered scene
// layers to draw around (never over) the board for a device class. Batch B
// draws these layers; Batch A uses the CSS variables for city cards.

import { mixLab } from "@ludo/design-tokens";
import type { DeviceClass, Density } from "./cityEnvironmentPresets.js";
import { getEnvironmentPreset } from "./cityThemeRegistry.js";
import type { CityTheme, CityThemeId } from "./cityThemeTypes.js";

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

/** The board's materials. Only neutral surfaces change: seat colours, lanes, bases and the centre never do. */
export interface BoardMaterial2d {
  /** The board body between cells. */
  body: string;
  /** Track cells (light in every city). */
  cell: string;
  /** Cell outlines. */
  separator: string;
  /** The safe-cell star. */
  safeMark: string;
  /** The plinth the board stands on (a frame around it); null for the classic table. */
  plinth: { light: string; base: string; dark: string; edge: string; finish: PlinthFinish } | null;
}

export type PlinthFinish = "teak" | "sandstone" | "granite" | "deco" | "slate";

/** The classic table's surfaces, exactly as approved. */
export const CLASSIC_BOARD_MATERIAL: BoardMaterial2d = { body: "#FFFFFF", cell: "#F7F4EE", separator: "#ECE7DE", safeMark: "#8E8676", plinth: null };

const FINISH: Readonly<Record<Exclude<CityThemeId, "classic">, PlinthFinish>> = {
  kolkata: "teak",
  delhi: "sandstone",
  chennai: "granite",
  mumbai: "deco",
  bengaluru: "slate",
};

export function boardMaterial2d(theme: CityTheme): BoardMaterial2d {
  if (theme.id === "classic") return CLASSIC_BOARD_MATERIAL;
  const p = theme.palette;
  const frame = p.boardFrame;
  return {
    body: mixLab(p.boardCell, "#FFFFFF", 0.55),
    cell: p.boardCell,
    separator: mixLab(p.boardLine, p.boardCell, 0.45),
    safeMark: mixLab(frame, CLASSIC_BOARD_MATERIAL.safeMark, 0.5),
    plinth: { light: mixLab(frame, "#FFFFFF", 0.22), base: frame, dark: mixLab(frame, "#000000", 0.32), edge: mixLab(frame, "#FFFFFF", 0.5), finish: FINISH[theme.id] },
  };
}
