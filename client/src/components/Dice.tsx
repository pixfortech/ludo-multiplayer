interface Props {
  value: number | null;
  canRoll: boolean;
  onRoll: () => void;
}

const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function Dice({ value, canRoll, onRoll }: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-6xl">{value !== null ? FACES[value - 1] : "🎲"}</div>
      <button
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
        disabled={!canRoll}
        onClick={onRoll}
      >
        Roll Dice
      </button>
    </div>
  );
}
