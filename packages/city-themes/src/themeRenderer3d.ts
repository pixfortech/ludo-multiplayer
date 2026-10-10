// What a 3D renderer needs from a theme, as plain data. Batch C builds the
// scene from this description; keeping it here (pure, tested) means the
// readability rules are enforced before any WebGL code exists:
//  - the play camera never looks flatter than MIN_OVERVIEW_PITCH;
//  - reduced motion skips the intro sweep and the idle drift;
//  - dressing is thinned by device class, and phones fall back to 2D.

import { MIN_OVERVIEW_PITCH, type CameraPose, type DeviceClass, type EnvironmentPreset } from "./cityEnvironmentPresets.js";
import { getEnvironmentPreset } from "./cityThemeRegistry.js";
import type { CityTheme, Landmark, WorldProp } from "./cityThemeTypes.js";

export interface SceneDescription3d {
  theme: CityTheme["id"];
  lighting: EnvironmentPreset["lighting"];
  sky: EnvironmentPreset["sky"];
  atmosphere: EnvironmentPreset["atmosphere"];
  boardMaterial: EnvironmentPreset["boardMaterial"];
  camera: {
    overview: CameraPose;
    intro: EnvironmentPreset["cameras"]["intro"] | null;
    drift: EnvironmentPreset["cameras"]["drift"] | null;
    topDown: CameraPose;
  };
  landmarks: readonly Landmark[];
  props: readonly WorldProp[];
}

/** Phones and small windows play in 2D: 3D is an enhancement, never required. */
export function supports3d(device: DeviceClass): boolean {
  return device !== "phone";
}

export function sceneDescription3d(theme: CityTheme, device: DeviceClass, options: { reducedMotion?: boolean } = {}): SceneDescription3d {
  const preset = getEnvironmentPreset(theme.id);
  const density = preset.density[device];
  const overview = { ...preset.cameras.overview, pitch: Math.max(preset.cameras.overview.pitch, MIN_OVERVIEW_PITCH) };
  const still = options.reducedMotion === true;
  return {
    theme: theme.id,
    lighting: preset.lighting,
    sky: preset.sky,
    atmosphere: still || density === "minimal" ? { particles: "none", density: 0 } : preset.atmosphere,
    boardMaterial: preset.boardMaterial,
    camera: {
      overview,
      intro: still ? null : { ...preset.cameras.intro, to: overview },
      drift: still || preset.cameras.drift.yaw === 0 ? null : preset.cameras.drift,
      topDown: preset.cameras.topDown,
    },
    landmarks: density === "full" ? theme.landmarks : theme.landmarks.filter((l) => l.role === "hero"),
    props: density === "full" ? theme.props : density === "reduced" ? theme.props.filter((p) => p.density === "low").slice(0, 2) : [],
  };
}
