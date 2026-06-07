import { colorTokens } from "../../theme";
import type { PlayerColor } from "../../types";

interface Props {
  color: PlayerColor;
  label: number; // token id + 1
  topPct: number; // centre, percentage of board height
  leftPct: number; // centre, percentage of board width
  sizePct: number; // diameter, percentage of board width
  selectable: boolean;
  selected: boolean;
  dim: boolean; // faded when it's not this colour's turn
  onClick: () => void;
}

/**
 * A token rendered as an absolutely-positioned chip over the board. Movable
 * tokens pulse and carry a ring; the selected token gets a stronger ring.
 */
export default function BoardToken({
  color,
  label,
  topPct,
  leftPct,
  sizePct,
  selectable,
  selected,
  dim,
  onClick,
}: Props) {
  const c = colorTokens(color);
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onClick}
      title={`${color} token ${label}`}
      className={`absolute flex items-center justify-center rounded-full border-2 border-white/90 text-[9px] font-extrabold text-white shadow-md transition-all duration-150 ${c.solid} ${
        selected
          ? `z-30 scale-110 ring-4 ring-white ${c.glow} shadow-lg`
          : selectable
            ? `z-20 ring-2 ring-white/90 ${c.glow} shadow-lg hover:scale-110 animate-pulse cursor-pointer`
            : `z-10 ${dim ? "opacity-70" : "opacity-95"} cursor-default`
      }`}
      style={{
        top: `${topPct}%`,
        left: `${leftPct}%`,
        width: `${sizePct}%`,
        height: `${sizePct}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {label}
    </button>
  );
}
