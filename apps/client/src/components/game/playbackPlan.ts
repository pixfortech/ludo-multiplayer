// Presentation of authoritative game state over time (docs/design/motion.md):
// the plan. The server's state is always the destination; this decides how the
// board travels there, as one ordered, bounded list of steps (the playback hook
// runs them on timers).
//
// When exactly one new action arrives (version n → n+1) its history entries
// play in order: the die's tumble and reveal (the 3D die's throw ends exactly on
// the server's value, and nothing moves before it shows), the characters'
// reactions (a six, three sixes, no move), the auto-move pause, cell-by-cell
// hops along the layout path, the capture return, the home glide, and the
// reactions that follow (the capturer's cheer, a teammate home, a finished
// player, the winner). Anything else (first load, refresh, reconnect, a missed
// version, a snapshot that jumps) snaps straight to the state, so nothing ever
// animates or reacts twice. Each token change carries a typed motion (hop,
// land, open, home, capture, slide); a change without a motion is a jump.
//
// Captures in one move play together, right after the attacker settles: a
// short impact, then every captured token goes back to its base (lightly
// staggered). Home counters advance only when a token actually arrives home.
// A finished game raises a celebration only when its last action is seen
// live. Every step has a fixed time: the whole action is bounded, and the
// last step always lands on the server's state.

import { MOTION } from "@ludo/design-tokens";
import type { GameHistoryEntry, GameStateView } from "@ludo/shared-types";
import { hopSteps, piecePosition } from "../board/geometry";
import { tokenKey, type BoardTokenInput } from "../board/placement";
import type { BoardEffect } from "../board/TokenOverlay";
import { CAPTURE_IMPACT_MS } from "../board/tokenMotion";
import { CUE_MS, type CueKind, type PresentationCue, type PresentationEvent } from "./presentation";

const D = MOTION.duration;
const OPEN_MS = 320;
const FAST_HOP_MS = 120;
const REDUCED_SLIDE_MS = 180;
export const REDUCED_REVEAL_MS = 120;
const NO_MOVE_HOLD_MS = 600;
/** Characters take a little longer to show their disappointment (three sixes, no move). */
const NO_MOVE_HOLD_CHARACTERS_MS = 1000;
/** Stagger between tokens captured together. */
const CAPTURE_STAGGER_MS = 60;

/**
 * Pacing for seats shown as walking characters (the 3D board, C.3): a person covers a cell at a walking
 * pace, not in a pawn's 170 ms hop, so their moves take longer here (presentation only: the server, the
 * rules and every other player are unaffected, and a newer state still fast-forwards).
 */
export const CHARACTER_PACE = {
  /** A walked cell; the first cells of a long move, and every cell of a short one. */
  walkMs: 700,
  /** A run cell, once a long move (more than 6 cells) is under way. */
  runMs: 420,
  /** Leaving base: the excited reaction, then the walk to the start cell. */
  openMs: 1500,
  /** Into the centre, with a short celebration. */
  homeMs: 1300,
  /** Caught: dismay where it stands, then back to base. */
  captureMs: 1300,
} as const;

/** The 3D die's throw: lifted, thrown, bouncing and rolling onto the server's value at its resting spot. */
export const DIE3D_ROLL_MS = 1150;
/** After a six lands, the roller's people react before the choice opens or a token moves (characters only). */
export const SIX_REACTION_LEAD_MS = 500;

export interface PlaybackOptions {
  /** Seats shown as walking characters: their moves are paced for walking, and they react to events. */
  characterSeats?: ReadonlySet<number>;
  /** The die is the 3D board's die: its throw takes DIE3D_ROLL_MS. */
  die3d?: boolean;
}

/** A throw of the 3D die: it lands on `value` at its resting spot in `seat`'s base after `ms`. */
export interface DieThrow {
  id: number;
  value: number;
  seat: number;
  playerId: string;
  ms: number;
  /** When it started (performance.now()). */
  at: number;
}

export interface DieView {
  value: number | null;
  rolling: boolean;
  /** Changes on every reveal (restarts the settle animation). */
  revealKey: number;
  /** The 3D die's current or last throw (null after a snapshot: nothing to replay). */
  throw: DieThrow | null;
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
  /** Moments the characters are reacting to (each ends by itself; none survive a snapshot). */
  cues: PresentationCue[];
}

