// Whose turn it is, what they are doing, and one banner for the action just
// shown. The banner has a single visual language: an icon and words for
// every kind (never colour alone), gold for good fortune (six, home,
// finishing, winning), the capturing player's colour for a capture, a soft
// warning for a forfeit, neutral for a pass. The full sentence is announced
// to screen readers once, in the live region.
import type { ReactNode } from "react";
import type { PlayerIdentity } from "@ludo/design-tokens";
import type { TurnEvent } from "../../lib/gameText";
import { tint } from "../board/surfaceShared";
import { AlertIcon, ArrowRightIcon, CrownIcon, HomeIcon, SparkIcon, StarIcon, TargetIcon } from "../ui/Icons";
import { PlayerToken } from "./PlayerToken";

export interface TurnInfo {
  identity: PlayerIdentity | null;
  title: string;
  detail: string;
  next: string | null;
  event: TurnEvent | null;
  /** The colours of the player the event belongs to. */
  eventIdentity: PlayerIdentity | null;
  eventKey: number;
  mine: boolean;
}

const GOLD = { background: "#FFF6DC", borderColor: "#E3B341", color: "#5B4300" };
const ICONS: Record<TurnEvent["kind"], ReactNode> = {
  win: <CrownIcon size={16} />,
  finished: <CrownIcon size={16} />,
  home: <HomeIcon size={16} />,
  six: <StarIcon size={16} />,
  capture: <TargetIcon size={16} />,
  forfeit: <AlertIcon size={16} />,
  pass: <ArrowRightIcon size={16} />,
  auto: <SparkIcon size={16} />,
};

function bannerStyle(event: TurnEvent, identity: PlayerIdentity | null) {
  switch (event.kind) {
    case "win":
    case "finished":
    case "home":
    case "six":
      return GOLD;
    case "capture":
      return identity ? { background: tint(identity.body, 0.86), borderColor: identity.rim, color: "#141821" } : GOLD;
    case "forfeit":
      return { background: "#FFF5F6", borderColor: "#F5C6CD", color: "#A30D25" };
    default:
      return { background: "#F1EEE8", borderColor: "#E2DCD1", color: "#141821" };
  }
}

export function TurnBanner({ event, identity, eventKey }: { event: TurnEvent; identity: PlayerIdentity | null; eventKey: number }) {
  return (
    <div key={eventKey} className="flex animate-fade-up items-start gap-2 rounded-[var(--radius-control)] border px-2.5 py-1.5" style={bannerStyle(event, identity)} data-testid="turn-callouts" data-kind={event.kind}>
      <span className="mt-[1px] shrink-0" aria-hidden="true">
        {ICONS[event.kind]}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-tight">{event.title}</span>
        {event.detail ? <span className="block text-[12px] leading-tight opacity-80">{event.detail}</span> : null}
      </span>
    </div>
  );
}

export function TurnIndicator({ turn, compact = false }: { turn: TurnInfo; compact?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="turn-indicator">
      <div className="flex min-w-0 items-center gap-2.5">
        {turn.identity ? <PlayerToken identity={turn.identity} size={compact ? 28 : 34} shadow={false} /> : null}
        <div className="min-w-0" aria-live="polite">
          <p className={`truncate font-display font-semibold tracking-[-0.01em] text-ink ${compact ? "text-[17px]" : "text-[20px]"}`}>{turn.title}</p>
          <p className="truncate text-[13px] text-ink-muted">{turn.detail}</p>
        </div>
      </div>
      {turn.event ? <TurnBanner event={turn.event} identity={turn.eventIdentity} eventKey={turn.eventKey} /> : null}
      {/* One announcement per event, as a full sentence. */}
      <p className="sr-only" aria-live="polite">
        {turn.event ? turn.event.spoken : ""}
      </p>
      {!compact && turn.next ? <p className="text-[12px] text-ink-muted">Next: {turn.next}</p> : null}
    </div>
  );
}
