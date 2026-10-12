// Who reacts to which moment, and how: only the people a moment concerns, each
// their own way, for a fixed time; the most recent moment wins.
import { describe, expect, it } from "vitest";
import type { PresentationCue } from "../../../game/presentation";
import { CUE_MS } from "../../../game/presentation";
import { reactionFor, reactionTo, type CastMember } from "../reactions";

const team = (seat: number, player: string, steps: (number | null)[]): CastMember[] => steps.map((step, tokenId) => ({ tokenKey: `${player}:${tokenId}`, seat, tokenId, step }));
const cue = (over: Partial<PresentationCue> & Pick<PresentationCue, "kind">): PresentationCue => ({ id: 1, playerId: "a", seat: 0, tokens: [], at: 1000, ms: CUE_MS[over.kind], ...over });
const red = team(0, "a", [null, null, 5, 56]);
const green = team(2, "b", [null, 12, null, null]);

describe("reactions", () => {
  it("a six: the roller's people react, each differently (a jump, a cheer, a wave, a look); nobody else", () => {
    const six = cue({ kind: "six" });
    const own = team(0, "a", [null, null, null, null]).map((m) => reactionTo(six, m));
    expect(new Set(own)).toEqual(new Set(["jump", "cheer", "wave", "look"]));
    expect(green.map((m) => reactionTo(six, m))).toEqual([null, null, null, null]);
    // The next six rotates who does what.
    const next = team(0, "a", [null, null, null, null]).map((m) => reactionTo({ ...six, id: 2 }, m));
    expect(next).not.toEqual(own);
    // A person already home does not react to a six.
    expect(reactionTo(six, red[3]!)).toBeNull();
  });

  it("a capture: only the capturer cheers", () => {
    const capture = cue({ kind: "capture", tokens: ["a:2"] });
    expect([...red, ...green].map((m) => reactionTo(capture, m))).toEqual([null, null, "cheer", null, null, null, null, null]);
  });

  it("three sixes: one of the team is upset, the others look round; no move: the same, in the base only", () => {
    const forfeit = cue({ kind: "forfeit", id: 5 });
    expect(red.map((m) => reactionTo(forfeit, m))).toEqual(["look", "upset", "look", null]);
    const none = cue({ kind: "no-move", id: 4 });
    expect(red.map((m) => reactionTo(none, m))).toEqual(["upset", "look", null, null]);
  });

  it("a teammate home: the others cheer or wave (not the one arriving); a finish: the four celebrate", () => {
    const home = cue({ kind: "home", tokens: ["a:2"] });
    const r = red.map((m) => reactionTo(home, m));
    expect(r[2]).toBeNull();
    expect(r[3]).toBeNull();
    expect(["cheer", "wave"]).toContain(r[0]);
    const finished = cue({ kind: "finished" });
    expect(team(0, "a", [56, 56, 56, 56]).every((m) => ["jump", "cheer"].includes(reactionTo(finished, m)!))).toBe(true);
  });

  it("a win: the winner's people celebrate; everyone else applauds", () => {
    const win = cue({ kind: "win" });
    expect(red.every((m) => ["jump", "cheer"].includes(reactionTo(win, m)!))).toBe(true);
    expect(green.map((m) => reactionTo(win, m))).toEqual(["wave", "wave", "wave", "wave"]);
  });

  it("lasts its cue's time; the most recent moment that concerns someone wins", () => {
    const six = cue({ kind: "six", at: 1000 });
    const capture = cue({ kind: "capture", id: 2, tokens: ["a:2"], at: 1500 });
    expect(reactionFor(red[2]!, [six, capture], 1600)).toMatchObject({ kind: "cheer", cue: 2 });
    expect(reactionFor(red[0]!, [six, capture], 1600)!.cue).toBe(1);
    expect(reactionFor(red[0]!, [six, capture], 1000 + CUE_MS.six + 1)).toBeNull();
    expect(reactionFor(red[2]!, [six, capture], 1500 + CUE_MS.capture + 1)).toBeNull();
  });
});
