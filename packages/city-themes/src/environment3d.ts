// City environments in 3D: which cities have one, and what each is made of.
// Presentation only, like the rest of a theme. Every asset is original and
// procedural (built in code); nothing is generated or third-party. A city
// without an entry keeps its 2D environment around the 3D board.

import type { CityThemeId } from "./cityThemeTypes.js";

export type Environment3dAssetKind = "landmark" | "district" | "infrastructure" | "vehicle" | "people" | "nature" | "street";

export interface Environment3dAsset {
  id: string;
  kind: Environment3dAssetKind;
  /** The district (seat) it belongs to, if any. */
  seat: 0 | 1 | 2 | 3 | null;
  brief: string;
  /** Moves on a loop (ambient life). */
  ambient: boolean;
}

export interface Environment3dSpec {
  city: CityThemeId;
  status: "procedural";
  assets: readonly Environment3dAsset[];
}

const a = (id: string, kind: Environment3dAssetKind, seat: Environment3dAsset["seat"], brief: string, ambient = false): Environment3dAsset => ({ id, kind, seat, brief, ambient });

export const CITY_ENVIRONMENTS_3D: Readonly<Partial<Record<CityThemeId, Environment3dSpec>>> = {
  kolkata: {
    city: "kolkata",
    status: "procedural",
    assets: [
      a("howrah-bridge", "landmark", null, "Cantilever truss bridge across the river's west arm: two towers, anchor and cantilever arms, a suspended span, lateral bracing"),
      a("hooghly-river", "landmark", null, "The Hooghly wrapping the north and west of the board, with banks, railings and glints"),
      a("victoria-memorial", "landmark", 2, "White marble hall with a central dome and lantern, four corner cupolas and wings, on the Maidan"),
      a("writers-building", "landmark", 0, "Long red-brick facade with white bands and windows, a central pedimented portico and rooftop statues"),
      a("shaheed-minar", "landmark", 1, "Tall slim column on a flared base, two balconies and a small cupola"),
      a("biswa-bangla-gate", "landmark", 3, "A tilted steel ring on slanted legs over the avenue, with a glass pod at its centre"),
      a("heritage-houses", "district", 0, "Three-storey Bengali houses with green shutters, balconies and parapets round a courtyard"),
      a("tea-stall", "street", 0, "Tea stall with an awning and benches for adda"),
      a("ghats", "district", 1, "Riverside steps down to the water, a small temple, a jetty and moored boats"),
      a("book-stalls", "street", 2, "College Street book stalls along the Maidan's edge"),
      a("contemporary-towers", "district", 3, "Glass towers and a plaza in contemporary Kolkata"),
      a("howrah-station", "landmark", null, "Red-brick station with towers on the far bank"),
      a("lamp-posts", "street", null, "Cast-iron lamp posts along the river and paths"),
      a("trees", "nature", null, "Trees of the Maidan, the courtyards and the far bank, swaying gently"),
      a("yellow-taxi", "vehicle", 3, "Rounded yellow taxis on the ring road, both ways", true),
      a("tram", "vehicle", 2, "Two-car trams on tracks round the Maidan", true),
      a("ferry", "vehicle", 1, "River ferries along both arms of the Hooghly", true),
      a("pedestrians", "people", null, "Simple walkers on the promenade, the ghats, the Maidan and the plaza", true),
      a("skyline", "district", null, "A low distant skyline on the far banks"),
    ],
  },
};

export function environment3dFor(city: CityThemeId): Environment3dSpec | null {
  return CITY_ENVIRONMENTS_3D[city] ?? null;
}
