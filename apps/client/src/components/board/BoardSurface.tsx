// The static classic board, drawn from the layout data: frame, four bases,
// the clockwise shared track with seat starts and safe stars, four home lanes
// and the centre finish. Memoised: it redraws only when seats or the current
// player change.
import { memo } from "react";
import { CLASSIC_SAFE_INDICES, CLASSIC_START_INDEX, CLASSIC_TRACK } from "@ludo/board-layouts";
import { BOARD_PX } from "./geometry";
import { BoardCell } from "./BoardCell";
import { FinishArea } from "./FinishArea";
import { HomeLane } from "./HomeLane";
import { PlayerBase } from "./PlayerBase";
import { WHITE } from "./surfaceShared";

const TRACK = CLASSIC_TRACK.map((cell, index) => {
  const startSeat = CLASSIC_START_INDEX.indexOf(index);
  return { cell, index, next: CLASSIC_TRACK[(index + 1) % CLASSIC_TRACK.length]!, startSeat: startSeat >= 0 ? startSeat : null, safe: startSeat < 0 && CLASSIC_SAFE_INDICES.includes(index) };
});

export interface BoardSurfaceProps {
  /** Seats in play; others are drawn muted. */
  activeSeats?: readonly number[];
  /** The current player's seat: their base glows. */
  currentSeat?: number | null;
  /** Small labels drawn in base centres (e.g. "You"). */
  baseLabels?: Partial<Record<number, string>>;
}

export const BoardSurface = memo(function BoardSurface({ activeSeats = [0, 1, 2, 3], currentSeat = null, baseLabels = {} }: BoardSurfaceProps) {
  const muted = (seat: number) => !activeSeats.includes(seat);
  return (
    <g>
      <rect x="2" y="6" width={BOARD_PX - 4} height={BOARD_PX - 4} rx="28" fill="#141821" opacity="0.07" />
      <rect x="0" y="0" width={BOARD_PX} height={BOARD_PX} rx="28" fill={WHITE} />
      <rect x="0.75" y="0.75" width={BOARD_PX - 1.5} height={BOARD_PX - 1.5} rx="27.5" fill="none" stroke="#E2DCD1" strokeWidth="1.5" />
      {[0, 1, 2, 3].map((seat) => (
        <PlayerBase key={seat} seat={seat} muted={muted(seat)} active={currentSeat === seat} {...(baseLabels[seat] ? { label: baseLabels[seat] } : {})} />
      ))}
      {TRACK.map(({ cell, index, next, startSeat, safe }) => (
        <BoardCell key={index} cell={cell} next={next} startSeat={startSeat} safe={safe} muted={startSeat !== null && muted(startSeat)} />
      ))}
      {[0, 1, 2, 3].map((seat) => (
        <HomeLane key={seat} seat={seat} muted={muted(seat)} />
      ))}
      <FinishArea mutedSeats={[0, 1, 2, 3].filter(muted)} />
    </g>
  );
});
