import { useState, useEffect, useRef } from "react";
import { Card } from "./ui";

interface Props {
  value: number | null;
  canRoll: boolean;
  isMyTurn: boolean;
  rolling: boolean; // true while local animation is running before server responds
  isSix: boolean;   // true immediately after rolling 6 (before moving)
  lastAction: string | null;
  onRoll: () => void;
}

const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] as const;

function randomFace(): string {
  return FACES[Math.floor(Math.random() * 6)];
}

export default function Dice({ value, canRoll, isMyTurn, rolling, isSix, lastAction, onRoll }: Props) {
  const [displayFace, setDisplayFace] = useState<string>(value !== null ? FACES[value - 1] : "🎲");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // While rolling: cycle random faces; when done, lock to the real server value.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rolling) {
      timerRef.current = setInterval(() => setDisplayFace(randomFace()), 75);
    } else {
      setDisplayFace(value !== null ? FACES[value - 1] : "🎲");
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [rolling, value]);

  // Classify the lastAction text for colour-coded display.
  const isTurnPass = !!lastAction && (lastAction.includes("turn passes") || lastAction.includes("turn forfeited"));
  const actionColour = isSix
    ? "text-amber-300 font-semibold"
    : isTurnPass
      ? "text-sky-300 font-semibold"
      : "text-slate-400";

  const diceBase =
    "flex h-20 w-20 items-center justify-center rounded-2xl text-6xl shadow-xl transition-all select-none";
  const diceClass = rolling
    ? `${diceBase} animate-shake bg-white text-slate-900 scale-105`
    : isSix
      ? `${diceBase} bg-amber-400 text-slate-900 animate-six-throb scale-105`
      : `${diceBase} bg-white text-slate-900`;

  return (
    <Card className="flex flex-col items-center gap-3 p-5">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        {isMyTurn ? (isSix ? "Six! Roll again after moving" : "Your move") : "Dice"}
      </span>

      <div className={diceClass} aria-label={`Dice showing ${displayFace}`}>
        {displayFace}
      </div>

      <button
        className="w-full rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        disabled={!canRoll || rolling}
        onClick={onRoll}
      >
        {rolling
          ? "Rolling…"
          : canRoll
            ? "Roll dice"
            : isMyTurn
              ? "Move a token"
              : "Waiting…"}
      </button>

      {lastAction && (
        <p className={`min-h-[1rem] text-center text-xs leading-snug ${actionColour}`}>
          {lastAction}
        </p>
      )}
    </Card>
  );
}
