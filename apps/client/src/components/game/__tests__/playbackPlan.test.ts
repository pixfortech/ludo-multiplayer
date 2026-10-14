// The presentation plan for one action: ordered, bounded, and only ever from
// the server's committed history. The die shows its value before anything
// moves; reactions come after the event they react to (a capture's cheer after
// the attacker arrives, a home's after the token is home, victory last); a
// snapshot (refresh, reconnect) replays nothing.
import { describe, expect, it } from "vitest";
import type { GameHistoryEntry, GameStateView } from "@ludo/shared-types";
import { MOTION } from "@ludo/design-tokens";
import { gameView } from "../../../test/fakes";
import { CHARACTER_PACE, DIE3D_ROLL_MS, SIX_REACTION_LEAD_MS, emptyPlayback, planPlayback, snapshot, type Playback, type PlaybackPlan } from "../playbackPlan";
import { CUE_MS } from "../presentation";
import { CAPTURE_IMPACT_MS } from "../../board/tokenMotion";

const D = MOTION.duration;
const HOST = "p-host";
const BEN = "p-ben";
const characters = new Set([0, 2]);

const steps = (n: (number | null)[]) => n.map((step, id) => ({ id, step }));
function state(version: number, host: (number | null)[], ben: (number | null)[], history: GameHistoryEntry[], over: Partial<GameStateView> = {}): GameStateView {
  const g = gameView({ stateVersion: version, recentHistory: history, historyLength: history.length + 1, ...over });
  return { ...g, players: [{ ...g.players[0]!, tokens: steps(host) }, { ...g.players[1]!, tokens: steps(ben) }] };
}

/** Applies every step in order (at the time it would run) and returns the view after each. */
function run(plan: PlaybackPlan, from: Playback, t0 = 10_000): { at: number; label: string; view: Playback }[] {
  let view = from;
  return plan.steps.map((s) => {
    view = s.apply(view, t0 + s.at);
    return { at: s.at, label: s.label, view };
  });
}
const at = (plan: PlaybackPlan, label: string | RegExp) => plan.steps.filter((s) => (typeof label === "string" ? s.label === label : label.test(s.label))).map((s) => s.at);

describe("the die", () => {
  const before = state(1, [null, null, null, null], [null, null, null, null], [{ seq: 1, type: "turn", playerId: HOST, reason: "move-complete" }]);
  const after = state(2, [null, null, null, null], [null, null, null, null], [...before.recentHistory, { seq: 2, type: "roll", playerId: HOST, value: 6 }], {
    turn: { phase: "awaiting-move", dice: 6, consecutiveSixes: 1, legalMoves: [] },
    lastRoll: { playerId: HOST, value: 6 },
  });

  it("is thrown at once with the server's value, lands after its throw, and only then is the value revealed", () => {
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    const views = run(plan, snapshot(before));
    const thrown = views.find((v) => v.label === "die:throw")!;
    expect(thrown.at).toBe(0);
    expect(thrown.view.die.throw).toMatchObject({ value: 6, seat: 0, playerId: HOST, ms: DIE3D_ROLL_MS });
    expect(thrown.view.die.rolling).toBe(true);
    // The tray (and the log) do not show the value while the die is in the air.
    expect(thrown.view.die.value).not.toBe(6);
    const revealed = views.find((v) => v.label === "die:reveal:6")!;
    expect(revealed.at).toBe(DIE3D_ROLL_MS);
    expect(revealed.view.die).toMatchObject({ value: 6, rolling: false });
  });

  it("shows a six, the team reacts, and only then does the choice open", () => {
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    expect(at(plan, `cue:six:${HOST}`)).toEqual([DIE3D_ROLL_MS]);
    const settle = at(plan, "settle")[0]!;
    expect(settle).toBe(DIE3D_ROLL_MS + D.diceReveal + SIX_REACTION_LEAD_MS);
    const views = run(plan, snapshot(before));
    expect(views.find((v) => v.label === "settle")!.view.busy, "input opens at the settle").toBe(false);
    expect(views.filter((v) => v.at < settle).every((v) => v.view.busy), "and not before").toBe(true);
  });

  it("keeps the tray's quicker tumble for the 2D board, and no reactions for pawns", () => {
    const plan = planPlayback(before, after, { reduced: false });
    expect(at(plan, "die:reveal:6")).toEqual([D.diceRoll]);
    expect(at(plan, /^cue:/)).toEqual([]);
    expect(run(plan, snapshot(before)).find((v) => v.label === "die:throw")!.view.die.throw).toBeNull();
  });

  it("under reduced motion: no throw, the value at once, no reactions", () => {
    const plan = planPlayback(before, after, { reduced: true, die3d: true, characterSeats: characters });
    expect(at(plan, "die:reveal:6")).toEqual([0]);
    expect(at(plan, /^cue:/)).toEqual([]);
  });
});

