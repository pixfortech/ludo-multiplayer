// City themes, Batch A: the host picks a city when creating a room; every
// player sees the same city (join preview and lobby), the server stores it
// with the room, and a refresh keeps it. Presentation only: the board and
// the rules are the classic ones.
import { expect, test } from "@playwright/test";
import { serverState } from "../support/control";
import { createRoom, joinRoom, openPlayer, startGame } from "../support/game";

test("the host's city is shared with every player and survives a refresh", async ({ browser }) => {
  const aman = await openPlayer(browser, "Aman", "desktop");
  const ben = await openPlayer(browser, "Ben", "phone");

  // The picker offers the five cities, then the classic table (the default).
  await aman.page.goto("/create");
  const cities = aman.page.getByRole("radiogroup", { name: "City" }).getByRole("radio");
  await expect(cities).toHaveCount(6);
  expect(await cities.evaluateAll((els) => els.map((e) => e.getAttribute("data-city")))).toEqual(["kolkata", "delhi", "chennai", "mumbai", "bengaluru", "classic"]);
  await expect(aman.page.getByRole("radio", { name: /^Classic:/ })).toHaveAttribute("aria-checked", "true");

  const code = await createRoom(aman, { players: 2, city: "Mumbai" });
  expect((await serverState(code)).room.settings.cityTheme).toBe("mumbai");
  await expect(aman.page.locator('[data-room-city="mumbai"]')).toBeVisible();

  // Ben sees the city before joining, and in the lobby after.
  await ben.page.goto(`/join/${code}`);
  await expect(ben.page.locator('[data-room-city="mumbai"]')).toBeVisible();
  await expect(ben.page.getByText("The big screen of moves")).toBeVisible();
  await joinRoom(ben, code);
  await expect(ben.page.locator('[data-room-city="mumbai"]')).toBeVisible();

  // A refresh reloads the room from the server: still Mumbai.
  await ben.page.reload();
  await expect(ben.page.locator('[data-room-city="mumbai"]')).toBeVisible();

  // The game itself is the classic board, unchanged.
  await startGame(aman, [aman, ben]);
  expect((await serverState(code)).game?.phase).toBe("playing");
  expect([...aman.errors, ...ben.errors]).toEqual([]);
});
