// The classic-board approval relies on PNG previews (not SVG source alone).
// Ensure each preview exists, is a real PNG, and matches its SVG's size.
// Regenerate with `npm run design:png` after `npm run design:generate`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PREVIEWS = [
  "classic-board-overview",
  "classic-path-seat1-crimson",
  "classic-path-seat2-royal-blue",
  "classic-path-seat3-emerald",
  "classic-path-seat4-golden",
];
const SCALE = 1.5;
const PNG_SIGNATURE = "89504e470d0a1a0a";

describe("classic board PNG previews", () => {
  for (const name of PREVIEWS) {
    it(`${name}.png is a valid PNG rendered from the current SVG size`, () => {
      const png = readFileSync(`docs/design/generated/png/${name}.png`);
      expect(png.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
      const svgHead = readFileSync(`docs/design/generated/${name}.svg`, "utf8").slice(0, 400);
      const width = Number(/width="(\d+)"/.exec(svgHead)?.[1]);
      // Width must match exactly; height includes the renderer's bottom padding.
      expect(png.readUInt32BE(16)).toBe(Math.round(width * SCALE));
      expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(Math.round(Number(/height="(\d+)"/.exec(svgHead)?.[1]) * SCALE));
    });
  }
});
