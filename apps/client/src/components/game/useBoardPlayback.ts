// Runs the presentation plan (playbackPlan.ts) for each new authoritative state.
//
// Exactly one new action (version n → n+1) plays its plan, step by step on
// timers; anything else snaps straight to the state (first load, refresh,
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
    for (const step of plan.steps) {
      const run = () => {
        const now = performance.now();
        if (step.own) flushSync(() => setView((v) => step.apply(v, now)));
        else setView((v) => step.apply(v, now));
        if (step.events) for (const e of step.events(now)) emitPresentationEvent(e);
      };
      // The first steps (the action starts, the die starts rolling) show at once.
      if (step.at === 0) run();
      else timers.current.push(setTimeout(run, step.at));
    }
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
