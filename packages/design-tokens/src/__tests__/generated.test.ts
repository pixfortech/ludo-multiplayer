// The palette report and sheet in docs/design/generated/ are committed so they
// can be reviewed on GitHub; this keeps them identical to the code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPaletteReport, buildPaletteSheetSvg } from "../report.js";

const generated = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../docs/design/generated/${name}`, import.meta.url)), "utf8");

describe("generated design docs", () => {
  it("palette-report.md is up to date (run `npm run design:generate`)", () => {
    expect(generated("palette-report.md")).toBe(buildPaletteReport());
  });

  it("palette-sheet.svg is up to date (run `npm run design:generate`)", () => {
    expect(generated("palette-sheet.svg")).toBe(buildPaletteSheetSvg());
  });

  it("palette-sheet.svg has no unescaped ampersands (it must parse as XML)", () => {
    expect(buildPaletteSheetSvg()).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
  });
});
