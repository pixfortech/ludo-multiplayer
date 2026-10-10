// The city cards' illustrations: small, original, procedural silhouettes drawn
// from each theme's palette (no photos, no third-party art). They suggest the
// city's hero landmark at its time of day; the full worlds come in Batch B/C.

import { useId } from "react";
import { getCityTheme, type CityTheme, type CityThemeId } from "@ludo/city-themes";
import { CLASSIC_IDENTITIES } from "../../lib/identities";

const W = 160;
const H = 100;
const HORIZON = 64;

// Where the sun or moon sits, clear of each skyline.
const SUN: Record<Exclude<CityThemeId, "classic">, { cx: number; cy: number; r: number }> = {
  kolkata: { cx: 128, cy: 30, r: 9 },
  delhi: { cx: 112, cy: 28, r: 8 },
  chennai: { cx: 30, cy: 30, r: 9 },
  mumbai: { cx: 118, cy: 14, r: 6 },
  bengaluru: { cx: 30, cy: 26, r: 8 },
};

function Kolkata({ ink }: { ink: string }) {
  // A cantilever truss bridge over the river: two towers, a rising top chord and a deck.
  return (
    <g fill="none" stroke={ink} strokeLinejoin="round">
      <path d="M6 58 L40 24 L60 36 L80 40 L100 36 L120 24 L154 58" strokeWidth="2.2" />
      <path d="M6 58 H154" strokeWidth="2.4" />
      <path d="M38 24 V60 M42 24 V60 M118 24 V60 M122 24 V60" strokeWidth="2" />
      <path d="M14 58 L24 42 M24 58 L32 34 M48 58 L52 30 M60 58 L60 36 M70 58 L70 38 M80 58 V40 M90 58 V38 M100 58 L100 36 M112 58 L108 30 M136 58 L128 34 M146 58 L136 42" strokeWidth="1" opacity="0.8" />
      <path d="M24 42 L40 58 M52 30 L60 58 M108 30 L100 58 M136 42 L120 58" strokeWidth="0.8" opacity="0.6" />
    </g>
  );
}

function Delhi({ ink, sky }: { ink: string; sky: string }) {
  // A monumental arch at the end of an avenue, a fluted minaret beside it.
  return (
    <g fill={ink}>
      <path d="M60 64 V30 H100 V64 H88 V46 A8 8 0 0 0 72 46 V64 Z" />
      <rect x="57" y="26" width="46" height="5" rx="1" />
      <path d="M68 26 Q80 16 92 26 Z" />
      <path d="M126 64 L129 14 H133 L136 64 Z" />
      <g stroke={sky} strokeWidth="1" opacity="0.7">
        <path d="M127 50 H135 M127.6 38 H134.4 M128.3 26 H133.7" />
      </g>
      <path d="M20 64 H36 V54 H20 Z M140 64 H152 V56 H140 Z" opacity="0.5" />
    </g>
  );
}

function Chennai({ ink }: { ink: string }) {
  // A tiered temple tower, and a lighthouse on the shore.
  const tiers = [0, 1, 2, 3, 4].map((i) => {
    const y = 62 - i * 9;
    const half = 24 - i * 3.6;
    return <path key={i} d={`M${80 - half} ${y} L${80 - half + 2} ${y - 9} H${80 + half - 2} L${80 + half} ${y} Z`} />;
  });
  return (
    <g fill={ink}>
      {tiers}
      <path d="M68 17 Q80 6 92 17 Z" />
      <path d="M128 64 L131 26 H137 L140 64 Z" />
      <rect x="129.5" y="21" width="9" height="6" rx="1" />
      <circle cx="134" cy="19" r="2.2" />
    </g>
  );
}

function Mumbai({ ink, sky }: { ink: string; sky: string }) {
  // A waterfront gateway with four turrets, a skyline behind it.
  return (
    <g>
      <g fill={ink} opacity="0.45">
        <path d="M6 64 V40 H16 V64 Z M18 64 V30 H26 V64 Z M28 64 V46 H38 V64 Z M122 64 V36 H130 V64 Z M132 64 V26 H140 V64 Z M142 64 V44 H154 V64 Z" />
      </g>
      <g fill={ink}>
        <path d="M52 64 V32 H108 V64 H90 V48 A10 10 0 0 0 70 48 V64 Z" />
        <rect x="50" y="29" width="60" height="4" rx="1" />
        {[54, 66, 88, 100].map((x) => (
          <g key={x}>
            <rect x={x} y="20" width="6" height="10" />
            <path d={`M${x - 0.5} 20 Q${x + 3} 13 ${x + 6.5} 20 Z`} />
          </g>
        ))}
      </g>
      <g stroke={sky} strokeWidth="0.8" opacity="0.6">
        <path d="M56 40 H64 M96 40 H104" />
      </g>
    </g>
  );
}

