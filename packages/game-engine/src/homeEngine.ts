// Finishing, ranking and the end of the game.

import { isHome, topologyOf } from "./board.js";
import { record } from "./history.js";
import type { GameState, PlayerState } from "./types.js";

/** Marks the player finished (all four tokens home). Returns true if this happened just now. */
export function markFinishedIfComplete(draft: GameState, player: PlayerState): boolean {
  const topology = topologyOf(draft);
  if (player.finished || !player.tokens.every((t) => isHome(topology, t.step))) return false;
  player.finished = true;
  draft.ranking.push(player.id);
  record(draft, { type: "player-finished", playerId: player.id, place: draft.ranking.length });
  if (draft.winnerId === null) {
    draft.winnerId = player.id;
    record(draft, { type: "win", playerId: player.id });
  }
  return true;
}

/** Ends the game when the ranking mode says so. Returns true if the game is now over. */
export function resolveGameEnd(draft: GameState): boolean {
  const remaining = draft.players.filter((p) => !p.finished);
  const over = draft.settings.rankingMode === "winner-only" ? draft.winnerId !== null : remaining.length <= 1;
  if (!over) return false;
  if (draft.settings.rankingMode === "full-ranking") {
    for (const p of remaining) draft.ranking.push(p.id); // last place is decided by elimination
  }
  draft.phase = "finished";
  draft.turn = { phase: "awaiting-roll", dice: null, consecutiveSixes: 0, legalMoves: [] };
  record(draft, { type: "game-over", ranking: [...draft.ranking] });
  return true;
}
