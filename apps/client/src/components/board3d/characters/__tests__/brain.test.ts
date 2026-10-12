// The characters' presentation logic: states come only from the token and the
// playback's motions, the walk follows the exact cells at a steady pace with
// its clip speed matched to the ground (no foot sliding), and the base
// routine gives each character its own activity and pairs a talker with a
// listener.
import { describe, expect, it } from "vitest";
import { tokenPositionToWorld } from "@ludo/board-layouts";
import { CAPTURE_DISMAY, HOME_ARRIVE, OPEN_EXCITED, RUN_ABOVE, decide, groundSpeed, sceneAt, turnToward, waiting, walkPosition, yawToward, type CharacterInputs, type Gait } from "../brain";
import { CHARACTERS, CHARACTER_HEIGHT, CHARACTER_TEAMS, characterFor, characterScale, characterSeats, loadableSeats, loadOrder, routinePhase } from "../catalog";

const gait: Gait = { walkSpeed: 1.6, runSpeed: 3.0, scale: 0.55 };
const base: CharacterInputs = { behaviour: "adda", where: "base", token: "idle", travel: null, turnAge: null, time: 0 };

describe("character identities", () => {
  it("gives each of Kolkata's four seats its own team of four: sixteen different people, and nothing in other cities", () => {
    const all = [0, 1, 2, 3].flatMap((seat) => [0, 1, 2, 3].map((t) => characterFor("kolkata", seat, t)));
    expect(all.every((k) => k !== null)).toBe(true);
    expect(new Set(all).size).toBe(16);
    expect([0, 1, 2, 3].map((t) => characterFor("kolkata", 0, t))).toEqual(["adda", "tea", "newspaper", "exercise"]);
    expect(characterFor("kolkata", 4, 0)).toBeNull();
    for (const city of ["delhi", "mumbai", "chennai", "bengaluru", "classic"] as const) expect(characterFor(city, 0, 0)).toBeNull();
    expect(characterFor(null, 0, 0)).toBeNull();
    expect([...characterSeats("kolkata")]).toEqual([0, 1, 2, 3]);
    expect([...characterSeats("delhi")]).toEqual([]);
  });

  it("gives every team the same four roles in token order (so the routine pairs them), numbered 1 to 4", () => {
    for (const seat of [0, 1, 2, 3]) {
      const team = CHARACTER_TEAMS.kolkata![seat]!;
      expect(team.map((k) => CHARACTERS[k]!.idle), `seat ${seat}`).toEqual(["adda", "tea", "newspaper", "exercise"]);
      expect(team.map((k) => CHARACTERS[k]!.number), `seat ${seat}`).toEqual([1, 2, 3, 4]);
      expect(team.map((k) => CHARACTERS[k]!.prop), `seat ${seat}`).toEqual([null, "cup", "newspaper", null]);
    }
  });

  it("gives each character its number, its own way of waiting, every clip it needs, and three levels of detail", () => {
    const needed = ["idle", "talk", "listen", "drink", "stretch", "exercise", "look_around", "wave", "excited", "walk", "run", "read", "dismay"];
    const numbers = new Set<number>();
    const heights: number[] = [];
    for (const key of Object.values(CHARACTER_TEAMS.kolkata!).flatMap((t) => t ?? [])) {
      const c = CHARACTERS[key]!;
      numbers.add(c.number);
      for (const clip of needed) expect(c.clips[clip], `${key} ${clip}`).toBeTruthy();
      expect(c.clips.walk!.speed).toBeGreaterThan(0.8);
      expect(c.levels.low.triangles).toBeLessThan(c.levels.medium.triangles);
      expect(c.levels.medium.triangles).toBeLessThan(c.levels.high.triangles);
      expect(c.height).toBeGreaterThan(1.3);
      // Few draw calls a character: team, skin, hair, eyes, and every plain colour in one.
      expect(c.materials, `${key} materials`).toBeLessThanOrEqual(6);
      heights.push(characterScale(key) * c.height);
    }
    // One scale for everyone: heights differ as people's do, within what the board can show without hiding a cell.
    expect(new Set(Object.values(CHARACTER_TEAMS.kolkata!).flatMap((t) => t ?? []).map((k) => characterScale(k))).size).toBe(1);
    expect(Math.max(...heights)).toBeLessThan(1.05);
    expect(Math.min(...heights)).toBeGreaterThan(0.7);
    expect(heights.reduce((a, b) => a + b, 0) / heights.length).toBeGreaterThan(CHARACTER_HEIGHT - 0.1);
    expect([...numbers].sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(CHARACTER_TEAMS.kolkata![0]!.map((k) => CHARACTERS[k]!.idle)).size).toBe(4);
  });

  it("starts each team's routine at a different point, so the bases are not doing the same thing at once", () => {
    const phases = [0, 1, 2, 3].map(routinePhase);
    expect(new Set(phases).size).toBe(4);
    let apart = 0;
    for (let t = 0; t < 120; t += 1) if (new Set(phases.map((p) => sceneAt(t + p))).size > 1) apart++;
    expect(apart, "seconds in two minutes when the bases differ").toBeGreaterThan(80);
  });

  it("loads one team at a time, the player's own first, then the others by seat", () => {
    expect(loadOrder([0, 0, 2, 1, 3], 2)).toEqual([2, 0, 1, 3]);
    expect(loadOrder([0, 2], null)).toEqual([0, 2]);
    const order = loadOrder([0, 1, 2, 3], 1);
    expect([...loadableSeats(order, () => false)]).toEqual([1]);
    expect([...loadableSeats(order, (s) => s === 1)]).toEqual([1, 0]);
    expect([...loadableSeats(order, (s) => s !== 3)]).toEqual([1, 0, 2, 3]);
    expect([...loadableSeats(order, () => true)]).toEqual([1, 0, 2, 3]);
  });
});