function Bengaluru({ ink, green }: { ink: string; green: string }) {
  // A long civic building with a central dome, framed by trees.
  return (
    <g>
      <g fill={ink}>
        <path d="M30 64 V46 H130 V64 Z" />
        <path d="M62 46 V40 H98 V46 Z" />
        <rect x="72" y="32" width="16" height="8" />
        <path d="M70 33 Q80 16 90 33 Z" />
        <rect x="79.2" y="12" width="1.6" height="7" />
      </g>
      <g stroke="#FFFFFF" strokeWidth="1" opacity="0.35">
        {[38, 46, 54, 106, 114, 122].map((x) => (
          <path key={x} d={`M${x} 50 V62`} />
        ))}
      </g>
      <g fill={green}>
        <circle cx="16" cy="52" r="11" />
        <circle cx="26" cy="58" r="8" />
        <circle cx="144" cy="52" r="11" />
        <circle cx="134" cy="58" r="8" />
      </g>
    </g>
  );
}

function ClassicMiniBoard() {
  // The classic board in miniature: four coloured corners around a cross.
  const [crimson, blue, emerald, golden] = CLASSIC_IDENTITIES.map((i) => i.body);
  const s = 64;
  const x = (W - s) / 2;
  const y = (H - s) / 2;
  const q = (s * 6) / 15;
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx="5" fill="#FFFFFF" stroke="#D8D0C2" />
      <rect x={x + 2} y={y + 2} width={q - 2} height={q - 2} rx="3" fill={crimson} />
      <rect x={x + s - q} y={y + 2} width={q - 2} height={q - 2} rx="3" fill={blue} />
      <rect x={x + s - q} y={y + s - q} width={q - 2} height={q - 2} rx="3" fill={emerald} />
      <rect x={x + 2} y={y + s - q} width={q - 2} height={q - 2} rx="3" fill={golden} />
      <path d={`M${W / 2} ${H / 2 - 5} L${W / 2 + 5} ${H / 2} L${W / 2} ${H / 2 + 5} L${W / 2 - 5} ${H / 2} Z`} fill="#141821" opacity="0.15" />
    </g>
  );
}

export function CityPreviewArt({ city, className = "" }: { city: CityThemeId | CityTheme; className?: string }) {
  const theme = typeof city === "string" ? getCityTheme(city) : city;
  const id = useId().replace(/:/g, "");
  const p = theme.palette;
  const ink = p.boardFrame;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block h-auto w-full ${className}`} aria-hidden="true" focusable="false" data-city-art={theme.id}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      {theme.id === "classic" ? (
        <ClassicMiniBoard />
      ) : (
        <>
          <circle {...SUN[theme.id as Exclude<CityThemeId, "classic">]} fill="#FFFFFF" opacity="0.55" />
          {theme.id === "kolkata" ? <Kolkata ink={ink} /> : null}
          {theme.id === "delhi" ? <Delhi ink={ink} sky={p.sky[1]} /> : null}
          {theme.id === "chennai" ? <Chennai ink={ink} /> : null}
          {theme.id === "mumbai" ? <Mumbai ink={ink} sky={p.sky[1]} /> : null}
          {theme.id === "bengaluru" ? <Bengaluru ink={ink} green={p.accent} /> : null}
          {p.water ? (
            <>
              <rect y={HORIZON} width={W} height={H - HORIZON} fill={p.water} />
              <path d={`M18 ${HORIZON + 8} H44 M70 ${HORIZON + 14} H104 M120 ${HORIZON + 7} H146`} stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
              <rect y={H - 12} width={W} height="12" fill={p.ground} />
            </>
          ) : (
            <>
              <rect y={HORIZON} width={W} height={H - HORIZON} fill={p.ground} />
              <path d={`M80 ${HORIZON} L50 ${H} M80 ${HORIZON} L110 ${H}`} stroke={p.groundAccent} strokeWidth="1.2" opacity="0.6" />
            </>
          )}
        </>
      )}
    </svg>
  );
}
