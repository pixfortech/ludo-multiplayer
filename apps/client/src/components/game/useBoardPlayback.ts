// Presentation of authoritative game state over time (docs/design/motion.md).
//
// The server's state is always the destination: this hook only decides how
// the board travels there. When exactly one new action arrives (version
// n → n+1) it plays that action's history entries in order: die tumble and
// reveal, the auto-move pause, cell-by-cell hops along the layout path, the
// capture return and the home glide. Anything else (first load, refresh,
// reconnect, a missed version, a snapshot that jumps) snaps straight to the
// state, so nothing ever animates twice. A newer state cancels any running
// animation (fast-forward). Input waits until the reveal has finished.

import { useEffect, useRef, useState } from "react";
import { MOTION } from "@ludo/design-tokens";
import type { GameHistoryEntry, GameStateView } from "@ludo/shared-types";
import { hopSteps, piecePosition } from "../board/geometry";
import { tokenKey, type BoardTokenInput } from "../board/placement";
import type { BoardEffect } from "../board/TokenOverlay";

const D = MOTION.duration;
const OPEN_MS = 320;
const FAST_HOP_MS = 120;
const REDUCED_SLIDE_MS = 180;
const REDUCED_REVEAL_MS = 120;
const NO_MOVE_HOLD_MS = 600;

export interface DieView {
  value: number | null;
  rolling: boolean;
  /** Changes on every reveal (restarts the settle animation). */
  revealKey: number;
}

export interface Playback {
  /** The authoritative state the board currently shows (the previous one while an action plays). */
  game: GameStateView | null;
  tokens: BoardTokenInput[];
  moveMs: Record<string, number>;
  raised: string[];
  effects: BoardEffect[];
  die: DieView;
  /** An animation is running: controls stay disabled until it finishes. */
  busy: boolean;
  /** History entries up to this seq have been shown (the log never runs ahead of the board). */
  revealedSeq: number;
  /** The entries of the last revealed action (for the banner). */
  callouts: GameHistoryEntry[];
  calloutKey: number;
}

export function boardTokens(game: GameStateView): BoardTokenInput[] {
  return game.players.flatMap((p) => p.tokens.map((t) => ({ playerId: p.id, seat: p.seat, tokenId: t.id, step: t.step })));
}

const lastSeq = (game: GameStateView): number => game.recentHistory.reduce((max, e) => Math.max(max, e.seq), 0);
const dieValue = (game: GameStateView): number | null => game.turn.dice ?? game.lastRoll?.value ?? null;

function snapshot(game: GameStateView, previous?: Playback): Playback {
  return {
    game,
    tokens: boardTokens(game),
    moveMs: {},
    raised: [],
    effects: previous?.effects ?? [],
    die: { value: dieValue(game), rolling: false, revealKey: previous?.die.revealKey ?? 0 },
    busy: false,
    revealedSeq: lastSeq(game),
    callouts: previous?.callouts ?? [],
    calloutKey: previous?.calloutKey ?? 0,
  };
}

function withStep(view: Playback, key: string, step: number | null, ms: number): Playback {
  return {
    ...view,
    tokens: view.tokens.map((t) => (tokenKey(t.playerId, t.tokenId) === key ? { ...t, step } : t)),
    moveMs: { ...view.moveMs, [key]: ms },
    raised: [key],
  };
}

export function useBoardPlayback(game: GameStateView | null, reduced: boolean): Playback {
  const [view, setView] = useState<Playback>(() => (game ? snapshot(game) : emptyPlayback()));
  const shown = useRef<GameStateView | null>(game);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!game) return;
    const previous = shown.current;
    if (previous && previous.stateVersion === game.stateVersion) return; // the same state again (e.g. a refresh): nothing to play
    shown.current = game;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    if (!previous || game.stateVersion !== previous.stateVersion + 1) {
      setView((v) => snapshot(game, v));
      return;
    }
    const entries = game.recentHistory.filter((e) => e.seq > lastSeq(previous));
    const seatOf = new Map(game.players.map((p) => [p.id, p.seat]));
    let t = 0;
    const at = (delay: number, update: (v: Playback) => Playback) => timers.current.push(setTimeout(() => setView(update), delay));

    // Start from the previous authoritative position (fast-forwarding anything still running).
    setView((v) => ({ ...snapshot(previous, v), busy: true, revealedSeq: lastSeq(previous) }));

    const roll = entries.find((e) => e.type === "roll");
    if (roll && roll.type === "roll") {
      setView((v) => ({ ...v, die: { ...v.die, rolling: true } }));
      t += reduced ? 0 : D.diceRoll;
      at(t, (v) => ({ ...v, die: { value: roll.value, rolling: false, revealKey: v.die.revealKey + 1 } }));
      t += reduced ? REDUCED_REVEAL_MS : D.diceReveal;
      if (entries.some((e) => e.type === "auto-move")) t += D.autoMovePause;
      if (entries.some((e) => e.type === "auto-pass" || e.type === "forfeit")) {
        at(t, (v) => ({ ...v, callouts: entries, calloutKey: v.calloutKey + 1 }));
        t += NO_MOVE_HOLD_MS;
      }
    }

    for (const entry of entries) {
      if (entry.type === "move" || entry.type === "auto-move") {
        const key = tokenKey(entry.playerId, entry.tokenId);
        const hops = reduced ? [entry.to] : hopSteps(entry.from, entry.to);
        hops.forEach((step, i) => {
          const ms = reduced ? REDUCED_SLIDE_MS : entry.from === null ? OPEN_MS : step === 56 ? D.homeEntry : hops.length > 8 && i >= 4 ? FAST_HOP_MS : D.hopPerCell;
          at(t, (v) => withStep(v, key, step, ms));
          t += ms;
        });
      } else if (entry.type === "capture") {
        const victim = tokenKey(entry.victimPlayerId, entry.victimTokenId);
        const attackerSeat = seatOf.get(entry.playerId) ?? 0;
        const mover = entries.find((e) => (e.type === "move" || e.type === "auto-move") && e.playerId === entry.playerId && e.tokenId === entry.tokenId);
        const where = piecePosition(attackerSeat, mover && (mover.type === "move" || mover.type === "auto-move") ? mover.to : null);
        const effect: BoardEffect = { id: `capture-${entry.seq}`, kind: "capture", at: where, seat: seatOf.get(entry.victimPlayerId) ?? 0 };
        const ms = reduced ? REDUCED_REVEAL_MS : D.capture;
        at(t, (v) => ({ ...withStep(v, victim, null, ms), effects: [...v.effects, effect] }));
        t += ms;
      } else if (entry.type === "home") {
        const seat = seatOf.get(entry.playerId) ?? 0;
        const effect: BoardEffect = { id: `home-${entry.seq}`, kind: "home", at: piecePosition(seat, 56), seat };
        at(t, (v) => ({ ...v, effects: [...v.effects, effect] }));
      }
    }

    at(t, (v) => ({ ...snapshot(game, v), callouts: entries, calloutKey: v.calloutKey + 1 }));
    at(t + 700, (v) => ({ ...v, effects: [] }));
  }, [game, reduced]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return view;
}

function emptyPlayback(): Playback {
  return { game: null, tokens: [], moveMs: {}, raised: [], effects: [], die: { value: null, rolling: false, revealKey: 0 }, busy: false, revealedSeq: 0, callouts: [], calloutKey: 0 };
}
