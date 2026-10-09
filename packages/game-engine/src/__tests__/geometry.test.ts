// 20. Reviewed-path alignment with the approved geometry.
//
// Plays each colour's sample journey through the engine and checks every
// landing cell against the APPROVED reference (docs/design/generated/
// classic-reference.md, approved at fd71ef1). Expected cells are literals.

import { describe, expect, it } from "vitest";
import { CLASSIC_TOPOLOGY } from "@ludo/board-layouts/topology";
import { cellKey, classicSeatPath } from "@ludo/board-layouts";
import { current, newGame, place, roll } from "./fixtures.js";
import type { GameState } from "../types.js";

const ROLLS = [6, 6, 5, 6, 4, 6, 5, 6, 3, 6, 3, 2, 4];
const EXPECTED_STEPS = [0, 6, 11, 17, 21, 27, 32, 38, 41, 47, 50, 52, 56];

/** Approved landing cells per colour for the sample journey (last = home triangle cell). */
const APPROVED: Record<string, string[]> = {
  crimson: ["r6c1", "r4c6", "r0c7", "r5c8", "r6c12", "r8c12", "r10c8", "r14c6", "r11c6", "r8c2", "r7c0", "r7c2", "r7c6"],
  blue: ["r1c8", "r6c10", "r7c14", "r8c9", "r12c8", "r12c6", "r8c4", "r6c0", "r6c3", "r2c6", "r0c7", "r2c7", "r6c7"],
  emerald: ["r8c13", "r10c8", "r14c7", "r9c6", "r8c2", "r6c2", "r4c6", "r0c8", "r3c8", "r6c12", "r7c14", "r7c12", "r7c8"],
  golden: ["r13c6", "r8c4", "r7c0", "r6c5", "r2c6", "r2c8", "r6c10", "r8c14", "r8c11", "r12c8", "r14c7", "r12c7", "r8c7"],
};
const SEATS = ["crimson", "blue", "emerald", "golden"];

function cellOf(state: GameState, playerId: string): string {
  const player = state.players.find((p) => p.id === playerId)!;
  const step = player.tokens[0]!.step!;
  const path = classicSeatPath(player.seat);
  if (step <= CLASSIC_TOPOLOGY.lastTrackStep) return cellKey(path.track[step]!);
  if (step < CLASSIC_TOPOLOGY.finishStep) return cellKey(path.lane[step - CLASSIC_TOPOLOGY.lastTrackStep - 1]!);
  return cellKey(path.finish);
}

describe.each(SEATS.map((id, seat) => [id, seat] as const))("%s sample journey through the engine", (id, seat) => {
  it("lands on every approved cell and finishes at step 56", () => {
    // Tokens 1–3 already home, so token 0 is the only one in play (auto-move).
    let state = place(newGame(4, {}, seat), { [id]: [null, 56, 56, 56] });
    const landed: string[] = [];
    const stepsSeen: number[] = [];
    for (const value of ROLLS) {
      while (current(state) !== id) state = roll(state, 1); // others are all in base: auto-pass
      state = roll(state, value);
      stepsSeen.push(state.players.find((p) => p.id === id)!.tokens[0]!.step!);
      landed.push(cellOf(state, id));
    }
    expect(stepsSeen).toEqual(EXPECTED_STEPS);
    expect(landed).toEqual(APPROVED[id]);
    expect(state.phase).toBe("finished");
    expect(state.winnerId).toBe(id);
  });
});

describe("engine uses the approved topology", () => {
  it("finish step 56, 52-cell clockwise track, starts 0/13/26/39, 8 safe cells", () => {
    expect(CLASSIC_TOPOLOGY).toMatchObject({ trackLength: 52, lastTrackStep: 50, finishStep: 56, startIndex: [0, 13, 26, 39] });
    expect(CLASSIC_TOPOLOGY.safeIndices).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
  });
});
