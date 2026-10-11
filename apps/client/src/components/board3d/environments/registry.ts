// Which cities have a 3D environment, and how to load it. Each environment is
// its own lazily loaded chunk (Kolkata first); a city without one keeps its 2D
// environment around the board. The board, tokens, cameras and gameplay are
// shared: an environment only adds scenery around them.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { CityThemeId } from "@ludo/city-themes";
import type { QualityLevel } from "../capabilities";
import { toAabb, type Aabb } from "../sightlines";
import { GROUND_Y as KOLKATA_GROUND, LANDMARKS as KOLKATA_LANDMARKS, obstacles as kolkataObstacles } from "./kolkata/layout";

export interface EnvironmentProps {
  quality: QualityLevel;
  reduced: boolean;
  /** Tokens are moving: ambient life eases off. */
  busy: boolean;
  /** Called once the environment's scenery is built (for tooling). */
  onBuilt?: (info: { assets: readonly string[] }) => void;
}

export interface EnvironmentEntry {
  Component: LazyExoticComponent<ComponentType<EnvironmentProps>>;
  /** Buildings the camera must not enter. */
  obstacles: () => Aabb[];
  /** A point on each landmark (for the screen-position mirror). */
  anchors: () => { id: string; x: number; y: number; z: number }[];
}

export const ENVIRONMENTS: Readonly<Partial<Record<CityThemeId, EnvironmentEntry>>> = {
  kolkata: {
    Component: lazy(() => import("./kolkata/KolkataEnvironment")),
    obstacles: () => kolkataObstacles().map((b) => toAabb(b, KOLKATA_GROUND)),
    anchors: () => KOLKATA_LANDMARKS.map((l) => ({ id: l.id, x: l.at.x, y: KOLKATA_GROUND + Math.max(0.2, l.box.height * 0.55), z: l.at.z })),
  },
};

export const environmentFor = (city: CityThemeId | null): EnvironmentEntry | null => (city ? (ENVIRONMENTS[city] ?? null) : null);
