// Generated classic-board diagrams are committed for review; keep them current.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLASSIC_DIAGRAMS } from "../diagram/classicDiagram.js";

const root = new URL("../../../../", import.meta.url);

describe("classic board diagrams", () => {
  for (const diagram of CLASSIC_DIAGRAMS) {
    it(`${diagram.path} is up to date (run \`npm run design:generate\`)`, () => {
      expect(readFileSync(fileURLToPath(new URL(diagram.path, root)), "utf8")).toBe(diagram.build());
    });
  }

  it("emits well-formed text (no unescaped ampersands)", () => {
    for (const diagram of CLASSIC_DIAGRAMS) expect(diagram.build()).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
  });
});
