// The victory trophy: a gold cup carrying the winner's colour as a ribbon
// and their symbol on a medallion, so the identity never relies on colour
// alone. Drawn in SVG; no image assets.
import { useId } from "react";
import { SYMBOL_PATHS, type PlayerIdentity } from "@ludo/design-tokens";

export function Trophy({ identity, size = 120 }: { identity: PlayerIdentity; size?: number }) {
  const id = `tr${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`Trophy in ${identity.name}`} className="shrink-0">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBE7A8" />
          <stop offset="0.45" stopColor="#E3B341" />
          <stop offset="1" stopColor="#A9781F" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="110" rx="34" ry="5" fill="#141821" opacity="0.12" />
      {/* Handles */}
      <path d="M33 30c-15 0-17 22 4 27" fill="none" stroke={`url(#${id}-g)`} strokeWidth="6" strokeLinecap="round" />
      <path d="M87 30c15 0 17 22-4 27" fill="none" stroke={`url(#${id}-g)`} strokeWidth="6" strokeLinecap="round" />
      {/* Cup */}
      <path d="M30 18h60v20c0 19-13 33-30 33S30 57 30 38z" fill={`url(#${id}-g)`} />
      <path d="M38 22h8v18c0 9 4 16 9 20-9-2-17-10-17-20z" fill={`url(#${id}-s)`} opacity="0.9" />
      {/* The winner's ribbon */}
      <path d="M30 31h60v8H30z" fill={identity.body} />
      <path d="M30 31h60v2H30z" fill={identity.highlight} opacity="0.6" />
      {/* Stem and base */}
      <path d="M54 70h12v12H54z" fill={`url(#${id}-g)`} />
      <path d="M42 82h36l4 10H38z" fill={`url(#${id}-g)`} />
      <rect x="34" y="92" width="52" height="12" rx="3" fill="#2A2F3B" />
      <rect x="34" y="92" width="52" height="3" rx="1.5" fill="#FFFFFF" opacity="0.15" />
      {/* Medallion with the winner's symbol */}
      <circle cx="60" cy="52" r="11" fill="#FFFFFF" />
      <circle cx="60" cy="52" r="9.5" fill={identity.rim} />
      <circle cx="60" cy="52" r="8.3" fill={identity.body} />
      <path d={SYMBOL_PATHS[identity.symbol]} fill={identity.ink} transform="translate(51.7 43.7) scale(0.69)" />
      {/* A small star above the cup */}
      <path d="M60 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#E3B341" />
    </svg>
  );
}
