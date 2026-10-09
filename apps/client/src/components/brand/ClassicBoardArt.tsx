// The classic board as an illustration (home hero, create preview, lobby):
// the same surface and tokens as the game board (components/board), placing
// pieces where it is told. It decides nothing about the game.

import { memo, type ReactNode } from "react";
import { CLASSIC_BASE_ORIGIN } from "@ludo/board-layouts";
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { BoardSurface } from "../board/BoardSurface";
import { TokenShape } from "../board/BoardToken";
import { BOARD_PX, CELL, PAD, piecePosition, seatRoute } from "../board/geometry";

export { BOARD_PX, CELL, piecePosition, seatRoute };

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
  return (
    <svg viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={`block h-auto w-full ${className}`}>
      <BoardSurface activeSeats={activeSeats} />
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
            <TokenShape identity={PLAYER_IDENTITIES[p.seat]!} size={CELL * 0.86} lifted={liftedSeat === p.seat} />
          </g>
        );
      })}
      {children}
    </svg>
  );
});

export const BOARD_GEOMETRY = { CELL, PAD, BOARD_PX, baseOrigin: CLASSIC_BASE_ORIGIN };
