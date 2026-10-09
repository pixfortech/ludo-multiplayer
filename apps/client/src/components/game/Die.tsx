// The die (docs/design/dice-design.md): one ivory-resin die, rounded and
// bevelled, with recessed ink pips and gold rings on the six. It is a small
// CSS-3D cube of six identical faces around a solid core, so it can tumble
// in the 2D interface without a 3D engine.
//
// The die never decides or predicts a value. While a roll is in flight it
// tumbles (a fixed spin, the same for every roll); when the server's value is
// revealed it settles from wherever it is onto that face. The settle starts
// from the spin's current orientation, so there is no snap. Reduced motion:
// no tumble, the value crossfades in.

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { BOARD_SURFACES, DIE, INK } from "@ludo/design-tokens";

const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]],
};

/** One face: ivory gradient, fine bevel, recessed pips (inner shadow), gold rings on the six. */
export function DieFace({ value, size }: { value: number | null; size: number }) {
  const id = `die${useId().replace(/:/g, "")}`;
  const pips = value ? PIPS[value]! : [];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DIE.ivoryLight} />
          <stop offset="1" stopColor={DIE.ivory} />
        </linearGradient>
        <radialGradient id={`${id}-p`} cx="45%" cy="40%" r="60%">
          <stop offset="0" stopColor="#3a3f4b" />
          <stop offset="1" stopColor={INK.dark} />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="98" height="98" rx="22" fill={`url(#${id}-b)`} stroke={BOARD_SURFACES.line} strokeWidth="1.5" />
      {/* Bevel: a light inner edge at the top, a soft shade at the bottom. */}
      <rect x="5" y="5" width="90" height="90" rx="18" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.7" />
      <path d="M12 93 Q50 99 88 93" fill="none" stroke="#D9CFBE" strokeWidth="2" opacity="0.6" />
      {pips.map(([x, y], i) => (
        <g key={i}>
          {value === 6 ? <circle className="die-six-ring" cx={x} cy={y} r="11" fill="none" stroke={DIE.gold} strokeWidth="1.6" /> : null}
          <circle cx={x} cy={y + 0.8} r="8.5" fill="#FFFFFF" opacity="0.8" />
          <circle cx={x} cy={y} r="8.5" fill={`url(#${id}-p)`} />
        </g>
      ))}
    </svg>
  );
}

/** Rotation that brings `value` to the front (standard die: opposite faces sum to 7). */
const FACE_UP: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  6: "rotateX(0deg) rotateY(180deg)",
  3: "rotateX(0deg) rotateY(-90deg)",
  4: "rotateX(0deg) rotateY(90deg)",
  2: "rotateX(-90deg) rotateY(0deg)",
  5: "rotateX(90deg) rotateY(0deg)",
};
const FACES: [number, string][] = [
  [1, "rotateY(0deg)"],
  [6, "rotateY(180deg)"],
  [3, "rotateY(90deg)"],
  [4, "rotateY(-90deg)"],
  [2, "rotateX(90deg)"],
  [5, "rotateX(-90deg)"],
];

/** The tumble: a lively spin on three axes with a small hop, added on top of the resting face; the same every roll. Its last frame equals its first, so it loops seamlessly. */
const SPIN: Keyframe[] = [
  { transform: "translateY(0%) scale3d(0.86, 0.86, 0.86) rotateX(0deg) rotateY(0deg) rotateZ(0deg)" },
  { transform: "translateY(-12%) scale3d(0.86, 0.86, 0.86) rotateX(200deg) rotateY(120deg) rotateZ(90deg)", offset: 0.35 },
  { transform: "translateY(0%) scale3d(0.86, 0.86, 0.86) rotateX(400deg) rotateY(250deg) rotateZ(180deg)", offset: 0.7 },
  { transform: "translateY(-5%) scale3d(0.86, 0.86, 0.86) rotateX(540deg) rotateY(310deg) rotateZ(270deg)", offset: 0.85 },
  { transform: "translateY(0%) scale3d(0.86, 0.86, 0.86) rotateX(720deg) rotateY(360deg) rotateZ(360deg)" },
];
const SPIN_MS = 640;
const SETTLE_MS = 420;
const SETTLE_EASE = "cubic-bezier(0.22, 1.25, 0.36, 1)"; // overshoot ≤ 6%, no wobble

export interface DieProps {
  /** The server's value (null before any roll). */
  value: number | null;
  rolling: boolean;
  /** Changes on every reveal. */
  revealKey: number;
  size: number;
  dimmed?: boolean;
  reduced?: boolean;
}

