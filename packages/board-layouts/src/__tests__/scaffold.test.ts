import { describe, expect, it } from "vitest";
import { boardShapeFor } from "../index.js";

describe("board-layouts scaffold", () => {
  it("resolves @ludo/shared-types from source", () => {
    expect(boardShapeFor(4)).toBe("square");
    expect(boardShapeFor(2)).toBe("rectangle");
  });
});
