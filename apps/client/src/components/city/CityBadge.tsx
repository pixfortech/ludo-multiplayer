// A compact city card for the lobby and the join preview: the room's city
// art, name and tagline. Nothing is shown for the classic table, so classic
// rooms look exactly as before.

import { getCityTheme } from "@ludo/city-themes";
import type { CityThemeId } from "@ludo/shared-types";
import { CityPreviewArt } from "./CityPreviewArt";

export function CityBadge({ city, layout = "stacked" }: { city: CityThemeId; layout?: "stacked" | "row" }) {
  const theme = getCityTheme(city);
  if (theme.id === "classic") return null;
  const row = layout === "row";
  return (
    <figure data-room-city={theme.id} className={`m-0 overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface ${row ? "flex items-center gap-3" : "flex flex-col"}`}>
      <div className={row ? "w-24 shrink-0" : ""}>
        <CityPreviewArt city={theme} />
      </div>
      <figcaption className={`flex min-w-0 flex-col ${row ? "py-2 pr-3" : "px-3 py-2"}`}>
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-[15px] font-semibold text-ink">{theme.name}</span>
          {theme.nativeName ? (
            <span lang={theme.signage.script?.language} className="min-w-0 truncate text-[13px] text-ink-muted">
              {theme.nativeName}
            </span>
          ) : null}
        </span>
        <span className="truncate text-[13px] text-ink-muted">{theme.tagline}</span>
      </figcaption>
    </figure>
  );
}
