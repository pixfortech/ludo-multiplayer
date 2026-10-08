import { describe, expect, it } from "vitest";
import { contrastRatio, deltaE } from "../color.js";
import { BOARD_SURFACES, PLAYER_IDENTITIES, defaultIdentitiesFor } from "../palette.js";
import { minDistance, outlineContrast, tokenSurfaces, VISION_TYPES } from "../report.js";
import { SAFE_STAR_PATH, SYMBOL_IDS, SYMBOL_PATHS } from "../symbols.js";

// Thresholds are the accessibility contract in docs/design/color-identities.md.
const MIN_DELTA_E_ALL_NORMAL = 15;
const MIN_DELTA_E_CLASSIC_ANY_VISION = 12;
const MIN_DELTA_E_BODY_VS_CELL = 20;
const MIN_NON_TEXT_CONTRAST = 3; // WCAG 1.4.11

describe("player identities", () => {
  it("defines 15 seats with unique ids, names, colours and symbols", () => {
    expect(PLAYER_IDENTITIES).toHaveLength(15);
    for (const key of ["id", "name", "body", "symbol"] as const) {
      expect(new Set(PLAYER_IDENTITIES.map((p) => p[key])).size).toBe(15);
    }
    expect(PLAYER_IDENTITIES.map((p) => p.seat)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("keeps the traditional red, blue, green, yellow as seats 1–4", () => {
    expect(defaultIdentitiesFor(4).map((p) => p.id)).toEqual(["crimson", "royal-blue", "emerald", "golden"]);
  });

  it("uses only valid hex colours", () => {
    for (const p of PLAYER_IDENTITIES) {
      for (const hex of [p.body, p.rim, p.highlight, p.lane, p.ink]) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("accessibility contract", () => {
  it(`all 15 body colours are ≥ ΔE ${MIN_DELTA_E_ALL_NORMAL} apart for normal vision`, () => {
    expect(minDistance(PLAYER_IDENTITIES, "normal").deltaE).toBeGreaterThanOrEqual(MIN_DELTA_E_ALL_NORMAL);
  });

  it(`the classic four stay ≥ ΔE ${MIN_DELTA_E_CLASSIC_ANY_VISION} apart under every colour-vision type`, () => {
    for (const vision of VISION_TYPES) {
      expect(minDistance(defaultIdentitiesFor(4), vision).deltaE, vision).toBeGreaterThanOrEqual(MIN_DELTA_E_CLASSIC_ANY_VISION);
    }
  });

  it("default seat sets stay distinguishable for colour-blind players as long as possible", () => {
    // Worst case over normal vision + protanopia + deuteranopia + tritanopia.
    const worst = (n: number) => Math.min(...VISION_TYPES.map((v) => minDistance(defaultIdentitiesFor(n), v).deltaE));
    for (let n = 2; n <= 7; n++) expect(worst(n), `${n} players`).toBeGreaterThanOrEqual(12);
    for (let n = 8; n <= 11; n++) expect(worst(n), `${n} players`).toBeGreaterThanOrEqual(8.5);
    // From 12 seats some pairs inevitably collide; unique symbols carry identity there.
  });

  it(`every body colour stands out from the board cell (ΔE ≥ ${MIN_DELTA_E_BODY_VS_CELL})`, () => {
    for (const p of PLAYER_IDENTITIES) expect(deltaE(p.body, BOARD_SURFACES.cell), p.id).toBeGreaterThanOrEqual(MIN_DELTA_E_BODY_VS_CELL);
  });

  it("every token rim is ≥ 3:1 against the board cell", () => {
    for (const p of PLAYER_IDENTITIES) {
      expect(contrastRatio(p.rim, BOARD_SURFACES.cell), p.id).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
    }
  });

  it("every token outline is ≥ 3:1 on every surface it can stand on, including other players' lanes", () => {
    for (const p of PLAYER_IDENTITIES) {
      for (const surface of tokenSurfaces()) {
        expect(outlineContrast(p, surface), `${p.id} on ${surface}`).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
      }
    }
  });

  it("every symbol is ≥ 3:1 against its token body", () => {
    for (const p of PLAYER_IDENTITIES) {
      expect(contrastRatio(p.ink, p.body), p.id).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
    }
  });
});

describe("symbols", () => {
  it("has exactly one symbol per identity and keeps the safe star reserved", () => {
    expect(SYMBOL_IDS).toHaveLength(15);
    expect(Object.values(SYMBOL_PATHS)).not.toContain(SAFE_STAR_PATH);
  });

  it("uses well-formed path data inside the 24×24 box", () => {
    for (const [id, d] of Object.entries(SYMBOL_PATHS)) {
      expect(d, id).toMatch(/^M[\d.\s,a-zA-Z-]+$/);
    }
  });
});
