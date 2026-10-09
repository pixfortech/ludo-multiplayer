// The playable classic board. It renders whatever positions it is given
// (the authoritative state, or the animation toward it) and reports which
// token the player picked. It never decides what is legal: which tokens are
// movable, their badges and their previews all come from the server's
// legal-move list via the game screen.
import { memo, useMemo } from "react";
import type { PlayerIdentity } from "@ludo/design-tokens";
import { BoardSurface } from "./BoardSurface";
import type { TokenMotion } from "../game/useBoardPlayback";
import { BoardToken, type BoardTokenState } from "./BoardToken";
import { BOARD_PX } from "./geometry";
import { placeTokens, type BoardTokenInput } from "./placement";
import { DestinationMarker, EffectMark, MovePreviewPath, type BoardEffect, type MovePreview } from "./TokenOverlay";

export interface ClassicBoardProps {
  tokens: readonly BoardTokenInput[];
  identityOf: (playerId: string) => PlayerIdentity;
  activeSeats: readonly number[];
  currentSeat: number | null;
  youSeat: number | null;
  /** Per token key; default idle (finished tokens are always "finished"). */
  states?: Readonly<Record<string, BoardTokenState>>;
  badges?: Readonly<Record<string, number>>;
  labels?: Readonly<Record<string, string>>;
  /** Per token key: how it travels to its current position (none = jump). */
  motion?: Readonly<Record<string, TokenMotion>>;
  /** Tokens drawn above the rest (e.g. the one moving). */
  raised?: readonly string[];
  preview?: MovePreview | null;
  effects?: readonly BoardEffect[];
  onActivate?: (key: string) => void;
  onPreview?: (key: string | null) => void;
  title: string;
  dimmed?: boolean;
}

export const ClassicBoard = memo(function ClassicBoard({ tokens, identityOf, activeSeats, currentSeat, youSeat, states = {}, badges = {}, labels = {}, motion = {}, raised = [], preview = null, effects = [], onActivate, onPreview, title, dimmed = false }: ClassicBoardProps) {
  const placements = useMemo(() => placeTokens(tokens), [tokens]);
  // Draw order: plain tokens, then movable ones (so their hit areas win), then raised.
  const ordered = useMemo(() => {
    const rank = (key: string) => (raised.includes(key) ? 2 : states[key] === "movable" || states[key] === "selected" ? 1 : 0);
    return [...placements].sort((a, b) => rank(a.key) - rank(b.key));
  }, [placements, raised, states]);
  const baseLabels = useMemo(() => (youSeat === null ? {} : { [youSeat]: "You" }), [youSeat]);

  return (
    <svg viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`} role="group" aria-label={title} className="block h-auto w-full select-none" data-testid="game-board">
      <BoardSurface activeSeats={activeSeats} currentSeat={currentSeat} baseLabels={baseLabels} />
      {preview ? <MovePreviewPath preview={preview} /> : null}
      <g opacity={dimmed ? 0.85 : 1} style={{ transition: "opacity 220ms ease" }}>
        {ordered.map((p) => {
          const state: BoardTokenState = p.finished ? "finished" : (states[p.key] ?? "idle");
          const interactive = Boolean(onActivate) && (state === "movable" || state === "selected");
          return (
            <BoardToken
              key={p.key}
              testId={`token-${p.key}`}
              step={p.step}
              identity={identityOf(p.playerId)}
              x={p.x}
              y={p.y}
              size={p.size}
              state={state}
              motion={motion[p.key]}
              badge={badges[p.key] ?? null}
              count={p.stackSize >= 5 && p.stackIndex === p.stackSize - 1 ? p.stackSize : null}
              {...(labels[p.key] ? { label: labels[p.key] } : {})}
              {...(interactive && onActivate ? { onActivate: () => onActivate(p.key) } : {})}
              {...(interactive && onPreview ? { onPreview: (on: boolean) => onPreview(on ? p.key : null) } : {})}
            />
          );
        })}
      </g>
      {preview ? <DestinationMarker preview={preview} /> : null}
      {effects.map((e) => (
        <EffectMark key={e.id} effect={e} />
      ))}
    </svg>
  );
});
