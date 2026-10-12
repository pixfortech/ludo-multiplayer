// Runs the presentation plan (playbackPlan.ts) for each new authoritative state.
//
// Exactly one new action (version n → n+1) plays its plan, step by step, each
// step timed from the one before (so a late timer never squeezes a gap out); anything else snaps straight to the state (first load, refresh,
// reconnect, a missed version), so nothing ever animates or reacts twice. A
// newer state cancels what is still playing (fast-forward), and so does a
// pause. Every plan is bounded and ends on the server's state, so input (which
// waits for `busy` to clear) can never be held for longer than the action's
// own presentation.

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { GameStateView } from "@ludo/shared-types";
import { emitPresentationEvent } from "./presentation";
import { emptyPlayback, planPlayback, snapshot, type Playback, type PlaybackOptions } from "./playbackPlan";

export { boardTokens, CHARACTER_PACE, DIE3D_ROLL_MS, SIX_REACTION_LEAD_MS } from "./playbackPlan";
export type { DieThrow, DieView, MotionKind, Playback, PlaybackOptions, TokenMotion } from "./playbackPlan";

/**
 * @param paused While the room is paused nothing plays: any running action fast-forwards to the server's state.
 */
export function useBoardPlayback(game: GameStateView | null, reduced: boolean, paused = false, options: PlaybackOptions = {}): Playback {
  const { characterSeats, die3d = false } = options;
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
    const plan = planPlayback(previous, game, { reduced, die3d, ...(characterSeats ? { characterSeats } : {}) });
    const run = (step: (typeof plan.steps)[number]) => {
      const now = performance.now();
      if (step.own) flushSync(() => setView((v) => step.apply(v, now)));
      else setView((v) => step.apply(v, now));
      if (step.events) for (const e of step.events(now)) emitPresentationEvent(e);
    };
    // One step (or group of simultaneous steps) at a time, each timed from when the one before actually
    // ran: a busy page that runs a step late delays the rest by as much, so the gaps the plan sets (the
    // value shown before anything moves, the pause before an auto-move) are never squeezed out.
    const next = (i: number) => {
      const at = plan.steps[i]?.at;
      if (at === undefined) return;
      let j = i;
      while (j < plan.steps.length && plan.steps[j]!.at === at) run(plan.steps[j++]!);
      const following = plan.steps[j];
      if (following) timers.current = [setTimeout(() => next(j), following.at - at)];
    };
    // The first steps (the action starts, the die starts rolling) show at once.
    const first = plan.steps[0];
    if (first && first.at === 0) next(0);
    else if (first) timers.current = [setTimeout(() => next(0), first.at)];
  }, [game, reduced, characterSeats, die3d]);

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
