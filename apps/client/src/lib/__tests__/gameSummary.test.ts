import { describe, expect, it } from "vitest";
import type { GameActionView } from "@ludo/shared-types";
import { gameView } from "../../test/fakes";
import { formatDuration, summarise } from "../gameSummary";

const action = (seq: number, at: string, entries: GameActionView["entries"]): GameActionView => ({ seq, type: "game:roll", playerId: null, stateVersion: seq, at, dice: null, tokenId: null, entries });

describe("game summary", () => {
  it("counts only what the authoritative log and final state show", () => {
    const game = gameView({
      phase: "finished",
      ranking: ["p-host", "p-ben"],
      players: [
        { id: "p-host", seat: 0, tokens: [56, 56, 56, 56].map((step, id) => ({ id, step })), finished: true },
        { id: "p-ben", seat: 2, tokens: [56, 10, null, null].map((step, id) => ({ id, step })), finished: false },
      ],
    });
    const actions = [
      action(1, "2026-01-01T10:00:00.000Z", []),
      action(2, "2026-01-01T10:00:05.000Z", [
        { seq: 2, type: "roll", playerId: "p-host", value: 6 },
        { seq: 3, type: "capture", playerId: "p-host", tokenId: 0, cell: 10, victimPlayerId: "p-ben", victimTokenId: 1 },
      ]),
      action(3, "2026-01-01T10:12:00.000Z", [
        { seq: 4, type: "roll", playerId: "p-ben", value: 2 },
        { seq: 5, type: "turn", playerId: "p-host", reason: "move-complete" },
      ]),
    ];
    const s = summarise(actions, game);
    expect(s.durationMs).toBe(12 * 60_000);
    expect(s).toMatchObject({ turns: 2, rolls: 2, captures: 1, tokensHome: 5 });
    expect(s.players[0]).toMatchObject({ playerId: "p-host", place: 1, home: 4, captures: 1, sixes: 1, rolls: 1 });
    expect(s.players[1]).toMatchObject({ playerId: "p-ben", place: 2, home: 1, lostTokens: 1, captures: 0 });
  });

  it("leaves the duration out when it cannot be derived", () => {
    expect(summarise([], gameView()).durationMs).toBeNull();
  });

  it("formats durations plainly", () => {
    expect(formatDuration(45_000)).toBe("45 s");
    expect(formatDuration(12 * 60_000)).toBe("12 min");
    expect(formatDuration(65 * 60_000)).toBe("1 h 05 min");
  });
});
