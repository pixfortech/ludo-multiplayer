// The game screen with a scripted client: rendering, controls and the motion
// timeline. These prove UI behaviour only; live play against the real server
// and PostgreSQL is covered in apps/server and the browser run.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { GameHistoryEntry, GameStateView, LegalMoveView } from "@ludo/shared-types";
import App from "../../App";
import { ProtocolRequestError } from "../../lib/connection";
import { actionData, gameView, player, roomView, services } from "../../test/fakes";

const ben = player({ playerId: "p-ben", displayName: "Ben", seat: 2, colour: "emerald", isHost: false });
const host = "p-host";

function inGame(me: string, game: GameStateView = gameView(), roomOver: Parameters<typeof roomView>[0] = {}) {
  const s = services();
  const room = roomView({ players: [player(), ben], status: "playing", lifecycle: "playing", ...roomOver });
  s.client.set({ seat: { roomId: room.roomId, roomCode: room.code, playerId: me }, room, game });
  render(<App services={s} initialPath="/room/ABC234" />);
  return s;
}

const tokens = (steps: (number | null)[]) => steps.map((step, id) => ({ id, step }));
const withTokens = (game: GameStateView, hostSteps: (number | null)[], benSteps: (number | null)[] = [null, null, null, null]): GameStateView => ({
  ...game,
  players: [
    { ...game.players[0]!, tokens: tokens(hostSteps) },
    { ...game.players[1]!, tokens: tokens(benSteps) },
  ],
});
const legal = (tokenId: number, from: number | null, to: number, over: Partial<LegalMoveView> = {}): LegalMoveView => ({ tokenId, from, to, opens: from === null, entersLane: false, reachesHome: false, landsOnSafeCell: from === null, captures: [], ...over });
const choosing = (dice: number, moves: LegalMoveView[], over: Partial<GameStateView> = {}): GameStateView =>
  gameView({ turn: { phase: "awaiting-move", dice, consecutiveSixes: dice === 6 ? 1 : 0, legalMoves: moves }, lastRoll: { playerId: host, value: dice }, ...over });
const step = (key: string) => screen.getByTestId(`token-${key}`).getAttribute("data-step");
const tokenState = (key: string) => screen.getByTestId(`token-${key}`).getAttribute("data-state");
const rollButton = () => screen.getAllByRole("button", { name: /Roll dice|Rolling|Waiting|Paused|Game over|Choose a token/ })[0] as HTMLButtonElement;

afterEach(() => vi.useRealTimers());