export function Die({ value, rolling, revealKey, size, dimmed = false, reduced = false }: DieProps) {
  const scene = useRef<HTMLSpanElement>(null);
  const cube = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const halo = useRef<HTMLSpanElement>(null);
  const spin = useRef<Animation | null>(null);
  const settle = useRef<Animation | null>(null);
  const faceUp = FACE_UP[value ?? 1]!;

  // Tumble while rolling; settle onto the revealed face when it stops. The cube's transform is set here,
  // not by React, so a reveal never moves the die before the settle starts from where it is.
  useLayoutEffect(() => {
    const el = cube.current;
    if (!el) return;
    const animated = typeof el.animate === "function";
    if (rolling) {
      settle.current?.cancel();
      if (reduced || !animated || spin.current) return;
      spin.current = el.animate(SPIN, { id: "die-spin", duration: SPIN_MS, iterations: Infinity, easing: "linear", composite: "add" });
      shadow.current?.animate([{ transform: "scale(1)", opacity: 0.9 }, { transform: "scale(0.7)", opacity: 0.5, offset: 0.35 }, { transform: "scale(1)", opacity: 0.9, offset: 0.7 }, { transform: "scale(0.85)", opacity: 0.7, offset: 0.85 }, { transform: "scale(1)", opacity: 0.9 }], { duration: SPIN_MS, iterations: Infinity });
      return;
    }
    if (spin.current) {
      const current = getComputedStyle(el).transform;
      spin.current.cancel();
      spin.current = null;
      shadow.current?.getAnimations().forEach((a) => a.cancel());
      el.style.transform = faceUp;
      settle.current = el.animate([{ transform: current && current !== "none" ? current : faceUp }, { transform: faceUp }], { duration: SETTLE_MS, easing: SETTLE_EASE });
      return;
    }
    el.style.transform = faceUp; // first draw, a snapshot, or reduced motion: no tumble
  }, [rolling, reduced, faceUp]);

  // A six: one soft gold halo and a firmer landing. Reduced motion: a quick crossfade instead.
  useEffect(() => {
    if (revealKey === 0) return;
    const el = cube.current;
    if (!el || typeof el.animate !== "function") return;
    if (reduced) {
      el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 120 });
      return;
    }
    if (value === 6) {
      halo.current?.animate([{ opacity: 0, transform: "scale(0.8)" }, { opacity: 1, transform: "scale(1.05)", offset: 0.3 }, { opacity: 0, transform: "scale(1.3)" }], { id: "die-six-glow", duration: 900, delay: SETTLE_MS - 160, easing: "ease-out" });
      scene.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.09)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 360, delay: SETTLE_MS - 140, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" });
    }
  }, [revealKey, value, reduced]);

  useLayoutEffect(
    () => () => {
      spin.current?.cancel();
      settle.current?.cancel();
    },
    [],
  );

  const half = size / 2;
  return (
    <span
      ref={scene}
      className="relative inline-block shrink-0"
      style={{ width: size, height: size, perspective: size * 7, opacity: dimmed ? 0.7 : 1, transition: "opacity 220ms ease" }}
      data-testid="die"
      data-value={rolling ? "rolling" : (value ?? "none")}
      data-six={!rolling && value === 6 ? "true" : undefined}
      role="img"
      aria-label={rolling ? "Rolling" : value ? `Die showing ${value}` : "Die"}
    >
      <span ref={halo} data-testid="die-six-glow" className="pointer-events-none absolute -inset-[30%] rounded-full opacity-0" style={{ background: `radial-gradient(circle, ${DIE.gold}a6 0%, ${DIE.gold}55 38%, ${DIE.gold}00 68%)` }} aria-hidden="true" />
      <span ref={shadow} className="absolute left-[10%] right-[10%] rounded-[50%]" style={{ bottom: -size * 0.06, height: size * 0.12, background: BOARD_SURFACES.line, opacity: 0.9 }} aria-hidden="true" />
      <span ref={cube} className="die-cube absolute inset-0" style={{ transformStyle: "preserve-3d" }} aria-hidden="true">
        {/* A solid core fills the rounded edges while the die turns. */}
        {FACES.map(([face, turn]) => (
          <span key={`core-${face}`} className="absolute inset-[7%] rounded-[12%]" style={{ background: DIE.ivory, transform: `${turn} translateZ(${half * 0.86}px)`, backfaceVisibility: "hidden" }} />
        ))}
        {FACES.map(([face, turn]) => (
          <span key={face} className="absolute inset-0" style={{ transform: `${turn} translateZ(${half}px)`, backfaceVisibility: "hidden" }} data-face={face}>
            <DieFace value={face} size={size} />
          </span>
        ))}
      </span>
    </span>
  );
}
