// An old game resumed by someone new: a player is offline, a newcomer opens the invite link and asks to take
// over their seat, the host agrees, and the newcomer carries on with the same tokens, colour and turn under
// their own name. The absent player's saved seat no longer works.
import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible, type Player } from "../support/game";

test("a newcomer takes over an offline player's seat with the host's approval, and plays on in their place", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const aman = await openPlayer(browser, "Aman", "desktop");
  const ben = await openPlayer(browser, "Ben", "phone");
  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  await table.act(6, () => 0); // Aman opens a token
  await table.act(3);
  const benId = ben.id;
  const benTokensBefore = (await table.state()).game!.players.find((p) => p.id === benId)!.tokens;

  // Ben goes away: his tab closes (his browser keeps his saved seat).
  await ben.page.close();
  await expect.poll(async () => (await table.state()).players.find((p) => p.id === benId)!.connectionStatus, { message: "Ben is offline" }).toBe("disconnected");

  // Dev opens the invite link: the game is in progress, Ben's seat can be taken over.
  const dev: Player = await openPlayer(browser, "Dev", "desktop");
  await dev.page.goto(`/join/${code}`);
  const card = dev.page.getByTestId("takeover");
  await expect(card).toBeVisible();
  await expect(card.getByRole("radio", { name: /Ben/ })).toHaveAttribute("aria-checked", "true");
  await card.getByLabel("Your name").fill("Dev");
  await card.getByRole("button", { name: /Ask to play as/ }).click();
  await expect(dev.page.getByTestId("takeover-waiting")).toBeVisible();

  // The host is asked, and agrees.
  const prompt = aman.page.getByTestId("seat-request");
  await expect(prompt).toContainText("Dev asks to take over Ben's seat");
  await prompt.getByRole("button", { name: "Let them play" }).click();
  await expect(prompt).toHaveCount(0);

  // Dev is in the game, in Ben's seat, under his own name; the game did not move.
  await dev.page.waitForURL(new RegExp(`/room/${code}$`));
  await expect(dev.page.getByTestId("game-board")).toBeVisible();
  dev.id = benId;
  table.players[1] = dev;
  const snap = await table.expectInSync();
  expect(snap.players.find((p) => p.id === benId)).toMatchObject({ displayName: "Dev", connectionStatus: "connected" });
  expect(snap.game!.players.find((p) => p.id === benId)!.tokens).toEqual(benTokensBefore);
  await expect(visible(aman.page.getByText("Dev").first())).toBeVisible();

  // Dev plays Ben's turns.
  await table.act(1); // Ben's (now Dev's) turn: nothing out, the turn passes
  await table.act(2);
  await table.act(6, () => 0); // Dev opens a token
  await table.expectInSync();

  // Ben comes back on his own device: his saved seat no longer works.
  const benAgain = await ben.context.newPage();
  await benAgain.goto(`/room/${code}`);
  await expect(benAgain.getByText(/no longer valid/i).first()).toBeVisible({ timeout: 20_000 });
  await table.expectInSync();
  for (const p of [aman, dev]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
  for (const p of [aman, ben, dev]) await p.context.close();
});
