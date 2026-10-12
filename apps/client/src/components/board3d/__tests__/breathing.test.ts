// The movable ring breathes at the display rate only while frames are cheap: a slow frame pauses it (the
// ring stays) so a choice left open never holds a slow device rendering back to back.
import { describe, expect, it } from "vitest";
import { Breathing } from "../Tokens3D";

describe("Breathing", () => {
  it("asks for every frame while frames arrive quickly", () => {
    const b = new Breathing();
    for (let i = 0; i < 100; i++) expect(b.affordable(0.016, i * 16)).toBe(true);
  });

  it("pauses for a few seconds after a slow frame it asked for, then tries again", () => {
    const b = new Breathing();
    expect(b.affordable(0.016, 0)).toBe(true);
    expect(b.affordable(0.6, 600)).toBe(false); // the frame it asked for took 600 ms
    expect(b.affordable(0.016, 2000)).toBe(false);
    expect(b.affordable(0.016, 4700)).toBe(true);
  });

  it("does not mistake a pause in rendering (nothing asked) for a slow frame", () => {
    const b = new Breathing();
    // The first frame after the board rested for 5 s.
    expect(b.affordable(5, 5000)).toBe(true);
    expect(b.affordable(0.016, 5016)).toBe(true);
  });
});
