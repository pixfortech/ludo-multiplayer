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
  it("keeps the rate while frames are cheap and on time (vsync jitter included)", () => {
    expect(affordableFps(20, [...repeat(6, 50), ...repeat(6, 66.7)], repeat(12, 2))).toBe(20);
    expect(affordableFps(12, [...repeat(6, 83.3), ...repeat(6, 100)], repeat(12, 4))).toBe(12);
  });

  it("waits for enough frames before deciding", () => {
    expect(affordableFps(20, repeat(5, 400), repeat(5, 60))).toBe(20);
  });

  it("slows the city when each frame's main-thread work is heavy", () => {
    // 30 ms of work a frame: a third of the time allows 11 frames a second.
    expect(affordableFps(20, repeat(12, 50), repeat(12, 30))).toBe(11.1);
  });

  it("slows, then rests, when frames arrive late because the GPU cannot keep up", () => {
    // Frames every 100 ms when 50 were asked for: each costs about 100 ms, so 3.3 a second.
    expect(affordableFps(20, repeat(12, 100), repeat(12, 5))).toBe(3.3);
    // Software WebGL at a quarter of a second a frame: the city stands still rather than hold the device.
    expect(affordableFps(12, repeat(12, 250), repeat(12, 33))).toBe(0);
  });

  it("is never asked to run when there is nothing to run", () => {
    expect(affordableFps(0, repeat(12, 250), repeat(12, 33))).toBe(0);
  });
});
