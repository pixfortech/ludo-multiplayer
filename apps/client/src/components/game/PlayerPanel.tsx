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
}

function HomeDots({ home, identity }: { home: number; identity: PlayerIdentity }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${home} of 4 tokens home`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < home ? identity.body : "#E2DCD1" }} />
      ))}
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
          className="flex min-h-[60px] items-center gap-3 rounded-[var(--radius-card)] border-2 bg-surface px-3 py-2 transition-[border-color,box-shadow] duration-200"
          style={{ borderColor: p.current ? p.identity.rim : "transparent", boxShadow: p.current ? `0 0 0 4px ${p.identity.body}22` : "0 1px 2px rgba(20,24,33,0.06)" }}
        >
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
              <HomeDots home={p.home} identity={p.identity} />
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
          className="flex min-h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-full border-2 bg-surface py-1 pl-1 pr-2.5 transition-[border-color] duration-200"
          style={{ borderColor: p.current ? p.identity.rim : "#E2DCD1" }}
        >
          <span className="relative">
            <PlayerToken identity={p.identity} size={p.current ? 30 : 24} shadow={false} />
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${p.connected ? "bg-success" : "bg-[#b9b2a6]"}`} />
          </span>
          <span className={`max-w-[88px] truncate text-[13px] font-semibold ${p.current ? "text-ink" : "text-ink-muted"}`}>{p.isYou ? "You" : p.name}</span>
          <span className="tabular text-[12px] font-semibold text-ink-muted" aria-label={`${p.home} of 4 home`}>
            {p.home}/4
          </span>
        </li>
      ))}
    </ul>
  );
}
