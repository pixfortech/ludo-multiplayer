// The end-of-game summary, computed only from authoritative data: the room's
// action log (game:getHistory) and the final game state. Nothing is
// estimated: a figure that cannot be derived is left out.

import type { GameActionView, GameStateView } from "@ludo/shared-types";

export interface PlayerSummary {
  playerId: string;
  /** Place in the final ranking (null when the mode does not rank everyone). */
  place: number | null;
  home: number;
  captures: number;
  /** Own tokens sent back to base by others. */
  lostTokens: number;
  rolls: number;
  sixes: number;
}

export interface GameSummary {
  /** From the first committed action (the start) to the last; null without timestamps. */
  durationMs: number | null;
  /** Turns played: every hand-over of the turn, plus the first. */
  turns: number;
  rolls: number;
  captures: number;
  tokensHome: number;
  players: PlayerSummary[];
}

export function summarise(actions: readonly GameActionView[], game: GameStateView): GameSummary {
  const entries = actions.flatMap((a) => a.entries);
  const times = actions.map((a) => Date.parse(a.at)).filter((t) => Number.isFinite(t));
  const count = (pred: (e: (typeof entries)[number]) => boolean) => entries.filter(pred).length;
  const players = game.players.map((p): PlayerSummary => {
    const place = game.ranking.indexOf(p.id);
    return {
      playerId: p.id,
      place: place >= 0 ? place + 1 : null,
      home: p.tokens.filter((t) => t.step === 56).length,
      captures: count((e) => e.type === "capture" && e.playerId === p.id),
      lostTokens: count((e) => e.type === "capture" && e.victimPlayerId === p.id),
      rolls: count((e) => e.type === "roll" && e.playerId === p.id),
      sixes: count((e) => e.type === "roll" && e.playerId === p.id && e.value === 6),
    };
  });
  return {
    durationMs: times.length >= 2 ? Math.max(...times) - Math.min(...times) : null,
    turns: count((e) => e.type === "turn") + 1,
    rolls: count((e) => e.type === "roll"),
    captures: count((e) => e.type === "capture"),
    tokensHome: players.reduce((n, p) => n + p.home, 0),
    players,
  };
}

/** "12 min", "1 h 05 min", "45 s". */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
