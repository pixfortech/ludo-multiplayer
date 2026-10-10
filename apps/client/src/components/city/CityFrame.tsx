// The city's frame around the game: the plinth the board stands on, the
// signboard (desktop) and the compact chip (phones and tablets). All are
// decoration around the board, never over it.

import type { CSSProperties, ReactNode } from "react";
import { type BoardMaterial2d, type CityTheme } from "@ludo/city-themes";
import { CityPreviewArt } from "./CityPreviewArt";
import { CityMotif } from "./CityMotif";

export function CityPlinth({ material, children }: { material: BoardMaterial2d; children: ReactNode }) {
  const p = material.plinth;
  if (!p) return <>{children}</>;
  const style = { ["--plinth-light" as string]: p.light, ["--plinth-base" as string]: p.base, ["--plinth-dark" as string]: p.dark, ["--plinth-edge" as string]: p.edge } as CSSProperties;
  return (
    <div className="city-plinth" data-finish={p.finish} data-testid="city-plinth" style={style}>
      {children}
    </div>
  );
}

/** The city's signboard: wordmark, name in its own script, tagline and the city's motif. */
export function CitySign({ theme }: { theme: CityTheme }) {
  return (
    <section className="city-sign px-4 pb-3.5 pt-3" aria-label={`City: ${theme.name}`} data-city-sign={theme.id}>
      <CityMotif city={theme.id} className="pointer-events-none absolute inset-x-0 top-0 h-3 opacity-60" />
      <div className="relative mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="font-display text-[22px] font-semibold uppercase leading-none tracking-[0.14em]">{theme.signage.wordmark}</p>
        {theme.nativeName ? (
          <p lang={theme.signage.script?.language} className="text-[16px] font-medium leading-none opacity-90">
            {theme.nativeName}
          </p>
        ) : null}
      </div>
      <p className="relative mt-1.5 text-[13px] leading-snug opacity-90">{theme.tagline}</p>
    </section>
  );
}

/** Phones and tablets: a small chip with the city's art and name. */
export function CityChip({ theme }: { theme: CityTheme }) {
  return (
    <span className="city-glass flex min-h-11 shrink-0 items-center gap-2 overflow-hidden rounded-full border border-white/60 py-1 pl-1 pr-3" data-city-chip={theme.id}>
      <span className="block h-8 w-12 overflow-hidden rounded-full">
        <CityPreviewArt city={theme} className="h-full object-cover" />
      </span>
      <span className="text-[13px] font-semibold text-ink">{theme.name}</span>
    </span>
  );
}
