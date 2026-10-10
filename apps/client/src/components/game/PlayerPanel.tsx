// Players in turn order: token, name, home counter and connection. The
// current player's chip carries a seat-colour outline (no layout shift).
import type { PlayerIdentity } from "@ludo/design-tokens";
import { ordinal } from "../../lib/gameText";
import { CrownIcon } from "../ui/Icons";
import { PlayerToken } from "./PlayerToken";

export interface GamePlayerRow {
  playerId: string;
  name: string;
  identity: PlayerIdentity;
  seat: number;
  isYou: boolean;
  isHost: boolean;
  connected: boolean;
  home: number;
  current: boolean;
  place: number | null;
  /** A live highlight on this player (a capture, a token home); `key` restarts it. */
  flash: { kind: "capture" | "home"; key: number } | null;
}

/** A brief sweep of the seat's colour across a player's chip (presentation only). */
function Sweep({ flash, identity }: { flash: GamePlayerRow["flash"]; identity: PlayerIdentity }) {
  if (!flash) return null;
  const colour = flash.kind === "home" ? "#E3B341" : identity.body;
  return <span key={flash.key} aria-hidden="true" className="seat-sweep pointer-events-none absolute inset-y-0 left-0 w-full" style={{ background: `linear-gradient(90deg, transparent, ${colour}55 45%, ${colour}77 50%, ${colour}55 55%, transparent)` }} data-testid="seat-sweep" />;
}

function HomeDots({ home, identity, flash, playerId }: { home: number; identity: PlayerIdentity; flash: GamePlayerRow["flash"]; playerId: string }) {
  const pop = flash?.kind === "home";
  return (
    <span className="flex items-center gap-1.5" aria-label={`${home} of 4 tokens home`} data-testid="home-count" data-home={home} data-player={playerId}>
      <span className="flex items-center gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < home ? identity.body : "#E2DCD1", boxShadow: i < home ? `inset 0 0 0 1px ${identity.rim}` : "none" }} />
        ))}
      </span>
      <span key={pop ? flash.key : "still"} className={`tabular inline-block text-[11px] font-bold text-ink-muted ${pop ? "count-pop" : ""}`}>
        {home}/4
      </span>
    </span>
  );
}

export function PlayerPanel({ players }: { players: readonly GamePlayerRow[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Players">
      {players.map((p) => (
        <li
          key={p.playerId}
          aria-current={p.current ? "true" : undefined}
          className="relative flex min-h-[60px] items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border-2 bg-surface px-3 py-2 transition-[border-color,box-shadow] duration-200"
          style={{ borderColor: p.current ? p.identity.rim : "transparent", boxShadow: p.current ? `0 0 0 4px ${p.identity.body}22` : "0 1px 2px rgba(20,24,33,0.06)" }}
        >
          <Sweep flash={p.flash} identity={p.identity} />
          <span className="relative">
            <PlayerToken identity={p.identity} size={36} shadow={false} />
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${p.connected ? "bg-success" : "bg-[#b9b2a6]"}`} title={p.connected ? "Online" : "Away"} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold text-ink">{p.name}</span>
              {p.isYou ? <span className="rounded-full bg-[#eaf1fd] px-1.5 text-[11px] font-bold text-accent">You</span> : null}
              {p.isHost ? <CrownIcon size={13} className="shrink-0 text-[#a77b0e]" aria-label="Host" /> : null}
            </span>
            <span className="flex items-center gap-2 text-[12px] text-ink-muted">
              <HomeDots home={p.home} identity={p.identity} flash={p.flash} playerId={p.playerId} />
              {p.place ? <span className="font-semibold text-ink">{ordinal(p.place)}</span> : p.connected ? null : <span>Away</span>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Phone and tablet-portrait strip: compact chips, the current player enlarged. */
export function PlayerStrip({ players }: { players: readonly GamePlayerRow[] }) {
  return (
    <ul className="flex min-w-0 items-center gap-2 overflow-x-auto" aria-label="Players">
      {players.map((p) => (
        <li
          key={p.playerId}
          aria-current={p.current ? "true" : undefined}
          className="relative flex min-h-11 min-w-0 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border-2 bg-surface py-1 pl-1 pr-2.5 transition-[border-color] duration-200"
          style={{ borderColor: p.current ? p.identity.rim : "#E2DCD1" }}
        >
          <Sweep flash={p.flash} identity={p.identity} />
          <span className="relative">
            <PlayerToken identity={p.identity} size={p.current ? 30 : 24} shadow={false} />
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${p.connected ? "bg-success" : "bg-[#b9b2a6]"}`} />
          </span>
          <span className={`max-w-[88px] truncate text-[13px] font-semibold ${p.current ? "text-ink" : "text-ink-muted"}`}>{p.isYou ? "You" : p.name}</span>
          <span key={p.flash?.kind === "home" ? p.flash.key : "still"} className={`tabular inline-block text-[12px] font-semibold text-ink-muted ${p.flash?.kind === "home" ? "count-pop" : ""}`} aria-label={`${p.home} of 4 home`} data-testid="home-count" data-home={p.home} data-player={p.playerId}>
            {p.home}/4
          </span>
        </li>
      ))}
    </ul>
  );
}
