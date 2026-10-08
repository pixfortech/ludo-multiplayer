// The engine imports "@ludo/board-layouts/topology"; it must stay free of
// geometry and visual dependencies so rules never depend on rendering.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("topology module purity", () => {
  it("imports nothing but @ludo/shared-types", () => {
    const source = readFileSync(fileURLToPath(new URL("../topology.ts", import.meta.url)), "utf8");
    const imports = [...source.matchAll(/^import[^;]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
    expect(imports).toEqual(["@ludo/shared-types"]);
  });
});
