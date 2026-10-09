// Whose turn it is, what they are doing, and the banner for the action just
// shown ("Six: roll again", "No moves: passing turn", …). aria-live so
// screen readers hear turn changes and banners.
import type { PlayerIdentity } from "@ludo/design-tokens";
import { PlayerToken } from "./PlayerToken";

export interface TurnInfo {
  identity: PlayerIdentity | null;
  title: string;
  detail: string;
  next: string | null;
  callouts: string[];
  calloutKey: number;
  mine: boolean;
}

export function TurnIndicator({ turn, compact = false }: { turn: TurnInfo; compact?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" aria-live="polite" data-testid="turn-indicator">
      <div className="flex min-w-0 items-center gap-2.5">
        {turn.identity ? <PlayerToken identity={turn.identity} size={compact ? 28 : 34} shadow={false} /> : null}
        <div className="min-w-0">
          <p className={`truncate font-display font-semibold tracking-[-0.01em] text-ink ${compact ? "text-[17px]" : "text-[20px]"}`}>{turn.title}</p>
          <p className="truncate text-[13px] text-ink-muted">{turn.detail}</p>
        </div>
      </div>
      {turn.callouts.length ? (
        <div key={turn.calloutKey} className="flex animate-fade-up flex-wrap gap-1.5" data-testid="turn-callouts">
          {turn.callouts.map((c) => (
            <span key={c} className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-white">
              {c}
            </span>
          ))}
        </div>
      ) : null}
      {!compact && turn.next ? <p className="text-[12px] text-ink-muted">Next: {turn.next}</p> : null}
    </div>
  );
}
