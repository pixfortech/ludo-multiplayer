import { PLAYER_COUNTS } from "@ludo/shared-types";
import { boardShapeFor } from "@ludo/board-layouts";

// Phase 0 placeholder shell. The lobby, rooms and board renderers replace this
// screen from Phase 3 onwards.
export default function App() {
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-10 px-4 py-16 sm:px-8">
      <header className="flex flex-col gap-3">
        <span className="text-sm font-medium uppercase tracking-[0.2em] text-ink-muted">
          Rebuilding from the ground up
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Ludo</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          Classic Ludo for 2–4 players, and expanded polygon boards for up to 15 — on one screen or
          across devices.
        </p>
      </header>

      <section aria-labelledby="boards-heading" className="flex flex-col gap-4">
        <h2 id="boards-heading" className="text-sm font-medium text-ink-muted">
          Board shapes
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLAYER_COUNTS.map((count) => (
            <li
              key={count}
              className="flex items-baseline justify-between rounded-lg bg-surface-raised px-3 py-2"
            >
              <span className="text-lg font-semibold tabular-nums">{count}</span>
              <span className="text-sm capitalize text-ink-muted">{boardShapeFor(count)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
