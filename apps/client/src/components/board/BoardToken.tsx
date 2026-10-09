// A token on the board: the reference 2D token layers (design-tokens
// token2dSvg: halo, rim, resin body, gloss, symbol) plus the approved states
// from docs/design/token-design.md. Travel is animated with the Web
// Animations API on transforms only (tokenMotion.ts): the body lifts in a low
// arc while its contact shadow stays on the board. A position change without
// a motion is a jump (snapshots, reconnects): nothing is ever replayed.

import { memo, useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { BOARD_SURFACES, INK, SYMBOL_PATHS, TOKEN_2D, TOKEN_HALO, type PlayerIdentity } from "@ludo/design-tokens";
import type { TokenMotion } from "../game/useBoardPlayback";
import { CELL } from "./geometry";
import { tokenKeyframes } from "./tokenMotion";

export type BoardTokenState = "idle" | "movable" | "selected" | "unmovable" | "captured" | "finished";

/** The token's drawing, centred on (0, 0) in a box of `size`. Size changes (e.g. finishing) ease rather than jump. */
export function TokenShape({ identity, size, state = "idle", lifted = false, shadow = true }: { identity: PlayerIdentity; size: number; state?: BoardTokenState; lifted?: boolean; shadow?: boolean }) {
  const id = `g${useId().replace(/:/g, "")}`;
  const k = size / 88;
  const s = TOKEN_2D;
  const symbolScale = s.symbolSize / 24;
  const symbolOffset = 50 - s.symbolSize / 2;
  const opacity = state === "unmovable" ? 0.6 : state === "captured" ? 0.35 : 1;
  return (
    <g opacity={opacity} style={{ transform: `scale(${k}) translate(-50px, -50px)`, transition: "transform 320ms cubic-bezier(0.34,1.4,0.64,1), opacity 220ms ease" }}>
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
        {shadow ? <ellipse cx="50" cy="91" rx="30" ry="5.5" fill={BOARD_SURFACES.line} opacity="0.9" /> : null}
        <circle cx="50" cy="50" r={s.halo} fill={TOKEN_HALO} />
        <circle cx="50" cy="50" r={s.rim} fill={identity.rim} />
        <circle cx="50" cy="50" r={s.body} fill={`url(#${id})`} />
        <ellipse cx="41" cy="33" rx="17" ry="9" fill="#FFFFFF" opacity="0.28" />
        {/* A fine specular edge along the upper rim: polished resin. */}
        <path d="M22.5 41 A 28.5 28.5 0 0 1 58 22.5" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" opacity="0.32" />
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
  /** How the token travels to (x, y); undefined = jump there. */
  motion?: TokenMotion | undefined;
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

/** Runs one travel animation from the previous drawn position; cancels any still running. */
function useTokenTravel(x: number, y: number, size: number, motion: TokenMotion | undefined) {
  const outer = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  const previous = useRef({ x, y });
  const running = useRef<Animation[]>([]);
  const played = useRef<number | null>(null);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = { x, y };
    const moved = from.x !== x || from.y !== y;
    if (!moved) return;
    for (const a of running.current) a.cancel();
    running.current = [];
    const el = outer.current;
    // No motion (a snapshot, a reconnect, a fast-forward): jump. A motion plays once.
    if (!motion || motion.id === played.current || !el || typeof el.animate !== "function") return;
    played.current = motion.id;
    const frames = tokenKeyframes(motion.kind, from, { x, y }, CELL);
    const timing: KeyframeAnimationOptions = { duration: motion.ms, easing: frames.easing };
    const origin = motion.kind === "capture" ? "0px 0px" : `0px ${size * 0.42}px`;
    if (body.current) body.current.style.transformOrigin = origin;
    running.current = [el.animate(frames.travel, timing), body.current?.animate(frames.body, timing), shadow.current?.animate(frames.shadow, timing)].filter((a): a is Animation => Boolean(a));
  }, [x, y, size, motion]);

  useLayoutEffect(
    () => () => {
      for (const a of running.current) a.cancel();
    },
    [],
  );
  return { outer, body, shadow };
}

export const BoardToken = memo(function BoardToken({ identity, x, y, size, state, motion, badge = null, count = null, label, onActivate, onPreview, testId, step = null }: BoardTokenProps) {
  const interactive = Boolean(onActivate);
  const { outer, body, shadow } = useTokenTravel(x, y, size, motion);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate?.();
    }
  };
  const k = size / 88;
  return (
    <g
      ref={outer}
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
      className={interactive ? "board-token-button cursor-pointer outline-none" : undefined}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      {interactive ? <circle r={Math.max(size * 0.62, 22)} fill="transparent" /> : null}
      {interactive ? <circle className="board-token-focus" r={size * 0.62} fill="none" stroke="#1f5fd6" strokeWidth="3" /> : null}
      {/* The contact shadow stays on the board while the body lifts. */}
      <ellipse ref={shadow} cx="0" cy={41 * k} rx={30 * k} ry={5.5 * k} fill={BOARD_SURFACES.line} opacity={state === "captured" ? 0.3 : 0.9} style={{ transformOrigin: `0px ${41 * k}px`, transformBox: "view-box" }} />
      <g ref={body}>
        <TokenShape identity={identity} size={size} state={state} lifted={state === "selected"} shadow={false} />
      </g>
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
