// The move log: the server's recent history in words, newest first. It never
// runs ahead of the board (entries appear once their animation is shown).
import type { GameHistoryEntry } from "@ludo/shared-types";
import { describeEntry, type NameOf } from "../../lib/gameText";

export function GameActionFeed({ entries, revealedSeq, nameOf, limit = 12 }: { entries: readonly GameHistoryEntry[]; revealedSeq: number; nameOf: NameOf; limit?: number }) {
  const lines = entries
    .filter((e) => e.seq <= revealedSeq)
    .map((e) => ({ seq: e.seq, text: describeEntry(e, nameOf) }))
    .filter((l): l is { seq: number; text: string } => l.text !== null)
    .reverse()
    .slice(0, limit);
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Moves</h2>
      {lines.length ? (
        <ol className="flex min-h-0 flex-col gap-1 overflow-y-auto" role="log" aria-label="Move log" data-testid="move-log">
          {lines.map((l, i) => (
            <li key={l.seq} className={`text-[13px] ${i === 0 ? "font-semibold text-ink" : "text-ink-muted"}`}>
              {l.text}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-ink-muted">Moves appear here as the game goes on.</p>
      )}
    </div>
  );
}
