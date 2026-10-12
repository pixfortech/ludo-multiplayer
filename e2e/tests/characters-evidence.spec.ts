// C.3A/C.3B visual evidence (not a check): screenshots of Kolkata's four
// teams of characters for review, in a four-player room. Runs only with E2E_SHOTS_DIR set, e.g.
//   E2E_SHOTS_DIR=shots npx playwright test e2e/tests/characters-evidence.spec.ts
// Add E2E_RECORD_DIR to record both players' screens to video as well.
import { expect, test, type Page } from "@playwright/test";
import { boardTokens, expectBoard3d } from "../support/board3d";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible } from "../support/game";

const dir = process.env.E2E_SHOTS_DIR;

async function ready(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].filter((el) => el.dataset.characterReady === "true").length), { timeout: 180_000 })
    .toBe(16);
}

/** A screenshot of the area round some tokens (their projected centres), padded. */
async function around(page: Page, keys: string[], pad: number, path: string) {
  const ts = (await boardTokens(page)).filter((t) => keys.includes(t.key));
  const xs = ts.map((t) => t.x);
  const ys = ts.map((t) => t.y);
  const vp = page.viewportSize()!;
  const x = Math.max(0, Math.min(...xs) - pad);
  const y = Math.max(0, Math.min(...ys) - pad * 1.6);
  const width = Math.min(vp.width - x, Math.max(...xs) - Math.min(...xs) + 2 * pad);
  const height = Math.min(vp.height - y, Math.max(...ys) - Math.min(...ys) + 2.2 * pad);
  await page.screenshot({ path, clip: { x, y, width, height } });
}

test("C.3B evidence: all four bases from above, the 3D view, each team followed and every character close up", async ({ browser }) => {
  test.skip(!dir, "set E2E_SHOTS_DIR to take the evidence screenshots");
  test.setTimeout(12 * 60_000);
  const aman = await openPlayer(browser, "Aman", "wide", { board: "2.5d" });
  const ben = await openPlayer(browser, "Ben", "wide", { board: "3d" });
  const cara = await openPlayer(browser, "Cara", "phone", { board: "2d" });
  const dev = await openPlayer(browser, "Dev", "phone", { board: "2d" });
  const players = [aman, ben, cara, dev];
  const code = await createRoom(aman, { players: 4, city: "Kolkata" });
  for (const p of [ben, cara, dev]) await joinRoom(p, code);
  await startGame(aman, players);
  const table = await seatTable(code, players);
  const team = (id: string) => [0, 1, 2, 3].map((t) => `${id}:${t}`);
  const names = (page: Page, keys: string[]) => page.evaluate((ks) => ks.map((k) => document.querySelector<HTMLElement>(`[data-testid="board-mirror"] li[data-key="${k}"]`)!.dataset.character!), keys);

  // Aerial (2.5D): the whole board with sixteen people, then each base.
  await expectBoard3d(aman.page, "2.5d");
  await ready(aman.page);
  await aman.page.waitForTimeout(4000);
  await aman.page.screenshot({ path: `${dir}/teams-aerial.png` });
  for (const [i, p] of players.entries()) await around(aman.page, team(p.id), 110, `${dir}/teams-base-${i + 1}-aerial.png`);

  // 3D: the isometric overview; then, as each player's turn comes, the camera follows that base.
  await expectBoard3d(ben.page, "3d");
  await ready(ben.page);
  await ben.page.waitForTimeout(3000);
  await ben.page.screenshot({ path: `${dir}/teams-iso.png` });
  await visible(ben.page.getByRole("button", { name: "Follow token" })).click();
  for (let turn = 0; turn < 4; turn++) {
    const current = (await table.state()).game!.currentPlayerId;
    const p = players.find((x) => x.id === current)!;
    const i = players.indexOf(p);
    await ben.page.waitForTimeout(2500);
    await ben.page.screenshot({ path: `${dir}/teams-base-${i + 1}-3d.png` });
    const keys = team(p.id);
    const who = await names(ben.page, keys);
    for (const [j, key] of keys.entries()) await around(ben.page, [key], 150, `${dir}/teams-close-${i + 1}-${who[j]}.png`);
    await table.act(1); // no token out: the turn passes
  }

  // A six: the current player's storyteller leaves the base (recorded when E2E_RECORD_DIR is set).
  const current = (await table.state()).game!.currentPlayerId;
  await table.roll(6);
  await aman.page.waitForTimeout(2500);
  await table.move(0);
  await aman.page.waitForTimeout(6000);
  await aman.page.screenshot({ path: `${dir}/teams-departed-aerial.png` });
  await ben.page.screenshot({ path: `${dir}/teams-departed-3d.png` });
  console.log("departed:", current);
  for (const p of players) await p.context.close();
});