describe("moves", () => {
  it("never moves a token before the die has shown its value (auto-move after a roll)", () => {
    const before = state(1, [10, null, null, null], [null, null, null, null], []);
    const after = state(2, [13, null, null, null], [null, null, null, null], [
      { seq: 1, type: "roll", playerId: HOST, value: 3 },
      { seq: 2, type: "auto-move", playerId: HOST, tokenId: 0, from: 10, to: 13, dice: 3 },
      { seq: 3, type: "turn", playerId: BEN, reason: "move-complete" },
    ]);
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    const reveal = at(plan, "die:reveal:3")[0]!;
    const hops = plan.steps.filter((s) => /^(hop|land):/.test(s.label));
    expect(hops.map((s) => s.label)).toEqual([`hop:${HOST}:0:11`, `hop:${HOST}:0:12`, `land:${HOST}:0:13`]);
    expect(hops[0]!.at).toBe(reveal + D.diceReveal + D.autoMovePause);
    // Cell by cell at a walking pace.
    expect(hops[1]!.at - hops[0]!.at).toBe(CHARACTER_PACE.walkMs);
    // One path for the whole move, the same object on every cell's step: every cell in order, its time, and the
    // moment it started (when its first cell was shown), so the 3D board follows it on its own clock.
    const views = run(plan, snapshot(before));
    const paths = views.filter((v) => /^(hop|land):/.test(v.label)).map((v) => v.view.motion[`${HOST}:0`]!.path!);
    expect(new Set(paths).size).toBe(1);
    expect(paths[0]).toMatchObject({ seat: 0, from: 10, ms: 3 * CHARACTER_PACE.walkMs, startedAt: 10_000 + hops[0]!.at });
    expect(paths[0]!.segments).toEqual([
      { step: 11, kind: "hop", ms: CHARACTER_PACE.walkMs },
      { step: 12, kind: "hop", ms: CHARACTER_PACE.walkMs },
      { step: 13, kind: "land", ms: CHARACTER_PACE.walkMs },
    ]);
  });

  it("a long walk runs, and an action's next path is a new one", () => {
    const before = state(1, [10, null, null, null], [null, null, null, null], []);
    const after = state(2, [16, null, null, null], [null, null, null, null], [{ seq: 1, type: "move", playerId: HOST, tokenId: 0, from: 10, to: 16, dice: 6 }]);
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    const views = run(plan, snapshot(before));
    const path = views.find((v) => v.label === `land:${HOST}:0:16`)!.view.motion[`${HOST}:0`]!.path!;
    expect(path.segments.map((s) => s.step)).toEqual([11, 12, 13, 14, 15, 16]);
    expect(path.ms).toBeLessThanOrEqual(3000);
    const again = run(planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters }), snapshot(before));
    expect(again.find((v) => v.label === `land:${HOST}:0:16`)!.view.motion[`${HOST}:0`]!.path!.id).not.toBe(path.id);
  });

  it("a six's departure: the open motion, then the board settles on the server's state", () => {
    const before = state(2, [null, null, null, null], [null, null, null, null], [{ seq: 1, type: "roll", playerId: HOST, value: 6 }]);
    const after = state(3, [0, null, null, null], [null, null, null, null], [...before.recentHistory, { seq: 2, type: "move", playerId: HOST, tokenId: 0, from: null, to: 0, dice: 6 }, { seq: 3, type: "bonus-roll", playerId: HOST, reasons: ["six"] }]);
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    const views = run(plan, snapshot(before));
    const open = views.find((v) => v.label === `open:${HOST}:0:0`)!;
    expect(open.at).toBe(0);
    expect(open.view.motion[`${HOST}:0`]).toMatchObject({ kind: "open", ms: CHARACTER_PACE.openMs });
    expect(at(plan, "settle")).toEqual([CHARACTER_PACE.openMs]);
    // A six's bonus is part of the six's reaction: no second cue.
    expect(at(plan, /^cue:bonus/)).toEqual([]);
  });

  it("is bounded: a twelve-cell walk with reactions is presented in a fixed, finite time", () => {
    const before = state(1, [10, null, null, null], [null, null, null, null], []);
    const after = state(2, [22, null, null, null], [null, null, null, null], [{ seq: 1, type: "move", playerId: HOST, tokenId: 0, from: 10, to: 22, dice: 6 }]);
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    expect(plan.total).toBeLessThan(10_000);
    expect(plan.steps.every((s) => s.at <= plan.total)).toBe(true);
  });
});