export function boardTokens(game: GameStateView): BoardTokenInput[] {
  return game.players.flatMap((p) => p.tokens.map((t) => ({ playerId: p.id, seat: p.seat, tokenId: t.id, step: t.step })));
}

const homeCounts = (game: GameStateView): Record<string, number> => Object.fromEntries(game.players.map((p) => [p.id, p.tokens.filter((t) => t.step === 56).length]));

export const lastSeq = (game: GameStateView): number => game.recentHistory.reduce((max, e) => Math.max(max, e.seq), 0);
const dieValue = (game: GameStateView): number | null => game.turn.dice ?? game.lastRoll?.value ?? null;

/** The board exactly at `game`, with nothing playing: no motion, no throw, no reaction (nothing replays). */
export function snapshot(game: GameStateView, previous?: Playback): Playback {
  return {
    game,
    playing: game.stateVersion,
    tokens: boardTokens(game),
    motion: {},
    raised: [],
    effects: previous?.effects ?? [],
    die: { value: dieValue(game), rolling: false, revealKey: previous?.die.revealKey ?? 0, throw: null },
    busy: false,
    revealedSeq: lastSeq(game),
    callouts: previous?.callouts ?? [],
    calloutKey: previous?.calloutKey ?? 0,
    home: homeCounts(game),
    flash: previous?.flash ?? null,
    celebrate: previous?.celebrate ?? null,
    cues: [],
  };
}

export function emptyPlayback(): Playback {
  return { game: null, playing: -1, tokens: [], motion: {}, raised: [], effects: [], die: { value: null, rolling: false, revealKey: 0, throw: null }, busy: false, revealedSeq: 0, callouts: [], calloutKey: 0, home: {}, flash: null, celebrate: null, cues: [] };
}

let motionId = 0;
let cueId = 0;
let throwId = 0;

function withStep(view: Playback, key: string, step: number | null, kind: MotionKind, ms: number): Playback {
  return {
    ...view,
    tokens: view.tokens.map((t) => (tokenKey(t.playerId, t.tokenId) === key ? { ...t, step } : t)),
    motion: { ...view.motion, [key]: { kind, ms, id: ++motionId } },
    raised: [key],
  };
}

/** Cues still playing (a little slack, so a reaction is never cut at its last frame). */
export const liveCues = (cues: readonly PresentationCue[], now: number): PresentationCue[] => cues.filter((c) => now - c.at < c.ms + 500);

/** One step of a plan: at `at` ms after the action starts, `apply` updates the view. */
export interface PlaybackStep {
  at: number;
  /** What it does, for tests and tooling ("die:throw", "hop:p1:0:5", "cue:six:p1", "settle", ...). */
  label: string;
  /** Committed on its own render (a walking character's cell: never batched with the next one). */
  own?: boolean;
  apply: (view: Playback, now: number) => Playback;
  /** Hooks for sound and dialogue, emitted as the step is shown. */
  events?: (now: number) => PresentationEvent[];
}

export interface PlaybackPlan {
  steps: PlaybackStep[];
  /** When the last step runs (ms): the action is presented in exactly this long. */
  total: number;
}

