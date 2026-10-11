// The ambient life's budgets and its governor: the city keeps its rate where
// frames are cheap, slows down where they are not, and rests (stands still)
// where even a slow rate would take more than a third of the device's time.
import { describe, expect, it } from "vitest";
import { ENV_QUALITY, affordableFps, makeThrottle } from "../ambient";

const repeat = (n: number, v: number) => Array.from({ length: n }, () => v);

describe("ambient budgets", () => {
  it("grows from Low to High and never asks for the display's full rate", () => {
    const { low, medium, high } = ENV_QUALITY;
    for (const key of ["taxis", "trams", "ferries", "pedestrians", "fps", "skyline"] as const) {
      expect(low[key]).toBeLessThanOrEqual(medium[key]);
      expect(medium[key]).toBeLessThanOrEqual(high[key]);
    }
    expect(low.sway).toBe(false);
    expect(high.fps).toBeLessThanOrEqual(30);
  });

  it("throttles updates to the asked rate however often frames are drawn", () => {
    const due = makeThrottle(10);
    let updates = 0;
    for (let t = 0; t < 2; t += 1 / 60) if (due(t)) updates++;
    expect(updates).toBeGreaterThanOrEqual(19);
    expect(updates).toBeLessThanOrEqual(21);
  });
});

describe("affordableFps", () => {
  it("keeps the rate while frames are cheap and arrive as asked", () => {
    expect(affordableFps(20, 2000, 40, repeat(40, 2))).toBe(20);
    expect(affordableFps(12, 2000, 22, repeat(22, 4))).toBe(12);
  });

  it("slows the city when each frame's main-thread work is heavy", () => {
    // 30 ms of work a frame: a third of the time allows 11 frames a second.
    expect(affordableFps(20, 2000, 40, repeat(40, 30))).toBe(11.1);
  });

  it("slows, then rests, when fewer frames arrive than were asked for (the GPU cannot keep up)", () => {
    // 20 asked a second, 10 arrived: each costs about 100 ms, so 3.3 a second.
    expect(affordableFps(20, 2000, 20, repeat(20, 5))).toBe(3.3);
    // Software WebGL: 3 frames a second arrived when 12 were asked: the city stands still rather than hold the device.
    expect(affordableFps(12, 2000, 6, repeat(6, 25))).toBe(0);
    // A burst of quickly queued, cheap-looking frames cannot hide it: the count over the window decides.
    expect(affordableFps(12, 2000, 7, repeat(7, 2))).toBe(0);
  });

  it("keeps a floor's slow pulse instead of resting, within a tenth of the device's time", () => {
    // Software WebGL: frames arrive every 250-330 ms, so the pulse is a frame every 2.5-3.3 s, not the floor's 2 a second.
    expect(affordableFps(12, 2000, 8, repeat(8, 40), 2)).toBe(0.4);
    expect(affordableFps(12, 2000, 6, repeat(6, 25), 2)).toBe(0.3);
    // 150 ms of work a frame: 0.66 a second.
    expect(affordableFps(8, 2000, 50, repeat(50, 150), 2)).toBe(0.66);
    // A smaller floor wins.
    expect(affordableFps(8, 2000, 50, repeat(50, 150), 0.5)).toBe(0.5);
    // Affordable rates are not limited by the floor.
    expect(affordableFps(8, 2000, 16, repeat(16, 2), 2)).toBe(8);
  });

  it("is never asked to run when there is nothing to run", () => {
    expect(affordableFps(0, 2000, 0, [])).toBe(0);
  });
});
