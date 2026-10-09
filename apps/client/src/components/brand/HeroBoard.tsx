// The home-page board: a calm demo of real moves on the real geometry.
// Tokens hop clockwise along their actual seat paths. Choose a seat (click,
// tap, Enter or Space on its base) to trace that seat's route to home.
// With reduced motion the board stays still.

import { useEffect, useMemo, useState } from "react";
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { SEAT_CORNERS } from "../../lib/format";
import { BOARD_GEOMETRY, ClassicBoardArt, type BoardPiece } from "./ClassicBoardArt";

const { CELL, PAD, baseOrigin } = BOARD_GEOMETRY;

/** Demo walkers: [seat, first step, last step]. Static pieces fill the rest of the scene. */
const WALKERS: [number, number, number][] = [
  [0, 0, 14],
  [2, 20, 34],
];
const STATIC: BoardPiece[] = [
  { key: "s1a", seat: 1, step: 4 },
  { key: "s3a", seat: 3, step: 33 },
  { key: "s2b", seat: 2, step: 53 },
  ...[
    [0, 2],
    [0, 3],
    [1, 1],
    [1, 2],
    [1, 3],
    [2, 0],
    [2, 3],
    [3, 0],
    [3, 1],
    [3, 2],
  ].map(([seat, slot]) => ({ key: `b${seat}${slot}`, seat: seat!, step: null, slot: slot! })),
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function HeroBoard() {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setTick((t) => t + 1), 520);
    return () => clearInterval(timer);
  }, [reduced]);

  const pieces = useMemo<BoardPiece[]>(() => {
    const walkers = WALKERS.map(([seat, from, to], i) => {
      const span = to - from + 1;
      const cycle = span + 4; // brief rest at the end of each walk
      const t = reduced ? Math.floor(span / 2) : (tick + i * 5) % cycle;
      // A new key per lap: the walker reappears at its start instead of sliding back across the board.
      const lap = reduced ? 0 : Math.floor((tick + i * 5) / cycle);
      return { key: `w${seat}-${lap}`, seat, step: from + Math.min(t, span - 1) };
    });
    return [...STATIC, ...walkers];
  }, [tick, reduced]);

  const focusSeat = hovered ?? selected;
  return (
    <figure className="relative m-0">
      <ClassicBoardArt pieces={pieces} routeSeat={selected} liftedSeat={focusSeat} title="A classic Ludo board in play, drawn from the game's real board layout">
        {baseOrigin.map((o, seat) => {
          const identity = PLAYER_IDENTITIES[seat]!;
          const label = `${identity.name}, ${SEAT_CORNERS[seat]!.toLowerCase()}: ${selected === seat ? "hide" : "show"} its route`;
          return (
            <rect
              key={seat}
              x={PAD + o.col * CELL}
              y={PAD + o.row * CELL}
              width={6 * CELL}
              height={6 * CELL}
              rx="36"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-pressed={selected === seat}
              aria-label={label}
              className="cursor-pointer outline-none focus-visible:stroke-[var(--color-focus)] focus-visible:[stroke-width:4]"
              onMouseEnter={() => setHovered(seat)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(seat)}
              onBlur={() => setHovered(null)}
              onClick={() => setSelected((s) => (s === seat ? null : seat))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected((s) => (s === seat ? null : seat));
                }
              }}
            />
          );
        })}
      </ClassicBoardArt>
      <figcaption className="sr-only">Choose a corner to trace that colour's clockwise route home.</figcaption>
    </figure>
  );
}
