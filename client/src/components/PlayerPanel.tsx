import type { Player } from "../types";

const COLOR_BG: Record<string, string> = {
  red: "border-red-500",
  blue: "border-blue-500",
  green: "border-green-500",
  yellow: "border-yellow-400",
};

interface Props {
  player: Player;
  isActive: boolean;
  isMe: boolean;
}

export default function PlayerPanel({ player, isActive, isMe }: Props) {
  const homeCount = player.tokens.filter((t) => t.state === "home").length;
  const baseCount = player.tokens.filter((t) => t.state === "base").length;

  return (
    <div
      className={`border-2 ${COLOR_BG[player.color]} rounded-lg p-3 ${
        isActive ? "shadow-lg shadow-white/20" : "opacity-70"
      }`}
    >
      <div className="flex justify-between items-center">
        <span className="font-semibold capitalize">
          {player.color} {isMe ? "(you)" : ""}
        </span>
        {isActive && <span className="text-xs text-yellow-300">Your turn</span>}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        Base: {baseCount} | Home: {homeCount}
      </div>
    </div>
  );
}
