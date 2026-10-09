// Brand mark: four rounded seat quadrants around a porcelain centre (the board
// in miniature) and the Outfit wordmark.

import { PLAYER_IDENTITIES } from "@ludo/design-tokens";

export function BrandMark({ size = 36 }: { size?: number }) {
  const q = PLAYER_IDENTITIES.slice(0, 4).map((p) => p.body);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <rect width="40" height="40" rx="11" fill="#FFFFFF" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke="#E2DCD1" />
      <rect x="5" y="5" width="13.5" height="13.5" rx="4.5" fill={q[0]} />
      <rect x="21.5" y="5" width="13.5" height="13.5" rx="4.5" fill={q[1]} />
      <rect x="21.5" y="21.5" width="13.5" height="13.5" rx="4.5" fill={q[2]} />
      <rect x="5" y="21.5" width="13.5" height="13.5" rx="4.5" fill={q[3]} />
      <rect x="15" y="15" width="10" height="10" rx="2.5" transform="rotate(45 20 20)" fill="#FFFFFF" stroke="#E2DCD1" />
    </svg>
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark size={size} />
      <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">
        Ludo<span className="text-accent">.</span>
      </span>
    </span>
  );
}