describe("the base routine", () => {
  it("pairs the storyteller and the tea lover in a chat (one talks, the other listens, facing each other)", () => {
    let chats = 0;
    for (let t = 0; t < 120; t += 0.5) {
      const adda = waiting("adda", t);
      const tea = waiting("tea", t);
      if (adda.clip === "talk") {
        chats++;
        expect(adda.partner).toBe("tea");
        expect(["listen", "drink"]).toContain(tea.clip);
        expect(tea.partner).toBe("adda");
      }
    }
    expect(chats).toBeGreaterThan(20);
  });

  it("keeps each character to its own activities, varying over time rather than one loop", () => {
    const seen = (b: "adda" | "tea" | "newspaper" | "exercise") => new Set(Array.from({ length: 240 }, (_, i) => waiting(b, i * 0.5).clip));
    expect(seen("newspaper")).toEqual(new Set(["read", "look_around"]));
    expect(seen("exercise")).toEqual(new Set(["stretch", "exercise", "idle"]));
    expect(seen("tea")).toContain("drink");
    expect(seen("adda")).toContain("talk");
    expect(new Set(Array.from({ length: 50 }, (_, i) => sceneAt(i * 1.3))).size).toBeGreaterThan(2);
  });

  it("shows the prop only while it is used (the cup while drinking, the paper while reading)", () => {
    for (let t = 0; t < 60; t += 1) {
      const tea = decide({ ...base, behaviour: "tea", time: t }, gait);
      expect(tea.prop).toBe(tea.clip === "drink");
      const reader = decide({ ...base, behaviour: "newspaper", time: t }, gait);
      expect(reader.prop).toBe(reader.clip === "read");
    }
  });
});

