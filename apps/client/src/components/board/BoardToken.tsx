// A token on the board: the reference 2D token layers (design-tokens
// token2dSvg: shadow, halo, rim, resin body, gloss, symbol) plus the approved
// states from docs/design/token-design.md. Position changes are CSS transform
// transitions, so only transform and opacity animate.

import { memo, useId, type KeyboardEvent } from "react";
import { BOARD_SURFACES, INK, SYMBOL_PATHS, TOKEN_2D, TOKEN_HALO, type PlayerIdentity } from "@ludo/design-tokens";

export type BoardTokenState = "idle" | "movable" | "selected" | "unmovable" | "captured" | "finished";

/** The token's drawing, centred on (0, 0) in a box of `size`. */
export function TokenShape({ identity, size, state = "idle", lifted = false }: { identity: PlayerIdentity; size: number; state?: BoardTokenState; lifted?: boolean }) {
  const id = `g${useId().replace(/:/g, "")}`;
  const k = size / 88;
  const s = TOKEN_2D;
  const symbolScale = s.symbolSize / 24;
  const symbolOffset = 50 - s.symbolSize / 2;
  const opacity = state === "unmovable" ? 0.6 : state === "captured" ? 0.35 : 1;
  return (
    <g transform={`scale(${k}) translate(-50 -50)`} opacity={opacity} style={{ transition: "opacity 220ms ease" }}>
      <g style={{ transform: lifted ? "translateY(-6px) scale(1.06)" : "none", transformOrigin: "50px 50px", transition: "transform 220ms cubic-bezier(0.34,1.4,0.64,1)" }}>
        <defs>
          <radialGradient id={id} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor={identity.highlight} />
            <stop offset="0.55" stopColor={identity.body} />
            <stop offset="1" stopColor={identity.rim} />
          </radialGradient>
        </defs>
        {state === "movable" ? <circle className="token-movable-ring" cx="50" cy="50" r={s.stateRing} fill="none" stroke={identity.body} strokeWidth="3.5" opacity="0.9" /> : null}
        {state === "selected" ? (
          <>
            <circle cx="50" cy="50" r={s.stateRing} fill="none" stroke={INK.dark} strokeWidth="4" />
            <circle cx="50" cy="50" r={s.stateRing - 3} fill="none" stroke={TOKEN_HALO} strokeWidth="2" />
          </>
        ) : null}
        <ellipse cx="50" cy="91" rx="30" ry="5.5" fill={BOARD_SURFACES.line} opacity="0.9" />
        <circle cx="50" cy="50" r={s.halo} fill={TOKEN_HALO} />
        <circle cx="50" cy="50" r={s.rim} fill={identity.rim} />
        <circle cx="50" cy="50" r={s.body} fill={`url(#${id})`} />
        <ellipse cx="41" cy="33" rx="17" ry="9" fill="#FFFFFF" opacity="0.28" />
        <path d={SYMBOL_PATHS[identity.symbol]} fill={identity.ink} transform={`translate(${symbolOffset} ${symbolOffset}) scale(${symbolScale})`} />
        {state === "finished" ? (
          <g transform="translate(70 14)">
            <circle r="15" fill={INK.dark} />
            <path d="M-6.5 0l4.5 4.5 9-9" fill="none" stroke="#E3B341" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : null}
      </g>
    </g>
  );
}

export interface BoardTokenProps {
  identity: PlayerIdentity;
  x: number;
  y: number;
  size: number;
  state: BoardTokenState;
  /** Transform transition for this position change (0 = jump). */
  moveMs: number;
  /** Shown on movable tokens; matches the move tray entry. */
  badge?: number | null;
  /** Stack count badge (5 or more on one cell). */
  count?: number | null;
  /** Accessible name; when set with onActivate, the token is a button. */
  label?: string;
  onActivate?: () => void;
  onPreview?: (on: boolean) => void;
  testId?: string;
  /** The step drawn (exposed as data for tests and tooling). */
  step?: number | null;
}

export const BoardToken = memo(function BoardToken({ identity, x, y, size, state, moveMs, badge = null, count = null, label, onActivate, onPreview, testId, step = null }: BoardTokenProps) {
  const interactive = Boolean(onActivate);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate?.();
    }
  };
  return (
    <g
      data-testid={testId}
      data-state={state}
      data-step={step === null ? "base" : step}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label : undefined}
      onClick={onActivate}
      onKeyDown={interactive ? onKeyDown : undefined}
      onPointerEnter={onPreview ? () => onPreview(true) : undefined}
      onPointerLeave={onPreview ? () => onPreview(false) : undefined}
      onFocus={onPreview ? () => onPreview(true) : undefined}
      onBlur={onPreview ? () => onPreview(false) : undefined}
      className={[interactive ? "board-token-button cursor-pointer outline-none" : "", moveMs > 0 ? "board-token-moving" : ""].filter(Boolean).join(" ") || undefined}
      style={{ transform: `translate(${x}px, ${y}px)`, transition: moveMs > 0 ? `transform ${moveMs}ms cubic-bezier(0.2, 0, 0, 1)` : "none" }}
    >
      {interactive ? <circle r={Math.max(size * 0.62, 22)} fill="transparent" /> : null}
      {interactive ? <circle className="board-token-focus" r={size * 0.62} fill="none" stroke="#1f5fd6" strokeWidth="3" /> : null}
      <TokenShape identity={identity} size={size} state={state} lifted={state === "selected"} />
      {badge !== null ? (
        <g transform={`translate(${size * 0.42} ${-size * 0.42})`} aria-hidden="true">
          <circle r="9" fill={INK.dark} />
          <text y="3.6" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="Inter Variable, Inter, sans-serif" fill="#FFFFFF">
            {badge}
          </text>
        </g>
      ) : null}
      {count !== null ? (
        <g transform={`translate(${-size * 0.5} ${-size * 0.5})`} aria-hidden="true">
          <rect x="-10" y="-8" width="20" height="16" rx="8" fill="#FFFFFF" stroke={INK.dark} strokeWidth="1.5" />
          <text y="4" textAnchor="middle" fontSize="10" fontWeight="700" fill={INK.dark}>
            {count}
          </text>
        </g>
      ) : null}
    </g>
  );
});
