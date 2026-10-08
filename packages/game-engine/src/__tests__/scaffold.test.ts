import { describe, expect, it } from "vitest";
import { CLASSIC_TOPOLOGY, topologyFor } from "@ludo/board-layouts/topology";
import { ENGINE_INFO } from "../index.js";

describe("game-engine scaffold", () => {
  it("resolves @ludo/shared-types from source", () => {
    expect(ENGINE_INFO.supportedPlayers).toEqual({ min: 2, max: 15 });
  });

  it("consumes board topology from the shared module (no duplicated indices)", () => {
    expect(CLASSIC_TOPOLOGY.finishStep).toBe(56);
    expect(topologyFor(15).trackLength).toBe(75);
  });
});
