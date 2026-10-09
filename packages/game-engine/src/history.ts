import type { GameState, HistoryEntry, NewHistoryEntry } from "./types.js";

/** Appends an authoritative history entry (mutates a draft state owned by the engine). */
export function record(draft: GameState, entry: NewHistoryEntry): void {
  draft.history.push({ ...entry, seq: draft.history.length + 1 } as HistoryEntry);
}
