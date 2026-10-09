// The classic board as React SVG, drawn from the real layout data
// (@ludo/board-layouts) and design tokens, matching the approved procedural
// concept (docs/design/generated/classic-board-concept.svg): stepped tonal
// bases, white track, seat-coloured starts with clockwise chevrons, quiet safe
// stars, lanes deepening toward the flat centre triangles.
//
// Illustration and preview only: it places pieces where it is told and
// decides nothing about the game (the 2D game renderer is Batch 3B).

import { memo, useId, type ReactNode } from "react";
import { BOARD_SURFACES, PLAYER_IDENTITIES, SAFE_STAR_PATH, SYMBOL_PATHS, TOKEN_2D, TOKEN_HALO, mixLab, type PlayerIdentity } from "@ludo/design-tokens";
import {
  CLASSIC_BASE_ORIGIN,
  CLASSIC_CENTRE,
  CLASSIC_GRID,
  CLASSIC_HOME_LANES,
  CLASSIC_SAFE_INDICES,
  CLASSIC_START_INDEX,
  CLASSIC_TRACK,
  classicBaseSlots,
  classicHomeEntryIndex,
  classicSeatPath,
  type Cell,
} from "@ludo/board-layouts";

export const CELL = 40;
const PAD = 16;
export const BOARD_PX = CLASSIC_GRID * CELL + PAD * 2;
const WHITE = "#FFFFFF";
const SEPARATOR = "#ECE7DE";
const BASE_TINTS = [0.08, 0.3, 0.48, 0.64, 0.8];
const LANE_TINTS = [0.8, 0.64, 0.47, 0.3, 0.12];

const px = (col: number) => PAD + col * CELL;
const tint = (hex: string, t: number) => (t === 0 ? hex : mixLab(hex, WHITE, t));
export const cellCentre = (c: Cell) => ({ x: px(c.col) + CELL / 2, y: px(c.row) + CELL / 2 });

/** Where a piece is drawn: its base slot, a track or lane cell, or the finish. */
export function piecePosition(seat: number, step: number | null, slot = 0): { x: number; y: number } {
  if (step === null) {
    const s = classicBaseSlots(seat)[slot % 4]!;
    return { x: PAD + s.x * CELL, y: PAD + s.y * CELL };
  }
  const path = classicSeatPath(seat);
  if (step <= 50) return cellCentre(path.track[step]!);
  if (step <= 55) return cellCentre(path.lane[step - 51]!);
  return cellCentre(path.finish);
}

/** The seat's whole clockwise route (start → lane end), as points. */
export function seatRoute(seat: number): { x: number; y: number }[] {
  const path = classicSeatPath(seat);
  return [...path.track, ...path.lane].map(cellCentre);
}

// Static geometry, computed once.
const BASES = CLASSIC_BASE_ORIGIN.map((o, seat) => {
  const body = PLAYER_IDENTITIES[seat]!.body;
  return BASE_TINTS.map((t, k) => {
    const inset = 4 + k * CELL * 0.5;
    return { x: px(o.col) + inset, y: px(o.row) + inset, side: 6 * CELL - inset * 2, rx: Math.max(6, 40 - k * 8), fill: tint(body, t) };
  });
});
const TRACK = CLASSIC_TRACK.map((c, index) => {
  const startSeat = CLASSIC_START_INDEX.indexOf(index);
  return { c, index, startSeat, safe: startSeat < 0 && CLASSIC_SAFE_INDICES.includes(index) };
});
const LANES = CLASSIC_HOME_LANES.map((lane, seat) => lane.map((c, i) => ({ c, fill: tint(PLAYER_IDENTITIES[seat]!.body, LANE_TINTS[i]!) })));
const ENTRY_CHEVRONS = CLASSIC_HOME_LANES.map((lane, seat) => ({ from: CLASSIC_TRACK[classicHomeEntryIndex(seat)]!, to: lane[0]!, fill: tint(PLAYER_IDENTITIES[seat]!.body, 0.2) }));

function Chevron({ from, to, stroke, size = 0.42 }: { from: Cell; to: Cell; stroke: string; size?: number }) {
  const angle = (Math.atan2(to.row - from.row, to.col - from.col) * 180) / Math.PI;
  const k = CELL * size;
  const { x, y } = cellCentre(from);
  return <path d={`M${-k * 0.35} ${-k * 0.5}L${k * 0.35} 0L${-k * 0.35} ${k * 0.5}`} fill="none" stroke={stroke} strokeWidth={CELL * 0.08} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${x} ${y}) rotate(${angle})`} />;
}

/** A token as SVG group, same layers as the reference 2D token. */
export function TokenShape({ identity, x, y, size = CELL * 0.86, lifted = false }: { identity: PlayerIdentity; x: number; y: number; size?: number; lifted?: boolean }) {
  const id = `g${useId().replace(/:/g, "")}`;
  const k = size / 88;
  const s = TOKEN_2D;
  const symbolScale = s.symbolSize / 24;
  const symbolOffset = 50 - s.symbolSize / 2;
  return (
    <g transform={`translate(${x - 50 * k} ${y - 50 * k}) scale(${k})`}>
      <g style={{ transform: lifted ? "translateY(-6px) scale(1.06)" : "none", transformOrigin: "50px 50px", transition: "transform 220ms cubic-bezier(0.34,1.4,0.64,1)" }}>
        <defs>
          <radialGradient id={id} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor={identity.highlight} />
            <stop offset="0.55" stopColor={identity.body} />
            <stop offset="1" stopColor={identity.rim} />
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="91" rx="30" ry="5.5" fill={BOARD_SURFACES.line} opacity="0.9" />
        <circle cx="50" cy="50" r={s.halo} fill={TOKEN_HALO} />
        <circle cx="50" cy="50" r={s.rim} fill={identity.rim} />
        <circle cx="50" cy="50" r={s.body} fill={`url(#${id})`} />
        <ellipse cx="41" cy="33" rx="17" ry="9" fill="#FFFFFF" opacity="0.28" />
        <path d={SYMBOL_PATHS[identity.symbol]} fill={identity.ink} transform={`translate(${symbolOffset} ${symbolOffset}) scale(${symbolScale})`} />
      </g>
    </g>
  );
}

