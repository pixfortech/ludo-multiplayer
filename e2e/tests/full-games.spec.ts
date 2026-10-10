// Complete games in real browsers, from room creation to the results screen.
// Players use different devices; every action is a click or tap in the UI and
// every board is compared with the server after every action.
import { expect, test } from "@playwright/test";
import { createRoom, expectNoDuplicates, expectResults, joinRoom, openPlayer, playToEnd, seatTable, startGame } from "../support/game";

test.describe.configure({ mode: "serial" });

test("two players: room creation to victory", async ({ browser }) => {
  const aman = await openPlayer(browser, "Aman", "desktop", { reducedMotion: true });
  const ben = await openPlayer(browser, "Ben", "phone", { reducedMotion: true });
  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);

  const end = await playToEnd(table, [aman.id]);
  expect(end.game!.winnerId).toBe(aman.id);
  expect(end.room.status).toBe("finished");
  expect(end.game!.players.find((p) => p.id === aman.id)!.tokens.every((t) => t.step === 56)).toBe(true);
  // The rules this game went through, from the server's own history.
  const types = end.history.map((e) => e.type);
  for (const type of ["roll", "move", "auto-move", "bonus-roll", "home", "auto-pass", "win", "game-over"]) expect(types, `history contains ${type}`).toContain(type);
  expect(end.history.filter((e) => e.type === "home")).toHaveLength(4);
  expectNoDuplicates(table, end);
  await expectResults(table, end);
  // Reduced motion: the result without a confetti burst.
  for (const p of [aman, ben]) await expect(p.page.getByTestId("confetti")).toHaveCount(0);
});

test("three players, full ranking: every place decided, second place on a phone", async ({ browser }) => {
  const aman = await openPlayer(browser, "Aman", "wide", { reducedMotion: true });
  const ben = await openPlayer(browser, "Ben", "phone", { reducedMotion: true });
  const cara = await openPlayer(browser, "Cara", "tablet", { reducedMotion: true });
  const code = await createRoom(aman, { players: 3, fullRanking: true });
  await joinRoom(ben, code);
  await joinRoom(cara, code);
  await startGame(aman, [aman, ben, cara]);
  const table = await seatTable(code, [aman, ben, cara]);

  const end = await playToEnd(table, [aman.id, ben.id]);
  expect(end.game!.ranking).toEqual([aman.id, ben.id, cara.id]);
  expect(end.game!.winnerId).toBe(aman.id);
  expect(end.players.map((p) => [p.displayName, p.finishPlace]).sort()).toEqual([
    ["Aman", 1],
    ["Ben", 2],
    ["Cara", 3],
  ]);
  const finished = end.history.filter((e) => e.type === "player-finished");
  expect(finished.map((e) => (e.type === "player-finished" ? [e.playerId, e.place] : null))).toEqual([
    [aman.id, 1],
    [ben.id, 2],
  ]);
  expectNoDuplicates(table, end);
  await expectResults(table, end);
});

test("four players: room creation to completion", async ({ browser }) => {
  const players = [
    await openPlayer(browser, "Aman", "desktop", { reducedMotion: true }),
    await openPlayer(browser, "Ben", "phone", { reducedMotion: true }),
    await openPlayer(browser, "Cara", "tablet", { reducedMotion: true }),
    await openPlayer(browser, "Dev", "wide", { reducedMotion: true }),
  ];
  const [aman, ...guests] = players;
  const code = await createRoom(aman!, { players: 4 });
  for (const g of guests) await joinRoom(g, code);
  await startGame(aman!, players);
  const table = await seatTable(code, players);
  const seats = (await table.state()).players.map((p) => p.seat).sort();
  expect(seats).toEqual([0, 1, 2, 3]);

  // The last seat to join wins this one: turns pass clockwise through everyone.
  const winner = players[3]!;
  const end = await playToEnd(table, [winner.id]);
  expect(end.game!.winnerId).toBe(winner.id);
  const turnOrder = end.history.filter((e) => e.type === "turn").slice(0, 8).map((e) => end.players.find((p) => p.id === e.playerId)!.seat);
  expect(turnOrder.length).toBeGreaterThan(3);
  for (let i = 1; i < turnOrder.length; i++) expect(turnOrder[i]).toBe((turnOrder[i - 1]! + 1) % 4);
  expectNoDuplicates(table, end);
  await expectResults(table, end);
});
