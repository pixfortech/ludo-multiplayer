// Engine state → wire view. An explicit allow-list (new engine fields are not
// exposed until added here), and without the full history: only the most
// recent entries travel with each update; older ones are paged on request.

import type { GameState, HistoryEntry } from "@ludo/game-engine";
import { RECENT_HISTORY_ENTRIES, type GameActionType, type GameActionView, type GameHistoryEntry, type GameStateView } from "@ludo/shared-types";
import type { GameEventRecord } from "../persistence/types.js";

// Compile-time guarantee that engine history entries fit the wire contract.
const asWireEntry = (entry: HistoryEntry): GameHistoryEntry => entry;

export function projectGameState(state: GameState): GameStateView {
  return {
    stateVersion: state.stateVersion,
    phase: state.phase,
    settings: { autoMove: state.settings.autoMove, rankingMode: state.settings.rankingMode },
    players: state.players.map((p) => ({ id: p.id, seat: p.seat, finished: p.finished, tokens: p.tokens.map((t) => ({ id: t.id, step: t.step })) })),
    currentPlayerIndex: state.currentPlayerIndex,
    currentPlayerId: state.phase === "playing" ? (state.players[state.currentPlayerIndex]?.id ?? null) : null,
    turn: {
      phase: state.turn.phase,
      dice: state.turn.dice,
      consecutiveSixes: state.turn.consecutiveSixes,
      legalMoves: state.turn.legalMoves.map((m) => ({
        tokenId: m.tokenId,
        from: m.from,
        to: m.to,
        opens: m.opens,
        entersLane: m.entersLane,
        reachesHome: m.reachesHome,
        landsOnSafeCell: m.landsOnSafeCell,
        captures: m.captures.map((c) => ({ playerId: c.playerId, tokenId: c.tokenId })),
      })),
    },
    lastRoll: state.lastRoll ? { ...state.lastRoll } : null,
    lastAutoMove: state.lastAutoMove ? { ...state.lastAutoMove } : null,
    ranking: [...state.ranking],
    winnerId: state.winnerId,
    recentHistory: state.history.slice(-RECENT_HISTORY_ENTRIES).map((e) => structuredClone(asWireEntry(e))),
    historyLength: state.history.length,
  };
}

/** What the gameplay service stores in game_events.payload for each action. */
export interface ActionPayload {
  dice?: number;
  tokenId?: number;
  entries?: HistoryEntry[];
}

const ACTION_TYPES: readonly string[] = ["game:start", "game:roll", "game:move"];

export function toActionView(event: GameEventRecord): GameActionView {
  const payload = (event.payload ?? {}) as ActionPayload;
  return {
    seq: event.seq,
    type: (ACTION_TYPES.includes(event.actionType) ? event.actionType : "game:start") as GameActionType,
    playerId: event.playerId,
    stateVersion: event.resultStateVersion,
    at: event.createdAt.toISOString(),
    dice: typeof payload.dice === "number" ? payload.dice : null,
    tokenId: typeof payload.tokenId === "number" ? payload.tokenId : null,
    entries: Array.isArray(payload.entries) ? payload.entries.map((e) => structuredClone(asWireEntry(e))) : [],
  };
}
