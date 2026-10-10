// Presentation of authoritative game state over time (docs/design/motion.md).
//
// The server's state is always the destination: this hook only decides how
// the board travels there. When exactly one new action arrives (version
// n → n+1) it plays that action's history entries in order: die tumble and
// reveal, the auto-move pause, cell-by-cell hops along the layout path, the
// capture return and the home glide. Anything else (first load, refresh,
// reconnect, a missed version, a snapshot that jumps) snaps straight to the
// state, so nothing ever animates twice. A newer state cancels any running
// animation (fast-forward), and so does a pause. Input waits until the reveal
// has finished. Each token change carries a typed motion (hop, land, open,
// home, capture, slide) that the board token turns into transform-only
// animation; a change without a motion is a jump.
//
// Captures in one move play together, right after the attacker settles: a
// short impact, then every captured token lifts, shrinks and arcs back to its
// base (lightly staggered). Home counters advance only when a token actually
// arrives home. A finished game raises a celebration only when its last
// action is seen live: a refresh or reconnect never replays one.

import { useEffect, useRef, useState } from "react";
import { MOTION } from "@ludo/design-tokens";
import type { GameHistoryEntry, GameStateView } from "@ludo/shared-types";
import { hopSteps, piecePosition } from "../board/geometry";
import { tokenKey, type BoardTokenInput } from "../board/placement";
import type { BoardEffect } from "../board/TokenOverlay";
import { CAPTURE_IMPACT_MS } from "../board/tokenMotion";

const D = MOTION.duration;
const OPEN_MS = 320;
const FAST_HOP_MS = 120;
const REDUCED_SLIDE_MS = 180;
const REDUCED_REVEAL_MS = 120;
const NO_MOVE_HOLD_MS = 600;
/** Stagger between tokens captured together. */
const CAPTURE_STAGGER_MS = 60;

export interface DieView {
  value: number | null;
  rolling: boolean;
  /** Changes on every reveal (restarts the settle animation). */
  revealKey: number;
}

/** How a token travels to its new position (presentation only). */
export type MotionKind = "hop" | "land" | "open" | "home" | "capture" | "slide";

export interface TokenMotion {
  kind: MotionKind;
  ms: number;
  /** Unique per scheduled change, so the same kind twice in a row still animates. */
  id: number;
}

export interface Playback {
  /** The authoritative state the board currently shows (the previous one while an action plays). */
  game: GameStateView | null;
  /** The version being played or shown: the new one from the moment its action starts playing. */
  playing: number;
  tokens: BoardTokenInput[];
  motion: Record<string, TokenMotion>;
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
  /** Tokens home per player, as shown: a counter advances when the token arrives, not before. */
  home: Record<string, number>;
  /** A brief highlight on a player's panel (a capture, a token home); `key` changes each time. */
  flash: { playerId: string; kind: "capture" | "home"; key: number } | null;
  /** Set when the end of the game was just played live (never on a refresh or reconnect). */
  celebrate: { key: number } | null;
}

export function boardTokens(game: GameStateView): BoardTokenInput[] {
  return game.players.flatMap((p) => p.tokens.map((t) => ({ playerId: p.id, seat: p.seat, tokenId: t.id, step: t.step })));
}

const homeCounts = (game: GameStateView): Record<string, number> => Object.fromEntries(game.players.map((p) => [p.id, p.tokens.filter((t) => t.step === 56).length]));

const lastSeq = (game: GameStateView): number => game.recentHistory.reduce((max, e) => Math.max(max, e.seq), 0);
const dieValue = (game: GameStateView): number | null => game.turn.dice ?? game.lastRoll?.value ?? null;

function snapshot(game: GameStateView, previous?: Playback): Playback {
  return {
    game,
    playing: game.stateVersion,
    tokens: boardTokens(game),
    motion: {},
    raised: [],
    effects: previous?.effects ?? [],
    die: { value: dieValue(game), rolling: false, revealKey: previous?.die.revealKey ?? 0 },
    busy: false,
    revealedSeq: lastSeq(game),
    callouts: previous?.callouts ?? [],
    calloutKey: previous?.calloutKey ?? 0,
    home: homeCounts(game),
    flash: previous?.flash ?? null,
    celebrate: previous?.celebrate ?? null,
  };
}

let motionId = 0;

function withStep(view: Playback, key: string, step: number | null, kind: MotionKind, ms: number): Playback {
  return {
    ...view,
    tokens: view.tokens.map((t) => (tokenKey(t.playerId, t.tokenId) === key ? { ...t, step } : t)),
    motion: { ...view.motion, [key]: { kind, ms, id: ++motionId } },
    raised: [key],
  };
}

