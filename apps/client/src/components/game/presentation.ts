// Presentation events: what the board shows happening, in the order the
// playback shows it (C.3C.1). They come only from the server's committed
// history, played live (never from a refresh, a reconnect or a skipped
// version, so nothing is ever presented twice), and they never change game
// state.
//
// Two consumers:
//  - cues: time-stamped, short-lived moments the human characters react to
//    (a six, a capture, a teammate home, a win...). The board reads them from
//    the playback; each has a fixed duration, so a reaction always ends.
//  - hooks: the same moments (and the die's throw and landing) as events for
//    sound and dialogue. Nothing plays sound yet (the multilingual audio
//    system is the next phase): `onPresentationEvent` is where it will
//    connect, and `dialogueLine` names the line a character would say.

/** Moments the characters react to. */
export type CueKind = "six" | "forfeit" | "no-move" | "capture" | "bonus" | "home" | "finished" | "win";

export interface PresentationCue {
  /** Unique, increasing. */
  id: number;
  kind: CueKind;
  playerId: string;
  seat: number;
  /** Tokens it is about (`playerId:tokenId`): the mover for a capture or a home entry. */
  tokens: string[];
  /** When it was shown (performance.now()). */
  at: number;
  /** How long the reaction lasts (ms). */
  ms: number;
}

/** How long each reaction lasts (ms): short, so play never waits on them. */
export const CUE_MS: Readonly<Record<CueKind, number>> = {
  six: 1400,
  forfeit: 1600,
  "no-move": 1200,
  capture: 1500,
  bonus: 1200,
  home: 1500,
  finished: 2200,
  win: 3200,
};

export type PresentationEvent =
  | { type: "die-throw"; playerId: string; seat: number }
  | { type: "die-land"; playerId: string; seat: number; value: number }
  | { type: "cue"; cue: Omit<PresentationCue, "at"> }
  | { type: "token-move"; playerId: string; tokenId: number; from: number | null; to: number }
  | { type: "victory-screen"; playerId: string | null };

type Listener = (event: PresentationEvent) => void;
const listeners = new Set<Listener>();

/** Subscribes to presentation events (sound, dialogue, subtitles; the hidden log tests read). Returns an unsubscribe. */
export function onPresentationEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitPresentationEvent(event: PresentationEvent): void {
  for (const l of [...listeners]) {
    try {
      l(event);
    } catch {
      // A failing listener (a future sound player) must never break the board's playback.
    }
  }
}

/**
 * The id of the line a character says for a moment, for the dialogue system to come
 * (Bengali voice, English subtitles). Ids only: no text or audio exists yet.
 */
export function dialogueLine(kind: CueKind, characterKey: string, variant = 0): string {
  return `${kind}.${characterKey}.${variant}`;
}
