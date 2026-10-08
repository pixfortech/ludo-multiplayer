import { describe, expect, it } from "vitest";
import { ENGINE_INFO } from "../index.js";

describe("game-engine scaffold", () => {
  it("resolves @ludo/shared-types from source", () => {
    expect(ENGINE_INFO.supportedPlayers).toEqual({ min: 2, max: 15 });
  });
});
