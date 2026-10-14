// The playback's executor on a busy page: when the main thread is blocked past
// several steps' times, their timers fire back to back. The steps must still
// keep the gaps the plan sets (the value shown before anything moves, the pause
// before an auto-move), and the board must still end on the server's state.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameHistoryEntry, GameStateView } from "@ludo/shared-types";
import { MOTION } from "@ludo/design-tokens";
import { gameView } from "../../../test/fakes";
import { onPresentationEvent } from "../presentation";
import { CHARACTER_PACE, useBoardPlayback } from "../useBoardPlayback";

const D = MOTION.duration;
const HOST = "p-host";
const BEN = "p-ben";
const characters = new Set([0, 2]);

const steps = (n: (number | null)[]) => n.map((step, id) => ({ id, step }));
function state(version: number, host: (number | null)[], ben: (number | null)[], history: GameHistoryEntry[]): GameStateView {
  const g = gameView({ stateVersion: version, recentHistory: history, historyLength: history.length + 1 });
  return { ...g, players: [{ ...g.players[0]!, tokens: steps(host) }, { ...g.players[1]!, tokens: steps(ben) }] };
}

// A hand-driven clock: timers fire only when the test lets them.
let clock = 0;
let ids = 0;
let timers: { id: number; due: number; fn: () => void }[] = [];
const fire = (t: { id: number; due: number; fn: () => void }) => {
  timers = timers.filter((x) => x !== t);
  act(() => t.fn());
};
const nextDue = (by: number) => timers.filter((t) => t.due <= by).sort((a, b) => a.due - b.due || a.id - b.id)[0];
/** The page is blocked until `t`; then every timer due by then fires at once, back to back (as a browser does). */
function blockedUntil(t: number) {
  clock = t;
  for (let x = nextDue(clock); x; x = nextDue(clock)) fire(x);
}
/** A slow page: every timer fires `lateMs` after it was due, up to `t`. */
function lateUntil(t: number, lateMs: number) {
  for (let x = nextDue(t); x; x = nextDue(t)) {
    clock = Math.max(clock, x.due + lateMs);
    fire(x);
  }
  clock = t;
}
/** The page is free: each timer fires on time, up to `t`. */
function freeUntil(t: number) {
  for (let x = nextDue(t); x; x = nextDue(t)) {
    clock = Math.max(clock, x.due);
    fire(x);
  }
  clock = t;
}

beforeEach(() => {
  clock = 0;
  timers = [];
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("setTimeout", (fn: () => void, ms = 0) => {
    const id = ++ids;
    timers.push({ id, due: clock + ms, fn });
    return id;
  });
  vi.stubGlobal("clearTimeout", (id: number) => {
    timers = timers.filter((t) => t.id !== id);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the playback on a busy page", () => {
  it("keeps the value on show before the token moves, even when the page was blocked past both", () => {
    const before = state(1, [10, null, null, null], [null, null, null, null], []);
    const after = state(2, [13, null, null, null], [null, null, null, null], [
      { seq: 1, type: "roll", playerId: HOST, value: 3 },
      { seq: 2, type: "auto-move", playerId: HOST, tokenId: 0, from: 10, to: 13, dice: 3 },
      { seq: 3, type: "turn", playerId: BEN, reason: "move-complete" },
    ]);
    const shown: { type: string; t: number }[] = [];
    const off = onPresentationEvent((e) => shown.push({ type: e.type, t: clock }));
    const { result, rerender } = renderHook(({ game }) => useBoardPlayback(game, false, false, { characterSeats: characters, die3d: true }), { initialProps: { game: before } });
    act(() => rerender({ game: after }));
    expect(shown.map((e) => e.type)).toEqual(["die-throw"]);
    // Blocked for five seconds: the reveal and the first hop were both due by then.
    blockedUntil(5_000);
    const land = shown.find((e) => e.type === "die-land");
    expect(land?.t).toBe(5_000);
    expect(shown.some((e) => e.type === "token-move"), "nothing moves in the same moment as the reveal").toBe(false);
    freeUntil(60_000);
    off();
    const move = shown.find((e) => e.type === "token-move")!;
    expect(move.t - land!.t, "the reveal and the auto-move pause are kept").toBeGreaterThanOrEqual(D.diceReveal + D.autoMovePause);
    // And it ends on the server's state, with input free.
    expect(result.current.busy).toBe(false);
    expect(result.current.tokens.find((t) => t.playerId === HOST && t.tokenId === 0)?.step).toBe(13);
    expect(timers).toEqual([]);
  });

  it("runs on the plan's clock: timers that each fire late do not add up cell after cell", () => {
    const before = state(1, [10, null, null, null], [null, null, null, null], []);
    const after = state(2, [16, null, null, null], [null, null, null, null], [{ seq: 1, type: "move", playerId: HOST, tokenId: 0, from: 10, to: 16, dice: 6 }]);
    const shown: { type: string; t: number }[] = [];
    const off = onPresentationEvent((e) => shown.push({ type: e.type, t: clock }));
    const { result, rerender } = renderHook(({ game }) => useBoardPlayback(game, false, false, { characterSeats: characters, die3d: true }), { initialProps: { game: before } });
    act(() => rerender({ game: after }));
    const path = result.current.motion[`${HOST}:0`]!.path!;
    expect(path.startedAt).toBe(0);
    // Every timer 120 ms late (a busy page): the walk still ends at its planned time plus one lateness, not six.
    const settled: number[] = [];
    while (result.current.busy && clock < 60_000) {
      lateUntil(clock + 1, 120);
      if (!result.current.busy) settled.push(clock);
      if (timers.length && result.current.busy) clock = Math.max(clock, Math.min(...timers.map((x) => x.due)) - 1);
    }
    off();
    expect(result.current.tokens.find((t) => t.playerId === HOST && t.tokenId === 0)?.step).toBe(16);
    expect(settled[0]).toBeLessThanOrEqual(path.ms + 120 + 1);
    // The path never restarted: one path, started on the plan's clock (not when a late timer fired).
    expect(result.current.motion[`${HOST}:0`]?.path?.id ?? path.id).toBe(path.id);
  });

  it("steps that are due together run together, in order", () => {
    const before = state(1, [10, null, null, null], [null, null, null, null], []);
    const after = state(2, [16, null, null, null], [null, null, null, null], [{ seq: 1, type: "move", playerId: HOST, tokenId: 0, from: 10, to: 16, dice: 6 }]);
    const { result, rerender } = renderHook(({ game }) => useBoardPlayback(game, false, false, { characterSeats: characters, die3d: true }), { initialProps: { game: before } });
    act(() => rerender({ game: after }));
    const startedAt = result.current.motion[`${HOST}:0`]!.path!.startedAt;
    // Blocked for 3 cells' time (cells 12, 13 and 14 were due): the next timer brings the token straight to the
    // cell the clock says, through every cell in between.
    blockedUntil(3 * CHARACTER_PACE.walkMs + 5);
    expect(result.current.tokens.find((t) => t.playerId === HOST && t.tokenId === 0)?.step).toBe(14);
    // The path is the same one, still on its original clock: the 3D board catches up rather than lagging.
    expect(result.current.motion[`${HOST}:0`]!.path!.startedAt).toBe(startedAt);
    freeUntil(60_000);
    expect(result.current.busy).toBe(false);
    expect(timers).toEqual([]);
  });
});
