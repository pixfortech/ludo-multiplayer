// A player's token as React SVG: the same layers and geometry as the reference
// 2D token (design-tokens token2dSvg): contact shadow, halo, rim, resin body,
// gloss, symbol. Colour always comes with the seat's symbol.

import { useId } from "react";
import { BOARD_SURFACES, SYMBOL_PATHS, TOKEN_2D, TOKEN_HALO, type PlayerIdentity } from "@ludo/design-tokens";

export function PlayerToken({ identity, size = 40, title, dimmed = false, shadow = true }: { identity: PlayerIdentity; size?: number; title?: string; dimmed?: boolean; shadow?: boolean }) {
  const gradient = `tk-${useId().replace(/:/g, "")}`;
  const s = TOKEN_2D;
  const symbolScale = s.symbolSize / 24;
  const symbolOffset = 50 - s.symbolSize / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="shrink-0" style={{ opacity: dimmed ? 0.45 : 1 }}>
      <defs>
        <radialGradient id={gradient} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor={identity.highlight} />
          <stop offset="0.55" stopColor={identity.body} />
          <stop offset="1" stopColor={identity.rim} />
        </radialGradient>
      </defs>
      {shadow ? <ellipse cx="50" cy="91" rx="30" ry="5.5" fill={BOARD_SURFACES.line} opacity="0.9" /> : null}
      <circle cx="50" cy="50" r={s.halo} fill={TOKEN_HALO} />
      <circle cx="50" cy="50" r={s.rim} fill={identity.rim} />
      <circle cx="50" cy="50" r={s.body} fill={`url(#${gradient})`} />
      <ellipse cx="41" cy="33" rx="17" ry="9" fill="#FFFFFF" opacity="0.28" />
      <path d={SYMBOL_PATHS[identity.symbol]} fill={identity.ink} transform={`translate(${symbolOffset} ${symbolOffset}) scale(${symbolScale})`} />
    </svg>
  );
}
