import { describe, expect, it } from "vitest";
import { PLAYER_COLOURS } from "@ludo/shared-types";
import { PLAYER_IDENTITIES } from "../palette.js";

// The server allocates colours from @ludo/shared-types; the client draws them
// from this palette. They must name the same identities in the same seat order.
describe("palette ↔ shared colour ids", () => {
  it("lists the same ids and names in the same order", () => {
    expect(PLAYER_IDENTITIES.map((p) => ({ id: p.id, name: p.name }))).toEqual(PLAYER_COLOURS.map((c) => ({ id: c.id, name: c.name })));
  });
});
