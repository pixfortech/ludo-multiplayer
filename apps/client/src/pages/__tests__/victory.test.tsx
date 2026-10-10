// The victory screen with a scripted client (UI behaviour only; the live
// end of a real game is covered by the browser tests).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GameActionView, GameHistoryEntry, GameStateView } from "@ludo/shared-types";
import App from "../../App";
import { gameView, player, roomView, services } from "../../test/fakes";

const ben = player({ playerId: "p-ben", displayName: "Ben", seat: 2, colour: "emerald", isHost: false });
const cara = player({ playerId: "p-cara", displayName: "Cara", seat: 1, colour: "azure", isHost: false });
const host = "p-host";
const tokens = (steps: (number | null)[]) => steps.map((step, id) => ({ id, step }));

function finishedGame(over: Partial<GameStateView> = {}): GameStateView {
  return gameView({
    phase: "finished",
    currentPlayerId: null,
    winnerId: host,
    ranking: [host],
    players: [
      { id: host, seat: 0, tokens: tokens([56, 56, 56, 56]), finished: true },
      { id: "p-ben", seat: 2, tokens: tokens([56, 20, null, null]), finished: false },
    ],
    ...over,
  });
}

function inGame(me: string, game: GameStateView, players = [player(), ben]) {
  const s = services();
  const room = roomView({ players, status: game.phase === "finished" ? "finished" : "playing", lifecycle: game.phase === "finished" ? "finished" : "playing" });
  s.client.set({ seat: { roomId: room.roomId, roomCode: room.code, playerId: me }, room, game });
  render(<App services={s} initialPath="/room/ABC234" />);
  return s;
}

const history: GameActionView[] = [
  { seq: 1, type: "game:start", playerId: host, stateVersion: 0, at: "2026-01-01T10:00:00.000Z", dice: null, tokenId: null, entries: [] },
  { seq: 2, type: "game:roll", playerId: host, stateVersion: 1, at: "2026-01-01T10:06:00.000Z", dice: 6, tokenId: null, entries: [{ seq: 2, type: "roll", playerId: host, value: 6 }, { seq: 3, type: "capture", playerId: host, tokenId: 0, cell: 4, victimPlayerId: "p-ben", victimTokenId: 1 }, { seq: 4, type: "turn", playerId: "p-ben", reason: "move-complete" }] },
  { seq: 3, type: "game:roll", playerId: "p-ben", stateVersion: 2, at: "2026-01-01T10:18:00.000Z", dice: 2, tokenId: null, entries: [{ seq: 5, type: "roll", playerId: "p-ben", value: 2 }] },
];

afterEach(() => vi.useRealTimers());

describe("victory screen", () => {
  it("after a refresh, shows the result at once, without confetti, with focus on the title", async () => {
    const s = inGame(host, finishedGame());
    s.client.historyResult = history;
    const dialog = await screen.findByRole("dialog", { name: "You win!" });
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "You win!" }));
    expect(screen.queryByTestId("confetti")).toBeNull();
    expect(within(dialog).getByText("Game complete")).toBeTruthy();
  });

  it("summarises only what the authoritative log shows", async () => {
    const s = services();
    s.client.historyResult = history;
    const room = roomView({ players: [player(), ben], status: "finished", lifecycle: "finished" });
    s.client.set({ seat: { roomId: room.roomId, roomCode: room.code, playerId: host }, room, game: finishedGame() });
    render(<App services={s} initialPath="/room/ABC234" />);
    const summary = await screen.findByTestId("game-summary");
    expect(within(summary).getByText("18 min")).toBeTruthy();
    expect(within(summary).getByText("Turns").nextSibling?.textContent).toBe("2");
    expect(within(summary).getByText("Captures").nextSibling?.textContent).toBe("1");
    expect(within(summary).getByText("Tokens home").nextSibling?.textContent).toBe("5/8");
    expect(s.client.calls.some((c) => c.method === "fullHistory")).toBe(true);
  });

  it("leaves the summary out when the log cannot be loaded, and still offers every action", async () => {
    const s = services();
    s.client.historyResult = new Error("offline");
    const room = roomView({ players: [player(), ben], status: "finished", lifecycle: "finished" });
    s.client.set({ seat: { roomId: room.roomId, roomCode: room.code, playerId: "p-ben" }, room, game: finishedGame() });
    render(<App services={s} initialPath="/room/ABC234" />);
    const dialog = await screen.findByRole("dialog", { name: "Aman wins!" });
    await waitFor(() => expect(within(dialog).queryByText(/Loading the game summary/)).toBeNull());
    expect(within(dialog).queryByTestId("game-summary")).toBeNull();
    expect(within(dialog).getByRole("link", { name: /New game/ }).getAttribute("href")).toBe("/create");
    expect(within(dialog).getByRole("link", { name: /Return home/ }).getAttribute("href")).toBe("/");
  });

  it("first-winner games rank the winner and list the others unranked", async () => {
    inGame(host, finishedGame());
    const rows = within(await screen.findByTestId("victory-ranking")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/^1st.*You.*4\/4 home/), expect.stringMatching(/^–.*Ben.*1\/4 home/)]);
    expect(screen.getByText(/other places are not ranked/)).toBeTruthy();
  });

  it("full-ranking games show every place in the server's order", async () => {
    const game = finishedGame({
      settings: { autoMove: true, rankingMode: "full-ranking" },
      ranking: [host, "p-cara", "p-ben"],
      players: [
        { id: host, seat: 0, tokens: tokens([56, 56, 56, 56]), finished: true },
        { id: "p-cara", seat: 1, tokens: tokens([56, 56, 56, 56]), finished: true },
        { id: "p-ben", seat: 2, tokens: tokens([56, 30, null, null]), finished: false },
      ],
    });
    inGame("p-ben", game, [player(), cara, ben]);
    const rows = within(await screen.findByTestId("victory-ranking")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent?.slice(0, 3))).toEqual(["1st", "2nd", "3rd"]);
    expect(rows[2]!.textContent).toContain("You");
    expect(screen.getByText("Final ranking")).toBeTruthy();
  });

  it("Escape (or View board) returns to the board, and Show results reopens it", async () => {
    inGame(host, finishedGame());
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Show results" })[0]!);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "View board" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("after a live finish, opens once the final move has played, with one confetti burst", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const s = inGame(host, gameView({ stateVersion: 9, historyLength: 20, players: [{ id: host, seat: 0, tokens: tokens([55, 56, 56, 56]), finished: false }, { id: "p-ben", seat: 2, tokens: tokens([null, null, null, null]), finished: false }] }));
    const entries: GameHistoryEntry[] = [
      { seq: 21, type: "roll", playerId: host, value: 1 },
      { seq: 22, type: "auto-move", playerId: host, tokenId: 0, from: 55, to: 56, dice: 1 },
      { seq: 23, type: "home", playerId: host, tokenId: 0 },
      { seq: 24, type: "player-finished", playerId: host, place: 1 },
      { seq: 25, type: "win", playerId: host },
      { seq: 26, type: "game-over", ranking: [host] },
    ];
    act(() => s.client.set({ game: finishedGame({ stateVersion: 10, recentHistory: entries, historyLength: 26 }) }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole("dialog"), "not before the last token is home").toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(await screen.findByRole("dialog", { name: "You win!" })).toBeTruthy();
    expect(await screen.findByTestId("confetti")).toBeTruthy();
  });
});
