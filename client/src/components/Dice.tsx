import { Card } from "./ui";

interface Props {
  value: number | null;
  canRoll: boolean;
  isMyTurn: boolean;
  lastAction: string | null;
  onRoll: () => void;
}

const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function Dice({ value, canRoll, isMyTurn, lastAction, onRoll }: Props) {
  return (
    <Card className="flex flex-col items-center gap-3 p-5">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        {isMyTurn ? "Your move" : "Dice"}
      </span>

      <div
        className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-6xl text-slate-900 shadow-xl transition-transform ${
          canRoll ? "animate-pulse" : ""
        }`}
      >
        {value !== null ? FACES[value - 1] : "🎲"}
      </div>

      <button
        className="w-full rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        disabled={!canRoll}
        onClick={onRoll}
      >
        {canRoll ? "Roll dice" : isMyTurn ? "Move a token" : "Waiting…"}
      </button>

      {lastAction && (
        <p className="min-h-[1rem] text-center text-xs leading-snug text-slate-400">
          {lastAction}
        </p>
      )}
    </Card>
  );
}
