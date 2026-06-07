import type { Player } from "../types";
import { Badge, StatusDot } from "./ui";
import { colorTokens, COLOR_LABEL } from "../theme";

interface Props {
  player: Player;
  isActive: boolean;
  isMe: boolean;
  isHost?: boolean;
}

export default function PlayerPanel({ player, isActive, isMe, isHost = false }: Props) {
  const c = colorTokens(player.color);
  const homeCount = player.tokens.filter((t) => t.state === "home").length;
  const activeCount = player.tokens.filter((t) => t.state === "active").length;
  const baseCount = player.tokens.filter((t) => t.state === "base").length;

  return (
    <div
      className={`rounded-2xl border px-3.5 py-3 transition-all ${c.soft} ${
        isActive
          ? `${c.border} ring-2 ${c.ring} shadow-lg ${c.glow}`
          : "border-white/10 opacity-80"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`h-7 w-7 shrink-0 rounded-full ${c.solid} shadow ${c.glow}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">
              {COLOR_LABEL[player.color]}
            </span>
            {isMe && <span className="text-[11px] text-slate-400">(you)</span>}
            {isHost && <Badge className="bg-amber-400/20 text-amber-200">★</Badge>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
            <StatusDot connected={player.connected} />
            {isActive ? (
              <span className={`font-semibold ${c.text}`}>Their turn</span>
            ) : (
              <span>{player.connected ? "Ready" : "Offline"}</span>
            )}
          </div>
        </div>
      </div>

      {/* Token progress */}
      <div className="mt-2.5 flex gap-1.5 text-[10px] font-semibold">
        <span className="flex-1 rounded-lg bg-black/20 px-2 py-1 text-center text-slate-300">
          🏠 {homeCount}
        </span>
        <span className="flex-1 rounded-lg bg-black/20 px-2 py-1 text-center text-slate-300">
          ▶ {activeCount}
        </span>
        <span className="flex-1 rounded-lg bg-black/20 px-2 py-1 text-center text-slate-300">
          ◌ {baseCount}
        </span>
      </div>
    </div>
  );
}