/**
 * @param paused While the room is paused nothing plays: any running action fast-forwards to the server's state.
 */
export function useBoardPlayback(game: GameStateView | null, reduced: boolean, paused = false): Playback {
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
    setView((v) => ({ ...snapshot(previous, v), playing: game.stateVersion, busy: true, revealedSeq: lastSeq(previous) }));

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
        // Cell by cell along the seat's own path (track, then its own lane): never a shortcut.
        const hops = reduced ? [entry.to] : hopSteps(entry.from, entry.to);
        hops.forEach((step, i) => {
          const last = i === hops.length - 1;
          const kind: MotionKind = reduced ? "slide" : entry.from === null ? "open" : step === 56 ? "home" : last ? "land" : "hop";
          const ms = reduced ? REDUCED_SLIDE_MS : kind === "open" ? OPEN_MS : kind === "home" ? D.homeEntry : hops.length > 8 && i >= 4 && !last ? FAST_HOP_MS : D.hopPerCell;
          at(t, (v) => withStep(v, key, step, kind, ms));
          t += ms;
        });
      } else if (entry.type === "capture") {
        // All tokens captured by this move go together (handled at the first capture entry).
        const group = entries.filter((e) => e.type === "capture" && e.playerId === entry.playerId && e.tokenId === entry.tokenId);
        if (group[0] !== entry) continue;
        const attackerSeat = seatOf.get(entry.playerId) ?? 0;
        const mover = entries.find((e) => (e.type === "move" || e.type === "auto-move") && e.playerId === entry.playerId && e.tokenId === entry.tokenId);
        const where = piecePosition(attackerSeat, mover && (mover.type === "move" || mover.type === "auto-move") ? mover.to : null);
        const ms = reduced ? REDUCED_REVEAL_MS : CAPTURE_IMPACT_MS + D.capture;
        group.forEach((victimEntry, i) => {
          if (victimEntry.type !== "capture") return;
          const victim = tokenKey(victimEntry.victimPlayerId, victimEntry.victimTokenId);
          const effect: BoardEffect = { id: `capture-${victimEntry.seq}`, kind: "capture", at: where, seat: seatOf.get(victimEntry.victimPlayerId) ?? 0 };
          const delay = reduced ? 0 : i * CAPTURE_STAGGER_MS;
          // Reduced motion: no effect marks at all (the banner still explains the capture).
          at(t + delay, (v) => ({ ...withStep(v, victim, null, reduced ? "slide" : "capture", ms), raised: [...v.raised, victim], effects: reduced ? v.effects : [...v.effects, effect] }));
        });
        const flashAt = t + (reduced ? 0 : CAPTURE_IMPACT_MS);
        at(flashAt, (v) => ({ ...v, flash: { playerId: entry.playerId, kind: "capture", key: (v.flash?.key ?? 0) + 1 } }));
        t += ms + (reduced ? 0 : (group.length - 1) * CAPTURE_STAGGER_MS);
      } else if (entry.type === "home") {
        // The token has arrived (its glide is complete): the accent, the counter and the panel move together.
        const seat = seatOf.get(entry.playerId) ?? 0;
        const effect: BoardEffect = { id: `home-${entry.seq}`, kind: "home", at: piecePosition(seat, 56), seat };
        const who = entry.playerId;
        at(t, (v) => ({ ...v, effects: reduced ? v.effects : [...v.effects, effect], home: { ...v.home, [who]: (v.home[who] ?? 0) + 1 }, flash: { playerId: who, kind: "home", key: (v.flash?.key ?? 0) + 1 } }));
      }
    }

    const over = entries.some((e) => e.type === "game-over");
    at(t, (v) => ({ ...snapshot(game, v), callouts: entries, calloutKey: v.calloutKey + 1, ...(over ? { celebrate: { key: (v.celebrate?.key ?? 0) + 1 } } : {}) }));
    at(t + 900, (v) => ({ ...v, effects: [] }));
  }, [game, reduced]);

  // A pause (or anything else that stops play) fast-forwards whatever is still playing.
  useEffect(() => {
    if (!paused || !game || timers.current.length === 0) return;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    setView((v) => (v.busy ? snapshot(game, v) : v));
  }, [paused, game]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return view;
}

function emptyPlayback(): Playback {
  return { game: null, playing: -1, tokens: [], motion: {}, raised: [], effects: [], die: { value: null, rolling: false, revealKey: 0 }, busy: false, revealedSeq: 0, callouts: [], calloutKey: 0, home: {}, flash: null, celebrate: null };
}