/** The plan for one action: from the board at `previous` to `game` (exactly one version later). */
export function planPlayback(previous: GameStateView, game: GameStateView, options: PlaybackOptions & { reduced: boolean }): PlaybackPlan {
  const { reduced, characterSeats } = options;
  const steps: PlaybackStep[] = [];
  const entries = game.recentHistory.filter((e) => e.seq > lastSeq(previous));
  const seatOf = new Map(game.players.map((p) => [p.id, p.seat]));
  const walks = (playerId: string) => !reduced && (characterSeats?.has(seatOf.get(playerId) ?? -1) ?? false);
  const step = (at: number, label: string, apply: PlaybackStep["apply"], extra: Pick<PlaybackStep, "own" | "events"> = {}) => steps.push({ at, label, apply, ...extra });
  const cue = (at: number, kind: CueKind, playerId: string, tokens: string[]) => {
    // Only the people of a seat shown as characters react (pawns have nobody to react).
    if (!walks(playerId)) return;
    const id = ++cueId;
    const seat = seatOf.get(playerId) ?? 0;
    step(at, `cue:${kind}:${playerId}`, (v, now) => ({ ...v, cues: [...liveCues(v.cues, now), { id, kind, playerId, seat, tokens, at: now, ms: CUE_MS[kind] }] }), {
      events: () => [{ type: "cue", cue: { id, kind, playerId, seat, tokens, ms: CUE_MS[kind] } }],
    });
  };
  let t = 0;

  // Start from the previous authoritative position (fast-forwarding anything still running).
  step(0, "start", (v) => ({ ...snapshot(previous, v), playing: game.stateVersion, busy: true, revealedSeq: lastSeq(previous), cues: v.cues }));

  const roll = entries.find((e) => e.type === "roll");
  if (roll && roll.type === "roll") {
    const seat = seatOf.get(roll.playerId) ?? 0;
    const rollMs = reduced ? 0 : options.die3d ? DIE3D_ROLL_MS : D.diceRoll;
    const id = ++throwId;
    step(0, "die:throw", (v, now) => ({ ...v, die: { ...v.die, rolling: true, throw: options.die3d ? { id, value: roll.value, seat, playerId: roll.playerId, ms: rollMs, at: now } : v.die.throw } }), {
      events: () => [{ type: "die-throw", playerId: roll.playerId, seat }],
    });
    t += rollMs;
    step(t, `die:reveal:${roll.value}`, (v) => ({ ...v, die: { ...v.die, value: roll.value, rolling: false, revealKey: v.die.revealKey + 1 } }), {
      events: () => [{ type: "die-land", playerId: roll.playerId, seat, value: roll.value }],
    });
    const forfeit = entries.some((e) => e.type === "forfeit");
    const pass = entries.some((e) => e.type === "auto-pass");
    if (forfeit) cue(t, "forfeit", roll.playerId, []);
    else if (pass) cue(t, "no-move", roll.playerId, []);
    else if (roll.value === 6) cue(t, "six", roll.playerId, []);
    t += reduced ? REDUCED_REVEAL_MS : D.diceReveal;
    if (roll.value === 6 && !forfeit && !pass && walks(roll.playerId)) t += SIX_REACTION_LEAD_MS;
    if (entries.some((e) => e.type === "auto-move")) t += D.autoMovePause;
    if (pass || forfeit) {
      step(t, "callout", (v) => ({ ...v, callouts: entries, calloutKey: v.calloutKey + 1 }));
      t += walks(roll.playerId) ? NO_MOVE_HOLD_CHARACTERS_MS : NO_MOVE_HOLD_MS;
    }
  }

  for (const entry of entries) {
    if (entry.type === "move" || entry.type === "auto-move") {
      const key = tokenKey(entry.playerId, entry.tokenId);
      const walking = walks(entry.playerId);
      // Cell by cell along the seat's own path (track, then its own lane): never a shortcut.
      const hops = reduced ? [entry.to] : hopSteps(entry.from, entry.to);
      hops.forEach((cell, i) => {
        const last = i === hops.length - 1;
        const kind: MotionKind = reduced ? "slide" : entry.from === null ? "open" : cell === 56 ? "home" : last ? "land" : "hop";
        const ms = reduced
          ? REDUCED_SLIDE_MS
          : walking
            ? kind === "open"
              ? CHARACTER_PACE.openMs
              : kind === "home"
                ? CHARACTER_PACE.homeMs
                : hops.length > 6 && i >= 2 && i < hops.length - 2
                  ? CHARACTER_PACE.runMs
                  : CHARACTER_PACE.walkMs
            : kind === "open"
              ? OPEN_MS
              : kind === "home"
                ? D.homeEntry
                : hops.length > 8 && i >= 4 && !last
                  ? FAST_HOP_MS
                  : D.hopPerCell;
        // A walking character's cells each get their own render, even when a busy page runs two timers back to
        // back (React would otherwise batch them and the character would never be told about the cell between).
        step(t, `${kind}:${key}:${cell}`, (v) => withStep(v, key, cell, kind, ms), {
          own: walking,
          ...(i === 0 ? { events: () => [{ type: "token-move" as const, playerId: entry.playerId, tokenId: entry.tokenId, from: entry.from, to: entry.to }] } : {}),
        });
        t += ms;
      });
    } else if (entry.type === "capture") {
      // All tokens captured by this move go together (handled at the first capture entry).
      const group = entries.filter((e) => e.type === "capture" && e.playerId === entry.playerId && e.tokenId === entry.tokenId);
      if (group[0] !== entry) continue;
      const attackerSeat = seatOf.get(entry.playerId) ?? 0;
      const mover = entries.find((e) => (e.type === "move" || e.type === "auto-move") && e.playerId === entry.playerId && e.tokenId === entry.tokenId);
      const where = piecePosition(attackerSeat, mover && (mover.type === "move" || mover.type === "auto-move") ? mover.to : null);
      const victimWalks = group.some((e) => e.type === "capture" && walks(e.victimPlayerId));
      const ms = reduced ? REDUCED_REVEAL_MS : CAPTURE_IMPACT_MS + (victimWalks ? CHARACTER_PACE.captureMs : D.capture);
      group.forEach((victimEntry, i) => {
        if (victimEntry.type !== "capture") return;
        const victim = tokenKey(victimEntry.victimPlayerId, victimEntry.victimTokenId);
        const effect: BoardEffect = { id: `capture-${victimEntry.seq}`, kind: "capture", at: where, seat: seatOf.get(victimEntry.victimPlayerId) ?? 0 };
        const delay = reduced ? 0 : i * CAPTURE_STAGGER_MS;
        // Reduced motion: no effect marks at all (the banner still explains the capture).
        step(t + delay, `capture:${victim}`, (v) => ({ ...withStep(v, victim, null, reduced ? "slide" : "capture", ms), raised: [...v.raised, victim], effects: reduced ? v.effects : [...v.effects, effect] }));
      });
      const flashAt = t + (reduced ? 0 : CAPTURE_IMPACT_MS);
      step(flashAt, `flash:capture:${entry.playerId}`, (v) => ({ ...v, flash: { playerId: entry.playerId, kind: "capture", key: (v.flash?.key ?? 0) + 1 } }));
      // The capturer cheers as the caught go home (never before the server's capture is shown).
      cue(flashAt, "capture", entry.playerId, [tokenKey(entry.playerId, entry.tokenId)]);
      t += ms + (reduced ? 0 : (group.length - 1) * CAPTURE_STAGGER_MS);
    } else if (entry.type === "home") {
      // The token has arrived (its glide is complete): the accent, the counter and the panel move together.
      const seat = seatOf.get(entry.playerId) ?? 0;
      const effect: BoardEffect = { id: `home-${entry.seq}`, kind: "home", at: piecePosition(seat, 56), seat };
      const who = entry.playerId;
      step(t, `home:${who}:${entry.tokenId}`, (v) => ({ ...v, effects: reduced ? v.effects : [...v.effects, effect], home: { ...v.home, [who]: (v.home[who] ?? 0) + 1 }, flash: { playerId: who, kind: "home", key: (v.flash?.key ?? 0) + 1 } }));
      cue(t, "home", who, [tokenKey(who, entry.tokenId)]);
    } else if (entry.type === "bonus-roll") {
      // A six's bonus is part of the six's reaction; a capture's or a home's gets its own small cheer.
      if (entry.reasons.some((r) => r === "capture" || r === "home")) cue(t, "bonus", entry.playerId, []);
    } else if (entry.type === "player-finished") {
      const p = game.players.find((x) => x.id === entry.playerId);
      cue(t, "finished", entry.playerId, p ? p.tokens.map((tk) => tokenKey(p.id, tk.id)) : []);
    } else if (entry.type === "win") {
      cue(t, "win", entry.playerId, []);
    }
  }

  const over = entries.some((e) => e.type === "game-over");
  step(t, "settle", (v) => ({ ...snapshot(game, v), cues: v.cues, die: { ...snapshot(game, v).die, throw: v.die.throw }, callouts: entries, calloutKey: v.calloutKey + 1, ...(over ? { celebrate: { key: (v.celebrate?.key ?? 0) + 1 } } : {}) }));
  step(t + 900, "clear-effects", (v) => ({ ...v, effects: [] }));
  return { steps: steps.sort((a, b) => a.at - b.at), total: t + 900 };
}
