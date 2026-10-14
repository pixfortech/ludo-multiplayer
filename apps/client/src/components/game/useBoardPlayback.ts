// Runs the presentation plan (playbackPlan.ts) for each new authoritative state.
//
// Exactly one new action (version n → n+1) plays its plan on the plan's clock
// (a late step never delays the rest, but a late reveal moves the rest back so
// nothing moves the moment the die's value appears); anything else snaps straight to the state (first load, refresh,
// reconnect, a missed version), so nothing ever animates or reacts twice. A
// newer state cancels what is still playing (fast-forward), and so does a
// pause. Every plan is bounded and ends on the server's state, so input (which
// waits for `busy` to clear) can never be held for longer than the action's
// own presentation.

import { useEffect, useRef, useState } from "react";
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
    // A step is applied at the time it was due on the plan's clock (not when the timer happened to fire), so a
    // move's path starts when the plan says and the 3D board catches up with a late step instead of lagging.
    // An ordinary (batched) update: steps due together commit together, and no step forces a synchronous
    // render of its own (the 3D board animates from the path, not from a commit per cell).
    const run = (step: (typeof plan.steps)[number], at: number) => {
      setView((v) => step.apply(v, at));
      if (step.events) for (const e of step.events(performance.now())) emitPresentationEvent(e);
    };
    // The plan's own clock: each step at its time after the action started; steps that are due run together, in
    // order. A busy page that runs a step late does not delay the ones after it (no lag that grows step after
    // step), except after an anchor step (the die's reveal): everything after it moves back by its lateness, so
    // the value is always on show before anything moves. The 3D board follows each move's path on its own clock.
    const begun = performance.now();
    let shift = 0;
    let i = 0;
    const due = (k: number) => begun + plan.steps[k]!.at + shift;
    const next = () => {
      const now = performance.now();
      while (i < plan.steps.length && due(i) <= now + 1) {
        const late = now - due(i);
        const current = plan.steps[i]!;
        run(current, Math.min(now, due(i)));
        i++;
        if (current.anchor && late > 1) {
          shift += late;
          break;
        }
      }
      if (i < plan.steps.length) timers.current = [setTimeout(next, Math.max(0, due(i) - performance.now()))];
    };
    next();
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