describe("game screen", () => {
  it("shows the board from server state, the players and whose turn it is", () => {
    inGame("p-ben", withTokens(gameView(), [5, null, 53, 56]));
    expect(screen.getByTestId("game-board")).toBeTruthy();
    expect(step("p-host:0")).toBe("5");
    expect(step("p-host:2")).toBe("53");
    expect(tokenState("p-host:3")).toBe("finished");
    expect(step("p-ben:1")).toBe("base");
    expect(screen.getAllByText("Aman's turn").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Waiting for Aman to roll").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("1 of 4 tokens home").length).toBeGreaterThan(0);
  });

  it("does not let the wrong player roll or move", () => {
    const s = inGame("p-ben", choosing(6, [legal(0, null, 0)]));
    for (const button of screen.getAllByRole("button", { name: "Waiting" })) expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: "r" });
    expect(within(screen.getByTestId("game-board")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByTestId("move-tray")).toBeNull();
    expect(s.client.calls.filter((c) => c.method === "rollDice" || c.method === "moveToken")).toEqual([]);
  });

  it("rolls through the server and reveals the server's value before offering moves", async () => {
    vi.useFakeTimers();
    const s = inGame(host);
    const rolled = choosing(6, [legal(0, null, 0), legal(1, null, 0)], {
      stateVersion: 1,
      recentHistory: [{ seq: 2, type: "roll", playerId: host, value: 6 }],
      historyLength: 2,
    });
    s.client.rollResults = [actionData(rolled)];
    expect(rollButton().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(rollButton());
    });
    expect(s.client.calls.map((c) => c.method)).toEqual(["rollDice"]);
    expect(screen.getAllByTestId("die")[0]!.getAttribute("data-value")).toBe("rolling");
    expect(screen.queryByTestId("move-tray")).toBeNull(); // input waits for the reveal
    await act(async () => {
      vi.advanceTimersByTime(650 + 260);
    });
    expect(screen.getAllByTestId("die")[0]!.getAttribute("data-value")).toBe("6");
    expect(screen.getAllByTestId("move-tray").length).toBeGreaterThan(0);
    expect(tokenState("p-host:0")).toBe("movable");
    expect(screen.getAllByText("Six! Move a token, then roll again").length).toBeGreaterThan(0);
  });

  it("offers exactly the server's legal tokens and sends the chosen move, moving nothing until the server answers", async () => {
    vi.useFakeTimers();
    const start = withTokens(choosing(4, [legal(2, 10, 14), legal(0, 3, 7, { captures: [{ playerId: "p-ben", tokenId: 0 }] })], { stateVersion: 3, historyLength: 6 }), [3, null, 10, null], [7, null, null, null]);
    const s = inGame(host, start);
    expect(tokenState("p-host:2")).toBe("movable");
    expect(tokenState("p-host:0")).toBe("movable");
    expect(tokenState("p-host:1")).toBe("unmovable");
    expect(tokenState("p-ben:0")).toBe("idle");
    const tray = screen.getAllByTestId("move-tray")[0]!;
    const entries = within(tray).getAllByRole("option");
    expect(entries.map((e) => e.textContent)).toEqual([expect.stringContaining("4 squares"), expect.stringContaining("Captures Ben")]);
    expect(entries[0]!.textContent).toContain("Token 3");

    // First tap previews; the second confirms.
    fireEvent.click(within(entries[0]!).getByRole("button"));
    expect(screen.getByTestId("move-preview")).toBeTruthy();
    expect(s.client.calls).toHaveLength(0);
    const moved = withTokens(gameView({ stateVersion: 4, currentPlayerId: "p-ben", currentPlayerIndex: 1, recentHistory: [{ seq: 7, type: "move", playerId: host, tokenId: 2, from: 10, to: 14, dice: 4 }], historyLength: 7 }), [3, null, 14, null], [7, null, null, null]);
    s.client.moveResults = [actionData(moved, "game:move")];
    s.client.hold = { release: () => undefined };
    await act(async () => {
      fireEvent.click(within(within(screen.getAllByTestId("move-tray")[0]!).getAllByRole("option")[0]!).getByRole("button"));
    });
    expect(s.client.calls).toEqual([{ method: "moveToken", args: [2] }]);
    expect(step("p-host:2")).toBe("10"); // no false movement before the server confirms
    expect(tokenState("p-host:2")).toBe("selected");
    await act(async () => {
      s.client.hold!.release();
    });
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(step("p-host:2")).toBe("11"); // hops cell by cell along the path (each hop is a 170 ms transition)
    await act(async () => {
      vi.advanceTimersByTime(170);
    });
    expect(step("p-host:2")).toBe("12");
    await act(async () => {
      vi.advanceTimersByTime(170 * 2 + 50);
    });
    expect(step("p-host:2")).toBe("14");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getAllByText("Ben's turn").length).toBeGreaterThan(0); // the turn changes once the move has played
  });

  it("explains a refused move and leaves the board where the server has it", async () => {
    const s = inGame(host, withTokens(choosing(2, [legal(1, 20, 22)]), [null, 20, null, null]));
    s.client.moveResults = [new ProtocolRequestError("stale-state", "stale")];
    const option = within(screen.getAllByTestId("move-tray")[0]!).getAllByRole("option")[0]!;
    fireEvent.click(within(option).getByRole("button"));
    await act(async () => {
      fireEvent.click(within(within(screen.getAllByTestId("move-tray")[0]!).getAllByRole("option")[0]!).getByRole("button", { name: /Tap again to move/ }));
    });
    expect((await screen.findAllByText("The game moved on. Showing the latest position.")).length).toBeGreaterThan(0);
    expect(step("p-host:1")).toBe("20");
  });

  it("shows an automatic move after the die: reveal, pause, then the token", async () => {
    vi.useFakeTimers();
    const s = inGame("p-ben");
    const history: GameHistoryEntry[] = [
      { seq: 2, type: "roll", playerId: host, value: 6 },
      { seq: 3, type: "auto-move", playerId: host, tokenId: 0, from: null, to: 0, dice: 6 },
      { seq: 4, type: "bonus-roll", playerId: host, reasons: ["six"] },
    ];
    const next = withTokens(gameView({ stateVersion: 1, recentHistory: history, historyLength: 4, lastRoll: { playerId: host, value: 6 }, lastAutoMove: { playerId: host, tokenId: 0, from: null, to: 0, dice: 6 } }), [0, null, null, null]);
    act(() => s.client.set({ game: next }));
    expect(screen.getAllByTestId("die")[0]!.getAttribute("data-value")).toBe("rolling");
    expect(step("p-host:0")).toBe("base");
    await act(async () => {
      vi.advanceTimersByTime(650 + 260 + 300);
    });
    expect(screen.getAllByTestId("die")[0]!.getAttribute("data-value")).toBe("6");
    expect(step("p-host:0")).toBe("base"); // the auto-move pause keeps the reveal readable
    await act(async () => {
      vi.advanceTimersByTime(50 + 320);
    });
    expect(step("p-host:0")).toBe("0");
    expect(screen.getAllByText("Aman brought token 1 out (auto)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Auto-moved: only one legal move").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Six: Aman rolls again").length).toBeGreaterThan(0);
  });

  it("returns a captured token to its base after the attacker lands", async () => {
    vi.useFakeTimers();
    const s = inGame("p-ben", withTokens(gameView({ stateVersion: 7, historyLength: 10 }), [8, null, null, null], [null, 22, null, null]));
    const history: GameHistoryEntry[] = [
      { seq: 11, type: "move", playerId: host, tokenId: 0, from: 8, to: 10, dice: 2 },
      { seq: 12, type: "capture", playerId: host, tokenId: 0, cell: 10, victimPlayerId: "p-ben", victimTokenId: 1 },
      { seq: 13, type: "bonus-roll", playerId: host, reasons: ["capture"] },
    ];
    act(() => s.client.set({ game: withTokens(gameView({ stateVersion: 8, recentHistory: history, historyLength: 13 }), [10, null, null, null], [null, null, null, null]) }));
    await act(async () => {
      vi.advanceTimersByTime(170 * 2 - 10);
    });
    expect(step("p-host:0")).toBe("10");
    expect(step("p-ben:1")).toBe("22"); // the victim waits until the attacker has landed
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(step("p-ben:1")).toBe("base");
    await act(async () => {
      vi.advanceTimersByTime(140 + 520 + 20);
    });
    expect(screen.getAllByText("Capture: Aman rolls again").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Aman captured your token").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("turn-callouts")[0]!.getAttribute("data-kind")).toBe("capture");
  });

  it("sends every token captured by one move home together, after the attacker lands", async () => {
    vi.useFakeTimers();
    const s = inGame(host, withTokens(gameView({ stateVersion: 7, historyLength: 10 }), [8, null, null, null], [null, 22, 22, null]));
    const history: GameHistoryEntry[] = [
      { seq: 11, type: "move", playerId: host, tokenId: 0, from: 8, to: 10, dice: 2 },
      { seq: 12, type: "capture", playerId: host, tokenId: 0, cell: 10, victimPlayerId: "p-ben", victimTokenId: 1 },
      { seq: 13, type: "capture", playerId: host, tokenId: 0, cell: 10, victimPlayerId: "p-ben", victimTokenId: 2 },
      { seq: 14, type: "bonus-roll", playerId: host, reasons: ["capture"] },
    ];
    act(() => s.client.set({ game: withTokens(gameView({ stateVersion: 8, recentHistory: history, historyLength: 14 }), [10, null, null, null], [null, null, null, null]) }));
    await act(async () => {
      vi.advanceTimersByTime(170 * 2 - 10);
    });
    expect([step("p-ben:1"), step("p-ben:2")]).toEqual(["22", "22"]);
    await act(async () => {
      vi.advanceTimersByTime(10 + 60);
    });
    expect([step("p-ben:1"), step("p-ben:2")], "both leave together (60 ms apart)").toEqual(["base", "base"]);
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getAllByText("Double capture: roll again").length).toBeGreaterThan(0);
    expect(screen.getAllByText("You captured Ben's 2 tokens").length).toBeGreaterThan(0);
    // Each token is drawn exactly once.
    expect(screen.getAllByTestId("token-p-ben:1")).toHaveLength(1);
  });

  it("snaps to the server's state after a refresh or missed versions, without replaying moves", () => {
    const s = inGame("p-ben", gameView({ stateVersion: 2 }));
    act(() => s.client.set({ game: withTokens(gameView({ stateVersion: 6, recentHistory: [{ seq: 9, type: "move", playerId: host, tokenId: 0, from: 0, to: 20, dice: 5 }], historyLength: 9 }), [20, null, null, null]) }));
    expect(step("p-host:0")).toBe("20");
    expect(screen.getAllByTestId("die")[0]!.getAttribute("data-value")).not.toBe("rolling");
    // The same version again (e.g. a reconnect snapshot) changes nothing.
    act(() => s.client.set({ game: withTokens(gameView({ stateVersion: 6, recentHistory: [], historyLength: 9 }), [20, null, null, null]) }));
    expect(step("p-host:0")).toBe("20");
  });

  it("shows a paused game clearly and lets the host resume a host pause", () => {
    const s = inGame(host, gameView(), { status: "paused", lifecycle: "paused", pause: { reason: "host", playerId: null, since: "2026-01-01T00:00:00.000Z" } });
    expect(screen.getByTestId("paused-overlay")).toBeTruthy();
    expect(screen.getAllByText("The host paused the game").length).toBeGreaterThan(0);
    expect(rollButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Resume game" }));
    expect(s.client.calls.map((c) => c.method)).toContain("resumeGame");
  });

  it("tells everyone who the game is waiting for after a lost connection", () => {
    inGame("p-ben", gameView(), { status: "paused", lifecycle: "paused", pause: { reason: "connection-lost", playerId: host, since: "2026-01-01T00:00:00.000Z" } });
    expect(screen.getAllByText("Waiting for Aman to reconnect").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Resume game" })).toBeNull();
  });

  it("ends with results and no further actions", () => {
    inGame(host, withTokens(gameView({ phase: "finished", currentPlayerId: null, winnerId: host, ranking: [host, "p-ben"] }), [56, 56, 56, 56]));
    expect(screen.getAllByText("You win!").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("game-results").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Roll dice" })).toBeNull();
    expect(within(screen.getByTestId("game-board")).queryAllByRole("button")).toHaveLength(0);
  });

  it("sends one roll for a double click, even before the screen re-renders", async () => {
    const s = inGame(host);
    s.client.rollResults = [actionData(gameView({ stateVersion: 1, lastRoll: { playerId: host, value: 2 }, recentHistory: [{ seq: 2, type: "roll", playerId: host, value: 2 }], historyLength: 2 }))];
    await act(async () => {
      const button = rollButton();
      button.click();
      button.click();
    });
    expect(s.client.calls.filter((c) => c.method === "rollDice")).toHaveLength(1);
  });

  it("sends one move for a double click on a move", async () => {
    vi.useFakeTimers();
    const s = inGame(host, withTokens(choosing(3, [legal(1, 4, 7), legal(2, 9, 12)]), [null, 4, 9, null]));
    s.client.moveResults = [actionData(withTokens(gameView({ stateVersion: 1, currentPlayerId: "p-ben", currentPlayerIndex: 1 }), [null, 7, 9, null]), "game:move")];
    const option = within(screen.getAllByTestId("move-tray")[0]!).getAllByRole("option")[1]!;
    fireEvent.click(within(option).getByRole("button"));
    await act(async () => {
      const button = within(within(screen.getAllByTestId("move-tray")[0]!).getAllByRole("option")[1]!).getByRole("button");
      button.click();
      button.click();
    });
    expect(s.client.calls.filter((c) => c.method === "moveToken")).toEqual([{ method: "moveToken", args: [1] }]);
  });

  it("a pause fast-forwards a move that is still playing", async () => {
    vi.useFakeTimers();
    const s = inGame("p-ben", withTokens(gameView({ stateVersion: 3, historyLength: 6 }), [10, null, null, null]));
    const moved = withTokens(gameView({ stateVersion: 4, recentHistory: [{ seq: 7, type: "move", playerId: host, tokenId: 0, from: 10, to: 15, dice: 5 }], historyLength: 7 }), [15, null, null, null]);
    act(() => s.client.set({ game: moved }));
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(Number(step("p-host:0"))).toBeLessThan(15); // still hopping
    act(() => s.client.set({ room: roomView({ players: [player(), ben], status: "paused", lifecycle: "paused", roomVersion: 9, pause: { reason: "host", playerId: null, since: "2026-01-01T00:00:00.000Z" } }) }));
    expect(step("p-host:0")).toBe("15");
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(step("p-host:0")).toBe("15");
  });

  it("advances the home counter only when the token arrives home, and offers the home bonus", async () => {
    vi.useFakeTimers();
    const s = inGame("p-ben", withTokens(gameView({ stateVersion: 4, historyLength: 8 }), [53, 56, null, null]));
    const homeCount = () => screen.getAllByTestId("home-count")[0]!.getAttribute("data-home");
    expect(homeCount()).toBe("1");
    const history: GameHistoryEntry[] = [
      { seq: 9, type: "move", playerId: host, tokenId: 0, from: 53, to: 56, dice: 3 },
      { seq: 10, type: "home", playerId: host, tokenId: 0 },
      { seq: 11, type: "bonus-roll", playerId: host, reasons: ["home"] },
    ];
    act(() => s.client.set({ game: withTokens(gameView({ stateVersion: 5, recentHistory: history, historyLength: 11 }), [56, 56, null, null]) }));
    await act(async () => {
      vi.advanceTimersByTime(170 * 2 + 300); // two hops and part of the glide home
    });
    expect(step("p-host:0")).toBe("56");
    expect(homeCount(), "not before the token has arrived").toBe("1");
    await act(async () => {
      vi.advanceTimersByTime(320);
    });
    expect(homeCount()).toBe("2");
    expect(screen.getAllByText("Home: Aman rolls again").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("turn-callouts")[0]!.getAttribute("data-kind")).toBe("home");
    expect(tokenState("p-host:0")).toBe("finished");
  });

  it("the fourth token home is a win, not another bonus", async () => {
    vi.useFakeTimers();
    const s = inGame(host, withTokens(gameView({ stateVersion: 4, historyLength: 8 }), [55, 56, 56, 56]));
    const history: GameHistoryEntry[] = [
      { seq: 9, type: "auto-move", playerId: host, tokenId: 0, from: 55, to: 56, dice: 1 },
      { seq: 10, type: "home", playerId: host, tokenId: 0 },
      { seq: 11, type: "player-finished", playerId: host, place: 1 },
      { seq: 12, type: "win", playerId: host },
      { seq: 13, type: "game-over", ranking: [host] },
    ];
    act(() => s.client.set({ game: withTokens(gameView({ stateVersion: 5, phase: "finished", currentPlayerId: null, winnerId: host, ranking: [host], recentHistory: history, historyLength: 13 }), [56, 56, 56, 56]) }));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getAllByTestId("turn-callouts")[0]!.getAttribute("data-kind")).toBe("win");
    expect(screen.queryByText(/Home: roll again/)).toBeNull();
  });

  it("announces a player finishing in a full-ranking game while play continues", async () => {
    vi.useFakeTimers();
    const s = inGame(host, withTokens(gameView({ stateVersion: 4, historyLength: 8, settings: { autoMove: true, rankingMode: "full-ranking" } }), [null, null, null, null], [55, 56, 56, 56]));
    const history: GameHistoryEntry[] = [
      { seq: 9, type: "auto-move", playerId: "p-ben", tokenId: 0, from: 55, to: 56, dice: 1 },
      { seq: 10, type: "home", playerId: "p-ben", tokenId: 0 },
      { seq: 11, type: "player-finished", playerId: "p-ben", place: 1 },
      { seq: 12, type: "win", playerId: "p-ben" },
      { seq: 13, type: "turn", playerId: host, reason: "player-finished" },
    ];
    act(() => s.client.set({ game: withTokens(gameView({ stateVersion: 5, winnerId: "p-ben", ranking: ["p-ben"], recentHistory: history, historyLength: 13, settings: { autoMove: true, rankingMode: "full-ranking" } }), [null, null, null, null], [56, 56, 56, 56]) }));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getAllByText("Ben wins!").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Play continues for the remaining places.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Your turn").length).toBeGreaterThan(0);
  });
});

