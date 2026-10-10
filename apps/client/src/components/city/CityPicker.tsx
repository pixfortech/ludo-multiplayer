// City choice when creating a room: one card per city (art, name, name in the
// city's script, tagline and colour mood), then the classic table. A radio
// group: arrow keys move between cities, Tab leaves the group. The theme is
// presentation only and every player in the room loads the same one.

import { useId, useRef, type KeyboardEvent } from "react";
import { listCityThemes, type CityThemeId } from "@ludo/city-themes";
import { CityPreviewArt } from "./CityPreviewArt";

const THEMES = listCityThemes();

export function CityPicker({ label = "City", hideLabel = false, value, onChange }: { label?: string; hideLabel?: boolean; value: CityThemeId; onChange: (value: CityThemeId) => void }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, THEMES.findIndex((t) => t.id === value));

  const onKey = (event: KeyboardEvent, index: number) => {
    const dir = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const next = (index + dir + THEMES.length) % THEMES.length;
    onChange(THEMES[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className={hideLabel ? "sr-only" : "text-sm font-semibold text-ink"}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {THEMES.map((theme, index) => {
          const checked = theme.id === value;
          return (
            <button
              key={theme.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${theme.name}: ${theme.tagline}`}
              data-city={theme.id}
              tabIndex={selected === index ? 0 : -1}
              onKeyDown={(e) => onKey(e, index)}
              onClick={() => onChange(theme.id)}
              className={`press group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border text-left ${
                checked ? "border-accent shadow-[0_0_0_3px_rgba(31,95,214,0.14)]" : "border-border hover:border-[#cfc7b8]"
              } bg-surface`}
            >
              <CityPreviewArt city={theme} />
              <span className="flex min-w-0 flex-col gap-0.5 px-3 pb-3 pt-2">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 text-[15px] font-semibold text-ink">{theme.name}</span>
                  {theme.nativeName ? (
                    <span lang={theme.signage.script?.language} className="min-w-0 truncate text-[13px] text-ink-muted">
                      {theme.nativeName}
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-muted">{theme.tagline}</span>
                <span className="mt-1 flex gap-1" aria-hidden="true">
                  {[theme.palette.sky[0], theme.palette.ground, theme.palette.accent].map((c, i) => (
                    <span key={i} className="h-2.5 w-5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c }} />
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