describe("captures, home, finishing and the win", () => {
  it("the capture comes after the attacker arrives; its cheer after the impact; the caught go back to base", () => {
    const before = state(4, [20, null, null, null], [null, 22 - 26 + 52, null, null], []);
    const after = state(5, [22, null, null, null], [null, null, null, null], [
      { seq: 1, type: "move", playerId: HOST, tokenId: 0, from: 20, to: 22, dice: 2 },
      { seq: 2, type: "capture", playerId: HOST, tokenId: 0, cell: 22, victimPlayerId: BEN, victimTokenId: 1 },
      { seq: 3, type: "bonus-roll", playerId: HOST, reasons: ["capture"] },
    ]);
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    const arrived = at(plan, `land:${HOST}:0:22`)[0]! + CHARACTER_PACE.walkMs;
    const capture = at(plan, `capture:${BEN}:1`)[0]!;
    expect(capture).toBe(arrived);
    expect(at(plan, `cue:capture:${HOST}`)).toEqual([capture + CAPTURE_IMPACT_MS]);
    expect(at(plan, `cue:bonus:${HOST}`)[0]).toBeGreaterThan(capture);
    const views = run(plan, snapshot(before));
    const caught = views.find((v) => v.label === `capture:${BEN}:1`)!.view;
    expect(caught.motion[`${BEN}:1`]!.kind).toBe("capture");
    expect(caught.tokens.find((t) => t.playerId === BEN && t.tokenId === 1)!.step).toBeNull();
    const cue = views.find((v) => v.label === `cue:capture:${HOST}`)!.view.cues.at(-1)!;
    expect(cue).toMatchObject({ kind: "capture", tokens: [`${HOST}:0`], ms: CUE_MS.capture });
  });

  it("two tokens caught together go back together, lightly staggered", () => {
    const before = state(4, [20, null, null, null], [10, 10, null, null], []);
    const after = state(5, [22, null, null, null], [null, null, null, null], [
      { seq: 1, type: "move", playerId: HOST, tokenId: 0, from: 20, to: 22, dice: 2 },
      { seq: 2, type: "capture", playerId: HOST, tokenId: 0, cell: 22, victimPlayerId: BEN, victimTokenId: 0 },
      { seq: 3, type: "capture", playerId: HOST, tokenId: 0, cell: 22, victimPlayerId: BEN, victimTokenId: 1 },
    ]);
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    const [a, b] = [at(plan, `capture:${BEN}:0`)[0]!, at(plan, `capture:${BEN}:1`)[0]!];
    expect(b - a).toBe(60);
    expect(at(plan, /^cue:capture/)).toHaveLength(1);
  });

  it("home, then the player finishes and wins: counters at arrival, reactions after it, the celebration last", () => {
    const before = state(9, [56, 56, 56, 54], [null, null, null, null], []);
    const after = state(10, [56, 56, 56, 56], [null, null, null, null], [
      { seq: 1, type: "move", playerId: HOST, tokenId: 3, from: 54, to: 56, dice: 2 },
      { seq: 2, type: "home", playerId: HOST, tokenId: 3 },
      { seq: 3, type: "player-finished", playerId: HOST, place: 1 },
      { seq: 4, type: "win", playerId: HOST },
      { seq: 5, type: "game-over", ranking: [HOST] },
    ], { phase: "finished", winnerId: HOST, ranking: [HOST], currentPlayerId: null });
    const plan = planPlayback(before, after, { reduced: false, die3d: true, characterSeats: characters });
    const arrived = CHARACTER_PACE.walkMs + CHARACTER_PACE.homeMs;
    expect(at(plan, `home:${HOST}:3`)).toEqual([arrived]);
    expect(at(plan, `cue:home:${HOST}`)).toEqual([arrived]);
    expect(at(plan, `cue:finished:${HOST}`)).toEqual([arrived]);
    expect(at(plan, `cue:win:${HOST}`)).toEqual([arrived]);
    const views = run(plan, snapshot(before));
    const labels = views.map((v) => v.label);
    expect(labels.indexOf(`home:${HOST}:3`)).toBeLessThan(labels.indexOf(`cue:finished:${HOST}`));
    expect(labels.indexOf(`cue:finished:${HOST}`)).toBeLessThan(labels.indexOf(`cue:win:${HOST}`));
    // The home counter waits for the arrival; the celebration (victory) only at the very end.
    expect(views.filter((v) => v.at < arrived).every((v) => v.view.home[HOST] === 3)).toBe(true);
    expect(views.find((v) => v.label === `home:${HOST}:3`)!.view.home[HOST]).toBe(4);
    expect(views.filter((v) => v.label !== "settle" && v.label !== "clear-effects").every((v) => v.view.celebrate === null)).toBe(true);
    expect(views.find((v) => v.label === "settle")!.view.celebrate).not.toBeNull();
  });

  it("full ranking: a finisher celebrates while the game carries on (no end-of-game celebration until it is over)", () => {
    const CARA = "p-cara";
    const three = (version: number, host: (number | null)[], ben: (number | null)[], history: GameHistoryEntry[], over: Partial<GameStateView> = {}): GameStateView => {
      const g = state(version, host, ben, history, { settings: { autoMove: true, rankingMode: "full-ranking" }, ...over });
      return { ...g, players: [...g.players, { id: CARA, seat: 1, tokens: steps([null, null, null, null]), finished: false }] };
    };
    const seats = new Set([0, 1, 2]);
    // The first to finish wins, and the other two play on for the places.
    const first = planPlayback(
      three(9, [56, 56, 56, 54], [null, null, null, null], []),
      three(10, [56, 56, 56, 56], [null, null, null, null], [
        { seq: 1, type: "move", playerId: HOST, tokenId: 3, from: 54, to: 56, dice: 2 },
        { seq: 2, type: "home", playerId: HOST, tokenId: 3 },
        { seq: 3, type: "player-finished", playerId: HOST, place: 1 },
        { seq: 4, type: "win", playerId: HOST },
        { seq: 5, type: "turn", playerId: BEN, reason: "player-finished" },
      ], { winnerId: HOST, ranking: [HOST], currentPlayerId: BEN }),
      { reduced: false, die3d: true, characterSeats: seats },
    );
    expect(first.steps.filter((s) => s.label.startsWith("cue:")).map((s) => s.label)).toEqual([`cue:home:${HOST}`, `cue:finished:${HOST}`, `cue:win:${HOST}`]);
    const firstViews = run(first, snapshot(three(9, [56, 56, 56, 54], [null, null, null, null], [])));
    expect(firstViews.every((v) => v.view.celebrate === null), "the game goes on: no victory screen yet").toBe(true);
    // A later finisher takes a place: their team celebrates finishing, nobody is announced as the winner again.
    const before = three(20, [56, 56, 56, 56], [56, 56, 56, 55], [], { winnerId: HOST, ranking: [HOST], currentPlayerId: BEN });
    const second = planPlayback(
      before,
      three(21, [56, 56, 56, 56], [56, 56, 56, 56], [
        { seq: 1, type: "move", playerId: BEN, tokenId: 3, from: 55, to: 56, dice: 1 },
        { seq: 2, type: "home", playerId: BEN, tokenId: 3 },
        { seq: 3, type: "player-finished", playerId: BEN, place: 2 },
        { seq: 4, type: "game-over", ranking: [HOST, BEN, CARA] },
      ], { phase: "finished", winnerId: HOST, ranking: [HOST, BEN, CARA], currentPlayerId: null }),
      { reduced: false, die3d: true, characterSeats: seats },
    );
    expect(second.steps.filter((s) => s.label.startsWith("cue:")).map((s) => s.label)).toEqual([`cue:home:${BEN}`, `cue:finished:${BEN}`]);
    // That ended the game (one player left): the celebration (the victory screen) comes at the very end.
    const views = run(second, snapshot(before));
    expect(views.find((v) => v.label === "settle")!.view.celebrate).not.toBeNull();
    expect(views.filter((v) => v.label !== "settle" && v.label !== "clear-effects").every((v) => v.view.celebrate === null)).toBe(true);
  });

  it("three sixes and no move: the die shows, the team reacts, the banner holds, nothing moves", () => {
    const before = state(6, [12, null, null, null], [null, null, null, null], []);
    const forfeit = state(7, [12, null, null, null], [null, null, null, null], [
      { seq: 1, type: "roll", playerId: HOST, value: 6 },
      { seq: 2, type: "forfeit", playerId: HOST },
      { seq: 3, type: "turn", playerId: BEN, reason: "three-sixes" },
    ]);
    let plan = planPlayback(before, forfeit, { reduced: false, die3d: true, characterSeats: characters });
    expect(at(plan, `cue:forfeit:${HOST}`)).toEqual([DIE3D_ROLL_MS]);
    expect(at(plan, /^cue:six/)).toEqual([]);
    expect(plan.steps.some((s) => /^(hop|land|open)/.test(s.label))).toBe(false);
    expect(at(plan, "settle")[0]).toBe(DIE3D_ROLL_MS + D.diceReveal + 1000);
    const pass = state(7, [null, null, null, null], [null, null, null, null], [
      { seq: 1, type: "roll", playerId: HOST, value: 3 },
      { seq: 2, type: "auto-pass", playerId: HOST, dice: 3 },
      { seq: 3, type: "turn", playerId: BEN, reason: "no-legal-move" },
    ]);
    plan = planPlayback(state(6, [null, null, null, null], [null, null, null, null], []), pass, { reduced: false, die3d: true, characterSeats: characters });
    expect(at(plan, `cue:no-move:${HOST}`)).toEqual([DIE3D_ROLL_MS]);
  });
});

describe("a snapshot (refresh, reconnect, a skipped version)", () => {
  it("shows the state with nothing to replay: no motion, no throw, no reaction", () => {
    const playing: Playback = {
      ...emptyPlayback(),
      cues: [{ id: 1, kind: "win", playerId: HOST, seat: 0, tokens: [], at: 1, ms: 3200 }],
      die: { value: 6, rolling: true, revealKey: 4, throw: { id: 3, value: 6, seat: 0, playerId: HOST, ms: 1150, at: 1 } },
    };
    const s = snapshot(state(3, [5, null, null, null], [null, null, null, null], [{ seq: 1, type: "roll", playerId: HOST, value: 5 }], { lastRoll: { playerId: HOST, value: 5 } }), playing);
    expect(s.cues).toEqual([]);
    expect(s.die).toEqual({ value: 5, rolling: false, revealKey: 4, throw: null });
    expect(s.motion).toEqual({});
    expect(s.busy).toBe(false);
  });
});
