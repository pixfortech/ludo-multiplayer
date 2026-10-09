// One large target per legal move from the server (docs/design/
// interaction-crowded-boards.md): symbol, number (matching the board badge),
// where it goes and what happens. Never depends on cell size.
//   Touch: the first tap previews the move on the board, a second tap makes it.
//   Mouse: hovering previews, one click makes it (docs/design/ui-desktop.md).
import type { PlayerIdentity } from "@ludo/design-tokens";
import type { LegalMoveView } from "@ludo/shared-types";
import { moveOutcomes, moveSummary, type NameOf } from "../../lib/gameText";
import { PlayerToken } from "./PlayerToken";

interface MoveTrayProps {
  moves: readonly LegalMoveView[];
  identity: PlayerIdentity;
  selected: number | null;
  pending: number | null;
  nameOf: NameOf;
  dice: number | null;
  /** Mouse: click moves at once and hover previews. Touch: tap to preview, tap again to move. */
  direct: boolean;
  onSelect: (tokenId: number) => void;
  onConfirm: (tokenId: number) => void;
  onPreview: (tokenId: number | null) => void;
  layout?: "list" | "grid";
}

export function MoveTray({ moves, identity, selected, pending, nameOf, dice, direct, onSelect, onConfirm, onPreview, layout = "list" }: MoveTrayProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="move-tray">
      <p className="text-[13px] font-semibold text-ink-muted">{dice ? `Move ${dice}: ${direct ? "choose a token" : "tap a token, then tap again to move"}` : "Choose a token"}</p>
      <ul className={`grid gap-2 ${layout === "grid" ? "grid-cols-2" : ""}`} role="listbox" aria-label="Legal moves">
        {moves.map((m, i) => {
          const isSelected = selected === m.tokenId;
          const outcomes = moveOutcomes(m, nameOf);
          const detail = [moveSummary(m), ...outcomes].join(" · ");
          return (
            <li key={m.tokenId} role="option" aria-selected={isSelected}>
              <button
                type="button"
                disabled={pending !== null}
                aria-label={`Token ${m.tokenId + 1}: ${detail}${!direct && isSelected ? ". Tap again to move" : ""}`}
                onClick={() => (direct || isSelected ? onConfirm(m.tokenId) : onSelect(m.tokenId))}
                onPointerEnter={direct ? () => onPreview(m.tokenId) : undefined}
                onPointerLeave={direct ? () => onPreview(null) : undefined}
                onFocus={() => onPreview(m.tokenId)}
                onBlur={() => onPreview(null)}
                className={`press flex min-h-14 w-full items-center gap-2.5 rounded-[var(--radius-control)] border-2 bg-surface px-2.5 py-1.5 text-left disabled:opacity-60 ${isSelected ? "border-ink" : "border-border hover:border-[#cfc6b7]"}`}
              >
                <span className="relative shrink-0">
                  <PlayerToken identity={identity} size={28} shadow={false} />
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">{i + 1}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{pending === m.tokenId ? "Moving…" : !direct && isSelected ? "Tap to move" : `Token ${m.tokenId + 1}`}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
