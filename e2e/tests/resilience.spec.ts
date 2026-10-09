// Refresh and reconnect during an active game, in real browsers: the board
// comes back exactly as the server has it, the right player can act, and
// nothing is sent or animated twice.
import { expect, test, type WebSocketRoute } from "@playwright/test";
import { queueDice } from "../support/control";
import { createRoom, expectNoDuplicates, joinRoom, openPlayer, readBoard, seatTable, startGame, visible } from "../support/game";

test("refresh and network loss mid-game restore the exact board without replaying moves", async ({ browser }) => {
  const aman = await openPlayer(browser, "Aman", "desktop");
  const ben = await openPlayer(browser, "Ben", "tablet");

  // Ben's WebSocket goes through a route the test can cut, like a lost network.
  let offline = false;
  const routes = new Set<WebSocketRoute>();
  await ben.page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (offline) {
      void ws.close({ code: 1006, reason: "network down" });
      return;
    }
    ws.connectToServer();
    routes.add(ws);
  });

  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  const A0 = `token-${aman.id}:0`;

  await table.act(6, () => 0);
  await table.act(4);
  expect((await table.state()).game!.currentPlayerId).toBe(ben.id);

  // Ben refreshes on his own turn: same board, and he can still roll.
  await ben.page.reload();
  await table.expectInSync();
  await table.act(6, () => 0);
  await table.act(2);

  // Aman refreshes while his roll is still animating: the roll counts once, the board comes back exact.
  await queueDice(5);
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).click();
  table.rolls++;
  await aman.page.reload();
  let snap = await table.expectInSync();
  expect(snap.events.filter((e) => e.actionType === "game:roll")).toHaveLength(table.rolls);
  expect((await readBoard(aman.page))[A0]).toBe("9");

  await table.act(1); // Ben: his token moves (auto); Aman's turn

  // Ben loses the network. Aman keeps playing; Ben's controls are disabled meanwhile.
  await ben.page.evaluate((key) => {
    const w = window as unknown as { __steps: string[] };
    w.__steps = [];
    const el = document.querySelector(`[data-testid="${key}"]`)!;
    new MutationObserver(() => w.__steps.push(el.getAttribute("data-step")!)).observe(el, { attributes: true, attributeFilter: ["data-step"] });
  }, A0);
  offline = true;
  table.offline.add(ben);
  for (const ws of routes) void ws.close({ code: 1006, reason: "network down" });
  routes.clear();
  await expect(visible(ben.page.getByText(/Reconnecting|Offline/))).toBeVisible();
  await table.act(6, () => 0); // 9 → 15, six: Aman again
  await table.act(3); // 15 → 18, turn passes to Ben
  expect((await readBoard(ben.page))[A0], "Ben's board waits for the server").toBe("9");
  await expect(ben.page.getByRole("button", { name: "Roll dice" })).toHaveCount(0);

  // The network returns: Ben's seat re-attaches by itself and the board snaps to the server's state.
  offline = false;
  table.offline.delete(ben);
  snap = await table.expectInSync();
  expect(snap.game!.currentPlayerId).toBe(ben.id);
  const steps = await ben.page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);
  expect(steps, "no hop-by-hop replay of the missed moves").toEqual(["18"]);
  await expect(visible(ben.page.getByText("Reconnected: your seat is back"))).toBeVisible();

  // And play carries on normally.
  await table.act(1);
  await table.act(2);
  snap = await table.expectInSync();
  expectNoDuplicates(table, snap);
  for (const p of [aman, ben]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
});
