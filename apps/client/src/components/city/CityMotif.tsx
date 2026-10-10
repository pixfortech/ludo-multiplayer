// Each city's decorative motif, as a repeating band (original line patterns):
// Kolkata's alpana petals, Delhi's jaali lattice, Chennai's kolam dots,
// Mumbai's art deco steps and Bengaluru's leaf-and-circuit line.

import { useId, type ReactNode } from "react";
import type { CityThemeId } from "@ludo/city-themes";

const TILES: Record<Exclude<CityThemeId, "classic">, { w: number; h: number; art: ReactNode }> = {
  kolkata: {
    w: 24,
    h: 12,
    art: (
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <path d="M0 11 Q6 1 12 11 Q18 1 24 11" />
        <path d="M12 11 Q12 6 12 4" />
        <circle cx="12" cy="2.6" r="1.1" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  delhi: {
    w: 14,
    h: 12,
    art: (
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M0 6 L7 0 L14 6 L7 12 Z" />
        <path d="M7 3 L10 6 L7 9 L4 6 Z" fill="currentColor" stroke="none" opacity="0.7" />
      </g>
    ),
  },
  chennai: {
    w: 16,
    h: 12,
    art: (
      <g>
        <circle cx="4" cy="6" r="1.2" fill="currentColor" />
        <circle cx="12" cy="6" r="1.2" fill="currentColor" />
        <path d="M4 6 C4 0 12 0 12 6 C12 12 20 12 20 6 M4 6 C4 12 -4 12 -4 6" fill="none" stroke="currentColor" strokeWidth="1" />
      </g>
    ),
  },
  mumbai: {
    w: 20,
    h: 12,
    art: (
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        <path d="M0 12 V8 H4 V4 H8 V1 H12 V4 H16 V8 H20 V12" />
        <path d="M10 1 V12" opacity="0.6" />
      </g>
    ),
  },
  bengaluru: {
    w: 28,
    h: 12,
    art: (
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
        <path d="M0 8 H8 L11 4 H20 L23 8 H28" />
        <circle cx="11" cy="4" r="1.3" fill="currentColor" stroke="none" />
        <path d="M15 4 C15 1 19 0 20 1 C19 3 17 4 15 4 Z" fill="currentColor" stroke="none" opacity="0.8" />
      </g>
    ),
  },
};

export function CityMotif({ city, className = "" }: { city: CityThemeId; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (city === "classic") return null;
  const tile = TILES[city];
  return (
    <svg className={className} aria-hidden="true" focusable="false" preserveAspectRatio="none" data-motif={city}>
      <defs>
        <pattern id={`${id}-m`} width={tile.w} height={tile.h} patternUnits="userSpaceOnUse">
          {tile.art}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-m)`} />
    </svg>
  );
}
