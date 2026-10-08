import { describe, expect, it } from "vitest";
import { contrastRatio, deltaE2000, hexToLab, labToHex, simulateVision } from "../color.js";

describe("colour science", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
  });

  it("matches the CIEDE2000 reference pairs (Sharma, Wu & Dalal 2005)", () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE2000([50, 2.5, 0], [50, 0, -2.5])).toBeCloseTo(4.3065, 4);
    expect(deltaE2000([50, 2.5, 0], [56, -27, -3])).toBeCloseTo(31.903, 3);
    expect(deltaE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 4);
  });

  it("round-trips sRGB ↔ Lab", () => {
    for (const hex of ["#C8102E", "#1F5FD6", "#F5BE00", "#FFFFFF", "#000000"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
    expect(hexToLab("#FFFFFF")[0]).toBeCloseTo(100, 3);
  });

  it("leaves greys unchanged under colour-vision simulation and collapses red/green for deuteranopia", () => {
    for (const v of ["protanopia", "deuteranopia", "tritanopia"] as const) {
      const grey = hexToLab(simulateVision("#808080", v));
      expect(Math.abs(grey[1]) + Math.abs(grey[2])).toBeLessThan(3);
    }
    const red = simulateVision("#FF0000", "deuteranopia");
    const green = simulateVision("#00FF00", "deuteranopia");
    expect(hexToLab(red)[2]).toBeGreaterThan(0); // both become yellow-brown
    expect(hexToLab(green)[2]).toBeGreaterThan(0);
  });
});
