// Every asset the themes refer to, with its status. Nothing in this project
// is third-party art: "procedural" assets are original artwork drawn in code
// (the city cards and the 2D city scenes), "placeholder" assets would be
// simple stand-in shapes, and "planned" ones are not drawn (or shown) yet.

import type { AssetRef, AssetStatus, CityThemeId } from "./cityThemeTypes.js";
import { CITY_THEMES } from "./cityThemes.js";

export interface ManifestEntry extends AssetRef {
  city: CityThemeId;
  kind: "preview" | "landmark" | "prop";
}

export function cityAssetManifest(): ManifestEntry[] {
  return Object.values(CITY_THEMES).flatMap((theme) => [
    { ...theme.preview, city: theme.id, kind: "preview" as const },
    ...theme.landmarks.map((l) => ({ ...l.asset, city: theme.id, kind: "landmark" as const })),
    ...theme.props.map((p) => ({ ...p.asset, city: theme.id, kind: "prop" as const })),
  ]);
}

export function assetCounts(): Record<AssetStatus, number> {
  const counts: Record<AssetStatus, number> = { procedural: 0, placeholder: 0, planned: 0 };
  for (const entry of cityAssetManifest()) counts[entry.status] += 1;
  return counts;
}
