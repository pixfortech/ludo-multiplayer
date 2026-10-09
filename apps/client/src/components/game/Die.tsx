// The 2D die (docs/design/dice-design.md): ivory body, recessed ink pips, gold
// rings on the six. While a roll is in flight it cycles faces as a pure
// presentation; it always lands on the value the server sent.

import { useEffect, useId, useState } from "react";
import { BOARD_SURFACES, DIE, INK } from "@ludo/design-tokens";

const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]],
};

export function DieFace({ value, size, dimmed = false }: { value: number | null; size: number; dimmed?: boolean }) {
  const id = `die${useId().replace(/:/g, "")}`;
  const pips = value ? PIPS[value]! : [];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ opacity: dimmed ? 0.7 : 1, transition: "opacity 220ms ease" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DIE.ivoryLight} />
          <stop offset="1" stopColor={DIE.ivory} />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="95" rx="40" ry="4" fill={BOARD_SURFACES.line} />
      <rect x="4" y="4" width="92" height="88" rx="21" fill={`url(#${id})`} stroke={BOARD_SURFACES.line} strokeWidth="1.5" />
      {pips.map(([x, y], i) => (
        <g key={i}>
          {value === 6 ? <circle cx={x} cy={y - 2} r="11" fill="none" stroke={DIE.gold} strokeWidth="1.6" /> : null}
          <circle cx={x} cy={y - 2} r="8.5" fill={INK.dark} />
        </g>
      ))}
    </svg>
  );
}

/** The die in play: tumbles while rolling, then settles on the server's value. */
export function Die({ value, rolling, revealKey, size, dimmed = false }: { value: number | null; rolling: boolean; revealKey: number; size: number; dimmed?: boolean }) {
  const [face, setFace] = useState<number>(value ?? 1);
  useEffect(() => {
    if (!rolling) return;
    let previous = face;
    const timer = setInterval(() => {
      // Presentation only: shows other faces while the server's value is on its way.
      const next = 1 + ((previous + 1 + Math.floor(Math.random() * 4)) % 6);
      previous = next;
      setFace(next);
    }, 90);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when rolling starts or stops
  }, [rolling]);
  const shown = rolling ? face : value;
  return (
    <span key={rolling ? "rolling" : `r${revealKey}`} className={`inline-flex ${rolling ? "die-tumbling" : revealKey > 0 ? "die-settled" : ""}`} data-testid="die" data-value={rolling ? "rolling" : (value ?? "none")}>
      <DieFace value={shown ?? null} size={size} dimmed={dimmed} />
    </span>
  );
}
