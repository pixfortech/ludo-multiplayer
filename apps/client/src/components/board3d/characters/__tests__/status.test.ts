// What the player is told about the human characters: loading, all on the board, or which failed and why.
// It must never say they are all on the board while a pawn still stands in for one of them.
import { describe, expect, it } from "vitest";
import { loadableSeats, loadOrder } from "../catalog";
import { describeCharacters, errorMessage, sameSummary, summarise, type CharacterStatus } from "../status";

const all = (status: CharacterStatus, n: number) => Array.from({ length: n }, () => ({ status }));

describe("the characters' status", () => {
  it("counts each state, and says all are on the board only when every one is ready", () => {
    const loading = summarise([...all("ready", 7), { status: "loading" as const }]);
    expect(loading).toMatchObject({ total: 8, ready: 7, loading: 1, failed: [] });
    expect(describeCharacters(loading)).toBe("Loading characters: 7 of 8 ready (pawns stand in until each arrives).");
    expect(describeCharacters(summarise(all("ready", 16)))).toBe("All 16 characters are on the board.");
    expect(describeCharacters(summarise([]))).toBeNull();
  });

  it("names the characters that failed and the actual error, and never counts them as ready", () => {
    const failure = { key: "adda", token: "p1:0", url: "/characters/adda.medium.glb", error: "404 Not Found" };
    const s = summarise([...all("ready", 7), { status: "failed", failure }]);
    expect(s.ready).toBe(7);
    expect(s.failed).toEqual([failure]);
    expect(describeCharacters(s)).toBe("1 of 8 characters could not load (adda): pawns stand in. 404 Not Found");
  });

  it("reports a change only when something changed", () => {
    const a = summarise([...all("ready", 3), { status: "loading" as const }]);
    expect(sameSummary(a, summarise([...all("ready", 3), { status: "loading" as const }]))).toBe(true);
    expect(sameSummary(a, summarise(all("ready", 4)))).toBe(false);
  });

  it("turns anything thrown into a readable message", () => {
    expect(errorMessage(new Error("Unexpected token < in JSON"))).toBe("Unexpected token < in JSON");
    expect(errorMessage("chunk failed")).toBe("chunk failed");
    expect(errorMessage({ status: 404 })).toBe('{"status":404}');
  });
});

describe("loading order with a failure", () => {
  it("moves on to the next team once a team has settled, loaded or failed (a failure never stalls the others)", () => {
    const order = loadOrder([0, 1, 2, 3], 2);
    expect(order).toEqual([2, 0, 1, 3]);
    // Team 2 settled (one of its people failed, the others loaded): team 0 may load next.
    const settled = new Set([2]);
    expect([...loadableSeats(order, (seat) => settled.has(seat))]).toEqual([2, 0]);
  });
});
