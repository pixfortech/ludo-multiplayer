// C.3A visual evidence (not a check): screenshots of the Crimson team's
// characters for review. Runs only with E2E_SHOTS_DIR set, e.g.
//   E2E_SHOTS_DIR=shots npx playwright test e2e/tests/characters-evidence.spec.ts
// Add E2E_RECORD_DIR to record both players' screens to video as well.
import { expect, test, type Page } from "@playwright/test";
import { boardTokens, expectBoard3d } from "../support/board3d";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible } from "../support/game";

const dir = process.env.E2E_SHOTS_DIR;

async function ready(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].filter((el) => el.dataset.characterReady === "true").length), { timeout: 60_000 })
    .toBe(4);
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

test("C.3A evidence: the Crimson base from above, the 3D view and each character close up", async ({ browser }) => {
  test.skip(!dir, "set E2E_SHOTS_DIR to take the evidence screenshots");
  test.setTimeout(6 * 60_000);
  const aman = await openPlayer(browser, "Aman", "wide", { board: "2.5d" });
  const ben = await openPlayer(browser, "Ben", "wide", { board: "3d" });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  const crimson = [0, 1, 2, 3].map((t) => `${aman.id}:${t}`);

  // Aerial (2.5D): the whole board, then the Crimson base.
  await expectBoard3d(aman.page, "2.5d");
  await ready(aman.page);
  await aman.page.waitForTimeout(4000);
  await aman.page.screenshot({ path: `${dir}/characters-aerial.png` });
  await around(aman.page, crimson, 110, `${dir}/characters-base-aerial.png`);

  // 3D: the isometric overview, then the base followed and zoomed in.
  await expectBoard3d(ben.page, "3d");
  await ready(ben.page);
  await ben.page.waitForTimeout(3000);
  await ben.page.screenshot({ path: `${dir}/characters-iso.png` });
  await visible(ben.page.getByRole("button", { name: "Follow token" })).click();
  await ben.page.waitForTimeout(1500);
  const canvas = (await ben.page.locator("canvas[data-board-gl]").boundingBox())!;
  await ben.page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  for (let i = 0; i < 12; i++) {
    await ben.page.mouse.wheel(0, -120);
    await ben.page.waitForTimeout(80);
  }
  await ben.page.waitForTimeout(2500);
  await ben.page.screenshot({ path: `${dir}/characters-base-3d.png` });
  const names = ["adda", "tea", "newspaper", "exercise"];
  for (const [i, key] of crimson.entries()) await around(ben.page, [key], 170, `${dir}/characters-close-${names[i]}.png`);

  // A six: the storyteller leaves the base (recorded when E2E_RECORD_DIR is set).
  await table.roll(6);
  await aman.page.waitForTimeout(2500);
  await around(aman.page, crimson, 110, `${dir}/characters-turn-aerial.png`);
  await table.move(0);
  await aman.page.waitForTimeout(6000);
  await aman.page.screenshot({ path: `${dir}/characters-departed-aerial.png` });
  await ben.page.screenshot({ path: `${dir}/characters-departed-3d.png` });
  for (const p of [aman, ben]) await p.context.close();
});