describe("states from gameplay (never invented)", () => {
  it("notices its turn, then waits selectable; selected; idle on the board; finished at home", () => {
    expect(decide({ ...base, turnAge: 0.3, token: "movable" }, gait)).toMatchObject({ state: "turnAlert", clip: "look_around" });
    expect(decide({ ...base, turnAge: 3, token: "movable" }, gait)).toMatchObject({ state: "selectable", clip: "idle" });
    expect(decide({ ...base, token: "selected" }, gait)).toMatchObject({ state: "selected" });
    expect(decide({ ...base, where: "board" }, gait)).toMatchObject({ state: "idle", clip: "idle" });
    expect(decide({ ...base, where: "home", token: "finished" }, gait)).toMatchObject({ state: "finished" });
  });

  it("leaves the base only on an open motion: an excited jump first, then the walk", () => {
    const at = (progress: number) => decide({ ...base, travel: { kind: "open", progress, groundSpeed: 1.2 } }, gait);
    expect(at(0.1)).toMatchObject({ state: "excited", clip: "excited", loop: false });
    expect(at(OPEN_EXCITED + 0.05)).toMatchObject({ state: "leavingBase", clip: "walk" });
    // Without a motion it never leaves, whatever the token's state.
    for (const token of ["idle", "movable", "selected", "unmovable"] as const) expect(decide({ ...base, token }, gait).state).not.toBe("leavingBase");
  });

  it("is caught (dismay) and returns to base on a capture motion; celebrates on reaching home", () => {
    expect(decide({ ...base, where: "board", travel: { kind: "capture", progress: 0.2, groundSpeed: 0 } }, gait)).toMatchObject({ state: "captured", clip: "dismay" });
    expect(decide({ ...base, where: "base", travel: { kind: "capture", progress: CAPTURE_DISMAY + 0.1, groundSpeed: 0 } }, gait)).toMatchObject({ state: "returningToBase" });
    expect(decide({ ...base, where: "home", travel: { kind: "home", progress: 0.3, groundSpeed: 1.3 } }, gait)).toMatchObject({ state: "reachingHome", clip: "walk" });
    expect(decide({ ...base, where: "home", travel: { kind: "home", progress: HOME_ARRIVE + 0.1, groundSpeed: 1.3 } }, gait)).toMatchObject({ state: "celebrating", clip: "excited" });
  });

  it("walks or runs with the clip's speed matched to the ground (no foot sliding)", () => {
    const walk = decide({ ...base, where: "board", travel: { kind: "hop", progress: 0.5, groundSpeed: 1.4 } }, gait);
    expect(walk.clip).toBe("walk");
    expect(walk.timeScale * gait.walkSpeed * gait.scale).toBeCloseTo(1.4, 6);
    const run = decide({ ...base, where: "board", travel: { kind: "hop", progress: 0.5, groundSpeed: RUN_ABOVE + 0.5 } }, gait);
    expect(run.clip).toBe("run");
    expect(run.timeScale * gait.runSpeed * gait.scale).toBeCloseTo(RUN_ABOVE + 0.5, 6);
  });
});

describe("walking along the board", () => {
  it("follows each step straight from cell to cell, at a constant pace, never cutting a corner", () => {
    // Steps 3 -> 4 -> 5 -> 6 of seat 0, then round the corner.
    for (let step = 3; step < 12; step++) {
      const a = tokenPositionToWorld(0, step);
      const b = tokenPositionToWorld(0, step + 1);
      expect(Math.hypot(b.x - a.x, b.z - a.z), "neighbouring cells").toBeLessThan(1.5);
      let last = a;
      for (let i = 1; i <= 10; i++) {
        const p = walkPosition("hop", a, b, i / 10);
        // On the segment between the two cells.
        const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
        expect(Math.abs(cross)).toBeLessThan(1e-9);
        // Equal distance each tenth: a steady pace.
        expect(Math.hypot(p.x - last.x, p.z - last.z)).toBeCloseTo(Math.hypot(b.x - a.x, b.z - a.z) / 10, 9);
        last = p;
      }
      expect(walkPosition("hop", a, b, 1)).toEqual(b);
    }
  });

  it("stays put while excited, then walks to the start cell; arrives home before celebrating", () => {
    const from = { x: -5, z: -5 };
    const to = { x: -6, z: -1 };
    expect(walkPosition("open", from, to, OPEN_EXCITED * 0.9)).toEqual(from);
    expect(walkPosition("open", from, to, 1)).toEqual(to);
    expect(walkPosition("home", from, to, HOME_ARRIVE)).toEqual(to);
    expect(groundSpeed("open", from, to, 1500)).toBeCloseTo(Math.hypot(1, 4) / (1.5 * (1 - OPEN_EXCITED)), 9);
  });

  it("turns toward its way the short way round, a little at a time", () => {
    expect(yawToward({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0);
    expect(yawToward({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // through pi, not the long way
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
  });
});
