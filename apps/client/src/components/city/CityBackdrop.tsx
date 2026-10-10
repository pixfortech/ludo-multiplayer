// The city behind the game. Each city's artwork is its own lazily loaded
// chunk, so a room only downloads the city it plays in (and classic rooms
// download none). Until it arrives, the sky and paving colours already show.

import { lazy, Suspense, useEffect, type ComponentType, type CSSProperties } from "react";
import { themeCssVariables, type CityTheme, type CityThemeId } from "@ludo/city-themes";
import "./city.css";

type CityWithArt = Exclude<CityThemeId, "classic">;

const SCENES: Record<CityWithArt, ReturnType<typeof lazy<ComponentType>>> = {
  kolkata: lazy(() => import("./scenes/KolkataScene")),
  delhi: lazy(() => import("./scenes/DelhiScene")),
  chennai: lazy(() => import("./scenes/ChennaiScene")),
  mumbai: lazy(() => import("./scenes/MumbaiScene")),
  bengaluru: lazy(() => import("./scenes/BengaluruScene")),
};

/** The theme's CSS variables, as a style object for the game screen. */
export function cityStyle(theme: CityTheme): CSSProperties {
  return themeCssVariables(theme) as CSSProperties;
}

/** Marks the document while a themed game is on screen (header and page background follow the city). */
export function useCityDocument(theme: CityTheme): void {
  useEffect(() => {
    if (theme.id === "classic") return;
    const root = document.documentElement;
    const vars = themeCssVariables(theme);
    root.dataset.city = theme.id;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      delete root.dataset.city;
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [theme]);
}

export function CityBackdrop({ theme }: { theme: CityTheme }) {
  if (theme.id === "classic") return null;
  const Scene = SCENES[theme.id];
  return (
    <div className="city-backdrop" data-city-backdrop={theme.id} data-water={theme.palette.water ? "" : undefined} aria-hidden="true" style={{ background: `linear-gradient(180deg, ${theme.palette.sky[0]}, ${theme.palette.sky[1]} 40%, ${theme.palette.ground} 60%)` }}>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </div>
  );
}
