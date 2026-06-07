import { Card } from "./ui";

interface Props {
  // Face value to show: the actionable diceValue, or the last rolled value when
  // no move is pending. Null only before any roll has happened in the game.
  displayValue: number | null;
  // True when there is an actionable dice for the current turn (a move is awaited).
  pending: boolean;
  canRoll: boolean;
  isMyTurn: boolean;
  rolling: boolean; // local animation while awaiting the server result
  isSix: boolean;   // server result was a 6 (bonus turn pending a move)
  currentName: string; // current player's display label (for "Waiting for …")
  lastAction: string | null;
  onRoll: () => void;
}

// Classic pip layout on a 3×3 grid (indices 0–8, reading left→right, top→bottom).
const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * One consistent dice face. Only real pips are ever lit; while `rolling` the face
 * is blanked (no fake values). A blank face means "no value to show" — never a
 * stand-in for 1.
 */
function DiceFace({ value, rolling }: { value: number | null; rolling: boolean }) {
  const lit = !rolling && value !== null ? PIP_MAP[value] ?? [] : [];

  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-0.5 p-2.5">
      {Array.from({ length: 9 }).map((_, i) => {
        const on = lit.includes(i);
        return (
          <span key={i} className="flex items-center justify-center">
            <span
              className={`h-2.5 w-2.5 rounded-full transition-opacity ${
                on ? "bg-slate-900" : "bg-transparent"
              }`}
            />
          </span>
        );
      })}
    </div>
  );
}

export default function Dice({
  displayValue,
  pending,
  canRoll,
  isMyTurn,
  rolling,
  isSix,
  currentName,
  lastAction,
  onRoll,
}: Props) {
  // Same tile in every state; only animation/glow classes are layered on.
  const tileBase =
    "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-xl transition-all select-none sm:h-20 sm:w-20";
  const tileClass = rolling
    ? `${tileBase} bg-white animate-shake scale-105`
    : isSix
      ? `${tileBase} bg-white ring-4 ring-amber-400 animate-six-throb scale-105`
      : `${tileBase} bg-white`;

  // Primary status line — always tells the player what state we're in.
  const headerText = rolling
    ? "Rolling…"
    : isSix
      ? "Six! Move a token, then roll again."
      : pending
        ? isMyTurn
          ? "Your move"
          : `${currentName} is moving`
        : isMyTurn
          ? "Your roll"
          : `Waiting for ${currentName}`;

  const isTurnPass =
    !!lastAction &&
    (lastAction.includes("turn passes") || lastAction.includes("turn forfeited"));
  const actionColour = isSix
    ? "text-amber-300 font-semibold"
    : isTurnPass
      ? "text-sky-300 font-semibold"
      : "text-slate-400";

  const showBadge = !rolling && displayValue !== null;
  // The shown number is purely historical (a completed roll, no pending move).
  const showLastRollTag = showBadge && !pending;
  const badgeClass = isSix
    ? "bg-amber-500 ring-2 ring-amber-300"
    : pending
      ? "bg-indigo-500"
      : "bg-slate-500"; // muted = last roll / history, not actionable

  return (
    <Card className="flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-4 lg:items-center lg:p-5">
      <span className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
        {headerText}
      </span>

      {/* Row on mobile (tile beside the action so the button is always visible);
          stacked in the desktop sidebar where vertical room is plentiful. */}
      <div className="flex items-center gap-4 lg:w-full lg:flex-col lg:gap-3">
        <div className="flex flex-col items-center gap-1">
          <div className={tileClass} aria-label={displayValue ? `Dice showing ${displayValue}` : "Dice"}>
            <DiceFace value={displayValue} rolling={rolling} />

            {/* Result number badge — same tile stays fixed underneath. */}
            {showBadge && (
              <span
                className={`absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold text-white shadow-md ${badgeClass}`}
              >
                {displayValue}
              </span>
            )}
          </div>
          {showLastRollTag && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Last roll
            </span>
          )}
        </div>

        <button
          className="flex-1 rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 lg:w-full lg:flex-none"
          disabled={!canRoll || rolling}
          onClick={onRoll}
        >
          {rolling ? "Rolling…" : canRoll ? "Roll dice" : isMyTurn ? "Move a token" : "Waiting…"}
        </button>
      </div>

      {lastAction && (
        <p className={`min-h-[1rem] text-center text-xs leading-snug ${actionColour}`}>
          {lastAction}
        </p>
      )}
    </Card>
  );
}