export interface BoardPiece {
  key: string;
  seat: number;
  step: number | null;
  slot?: number;
}

interface ClassicBoardArtProps {
  pieces?: readonly BoardPiece[];
  /** Seats in play; others are drawn muted (e.g. a 2-player room). Default: all four. */
  activeSeats?: readonly number[];
  /** Seat whose route is traced on the board. */
  routeSeat?: number | null;
  /** Seat whose pieces are lifted. */
  liftedSeat?: number | null;
  /** Interactive overlays rendered last (e.g. focusable base hit areas). */
  children?: ReactNode;
  title?: string;
  className?: string;
}

export const ClassicBoardArt = memo(function ClassicBoardArt({ pieces = [], activeSeats = [0, 1, 2, 3], routeSeat = null, liftedSeat = null, children, title, className = "" }: ClassicBoardArtProps) {
  const cx = px(CLASSIC_CENTRE.col);
  const m = 3 * CELL;
  const mid = `${cx + m / 2},${cx + m / 2}`;
  const triangles = [`${cx},${cx} ${cx},${cx + m} ${mid}`, `${cx},${cx} ${cx + m},${cx} ${mid}`, `${cx + m},${cx} ${cx + m},${cx + m} ${mid}`, `${cx},${cx + m} ${cx + m},${cx + m} ${mid}`];
  const muted = (seat: number) => !activeSeats.includes(seat);
  return (
    <svg viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={`block h-auto w-full ${className}`}>
      <rect x="2" y="6" width={BOARD_PX - 4} height={BOARD_PX - 4} rx="28" fill="#141821" opacity="0.07" />
      <rect x="0" y="0" width={BOARD_PX} height={BOARD_PX} rx="28" fill={WHITE} />
      {BASES.map((rects, seat) => (
        <g key={seat} opacity={muted(seat) ? 0.32 : 1} style={{ transition: "opacity 220ms ease" }}>
          {rects.map((r, k) => (
            <rect key={k} x={r.x} y={r.y} width={r.side} height={r.side} rx={r.rx} fill={r.fill} />
          ))}
          {classicBaseSlots(seat).map((s, i) => (
            <circle key={i} cx={PAD + s.x * CELL} cy={PAD + s.y * CELL} r={CELL * 0.44} fill={WHITE} opacity="0.55" />
          ))}
        </g>
      ))}
      {TRACK.map(({ c, index, startSeat, safe }) => (
        <g key={index}>
          <rect x={px(c.col) + 0.5} y={px(c.row) + 0.5} width={CELL - 1} height={CELL - 1} rx="3" fill={startSeat >= 0 ? PLAYER_IDENTITIES[startSeat]!.body : BOARD_SURFACES.cell} stroke={SEPARATOR} opacity={startSeat >= 0 && muted(startSeat) ? 0.4 : 1} />
          {startSeat >= 0 ? <Chevron from={c} to={CLASSIC_TRACK[(index + 1) % CLASSIC_TRACK.length]!} stroke={WHITE} /> : null}
          {safe ? <path d={SAFE_STAR_PATH} fill={BOARD_SURFACES.safeMark} opacity="0.45" transform={`translate(${px(c.col) + CELL * 0.25} ${px(c.row) + CELL * 0.25}) scale(${(CELL * 0.5) / 24})`} /> : null}
        </g>
      ))}
      {LANES.map((lane, seat) => (
        <g key={seat} opacity={muted(seat) ? 0.4 : 1}>
          {lane.map(({ c, fill }, i) => (
            <rect key={i} x={px(c.col) + 0.5} y={px(c.row) + 0.5} width={CELL - 1} height={CELL - 1} rx="3" fill={fill} stroke={SEPARATOR} />
          ))}
          <Chevron from={ENTRY_CHEVRONS[seat]!.from} to={ENTRY_CHEVRONS[seat]!.to} stroke={ENTRY_CHEVRONS[seat]!.fill} size={0.34} />
        </g>
      ))}
      {triangles.map((points, seat) => (
        <polygon key={seat} points={points} fill={PLAYER_IDENTITIES[seat]!.body} opacity={muted(seat) ? 0.4 : 1} />
      ))}
      {routeSeat !== null ? (
        <polyline
          points={seatRoute(routeSeat)
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill="none"
          stroke={PLAYER_IDENTITIES[routeSeat]!.rim}
          strokeWidth={CELL * 0.14}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${CELL * 0.18} ${CELL * 0.26}`}
          opacity="0.55"
        />
      ) : null}
      {pieces.map((p) => {
        const at = piecePosition(p.seat, p.step, p.slot);
        return (
          <g key={p.key} style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: "transform 170ms cubic-bezier(0.34,1.4,0.64,1)" }}>
            <TokenShape identity={PLAYER_IDENTITIES[p.seat]!} x={0} y={0} lifted={liftedSeat === p.seat} />
          </g>
        );
      })}
      {children}
    </svg>
  );
});

export const BOARD_GEOMETRY = { CELL, PAD, BOARD_PX, baseOrigin: CLASSIC_BASE_ORIGIN };
