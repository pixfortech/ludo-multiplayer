// C.3C.1 visual evidence (not a check): screenshots of the 3D die and the
// characters' reactions for review, in a two-player Kolkata room. Runs only
// with E2E_SHOTS_DIR set, e.g.
//   E2E_SHOTS_DIR=shots npx playwright test e2e/tests/dice-reactions-evidence.spec.ts
// Add E2E_RECORD_DIR to record both players' screens to video as well.
import { expect, test, type Page } from "@playwright/test";
import { boardTokens, expectBoard3d, pickToken3d } from "../support/board3d";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, playUntil, seatTable, startGame, visible } from "../support/game";

const dir = process.env.E2E_SHOTS_DIR;

async function ready(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.querySelectorAll('[data-testid="board-mirror"] li[data-character-ready="true"]').length), { timeout: 180_000 })
    .toBe(8);
}

const characterStates = (page: Page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].map((el) => [el.dataset.key!, el.dataset.characterState ?? ""])));

const dieState = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="die-3d"]');
    const canvas = document.querySelector("canvas[data-board-gl]")?.getBoundingClientRect();
    return el && canvas ? { state: el.dataset.state, value: el.dataset.value, x: canvas.left + Number(el.dataset.cx), y: canvas.top + Number(el.dataset.cy) } : null;
  });

/** A screenshot of the area round some screen points, padded and kept inside the viewport. */
async function around(page: Page, points: { x: number; y: number }[], pad: number, path: string) {
  const vp = page.viewportSize()!;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.max(0, Math.min(...xs) - pad);
  const y = Math.max(0, Math.min(...ys) - pad * 1.5);
  const width = Math.max(40, Math.min(vp.width - x, Math.max(...xs) - Math.min(...xs) + 2 * pad));
  const height = Math.max(40, Math.min(vp.height - y, Math.max(...ys) - Math.min(...ys) + 2.5 * pad));
  await page.screenshot({ path, clip: { x, y, width, height }, animations: "allow" });
}

const tokensAt = async (page: Page, keys: string[]) => (await boardTokens(page)).filter((t) => keys.includes(t.key));

test("C.3C.1 evidence: the die's throw and landing, a six's reactions and departure, a capture, a home entry and the win", async ({ browser }) => {
  test.skip(!dir, "set E2E_SHOTS_DIR to take the evidence screenshots");
  test.setTimeout(30 * 60_000);
  const aman = await openPlayer(browser, "Aman", "wide", { board: "2.5d" });
  const ben = await openPlayer(browser, "Ben", "wide", { board: "3d" });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  const A = (t: number) => `${aman.id}:${t}`;
  const B = (t: number) => `${ben.id}:${t}`;
  const team = (id: string) => [0, 1, 2, 3].map((t) => `${id}:${t}`);
  await expectBoard3d(aman.page);
  await expectBoard3d(ben.page, "3d");
  await ready(aman.page);
  await ready(ben.page);
  await aman.page.waitForTimeout(1500);
  await aman.page.screenshot({ path: `${dir}/01-before-roll-2.5d.png` });

  // The throw: in the air, then at rest on the server's 6, with the team reacting.
  await queueDice(6);
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).click({ noWaitAfter: true });
  table.rolls++;
  let shotAir = false;
  for (let i = 0; i < 60 && !shotAir; i++) {
    const d = await dieState(aman.page);
    if (d?.state === "throw") {
      await aman.page.waitForTimeout(250);
      const d2 = (await dieState(aman.page)) ?? d;
      await around(aman.page, [d2, ...(await tokensAt(aman.page, team(aman.id)))], 140, `${dir}/02-die-in-the-air.png`);
      shotAir = true;
    } else await aman.page.waitForTimeout(40);
  }
  await expect.poll(async () => (await dieState(aman.page))?.state === "rest" && (await dieState(aman.page))?.value === "6").toBe(true);
  await expect.poll(async () => Object.entries(await characterStates(aman.page)).filter(([k, s]) => k.startsWith(aman.id) && ["cheering", "noticing"].includes(s)).length).toBeGreaterThanOrEqual(2);
  await aman.page.waitForTimeout(300);
  await around(aman.page, [(await dieState(aman.page))!, ...(await tokensAt(aman.page, team(aman.id)))], 140, `${dir}/03-landed-six-team-reacts.png`);
  await aman.page.screenshot({ path: `${dir}/04-six-full-view.png` });
  await ben.page.screenshot({ path: `${dir}/05-six-seen-in-3d.png` });

  // Selectable, then the chosen one's wave, then out to the start cell.
  await expect.poll(async () => Object.entries(await characterStates(aman.page)).filter(([k, s]) => k.startsWith(aman.id) && s === "selectable").length).toBe(4);
  await around(aman.page, await tokensAt(aman.page, team(aman.id)), 140, `${dir}/06-all-four-selectable.png`);
  await pickToken3d(aman, A(0));
  table.moves++;
  await expect.poll(async () => (await characterStates(aman.page))[A(0)]).toMatch(/selected|excited|leavingBase/);
  await around(aman.page, await tokensAt(aman.page, team(aman.id)), 140, `${dir}/07-selected-wave.png`);
  await expect.poll(async () => (await characterStates(aman.page))[A(0)]).toMatch(/leavingBase|walking/);
  await around(aman.page, await tokensAt(aman.page, team(aman.id)), 160, `${dir}/08-leaving-base.png`);
  await table.expectInSync();

  // To a capture: the storyteller to step 28, Ben opens two cells behind and lands on him.
  await table.act(6, () => 0);
  await table.act(5);
  await table.act(1);
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  await table.act(5);
  await table.act(6, () => 0);
  await queueDice(2);
  await visible(ben.page.getByRole("button", { name: "Roll dice" })).click({ noWaitAfter: true });
  table.rolls++;
  await expect.poll(async () => (await characterStates(aman.page))[B(0)], { timeout: 20_000 }).toBe("cheering");
  await around(aman.page, await tokensAt(aman.page, [A(0), B(0)]), 180, `${dir}/09-capture-attacker-cheers.png`);
  await ben.page.screenshot({ path: `${dir}/10-capture-in-3d.png` });
  await expect.poll(async () => (await characterStates(aman.page))[A(0)], { timeout: 20_000 }).toMatch(/captured|returningToBase/);
  await around(aman.page, await tokensAt(aman.page, [A(0), B(0)]), 200, `${dir}/11-victim-dismayed.png`);
  await table.expectInSync();

  // Ben's runner home, then the rest of his team: the celebrations and the victory screen.
  await playUntil(table, [ben.id], (s) => s.game!.players.find((p) => p.id === ben.id)!.tokens.filter((x) => x.step === 56).length === 3);
  const last = (await table.state()).game!.players.find((p) => p.id === ben.id)!.tokens.find((x) => x.step !== 56)!;
  // Within five of home (so the winning roll is never a third six).
  const near = await playUntil(table, [ben.id], (s) => (s.game!.players.find((p) => p.id === ben.id)!.tokens.find((x) => x.id === last.id)!.step ?? 0) >= 51);
  if (near.game!.phase === "playing") {
    // The winning roll, watched without waiting for the table to settle.
    const step = near.game!.players.find((p) => p.id === ben.id)!.tokens.find((x) => x.id === last.id)!.step!;
    if (near.game!.currentPlayerId !== ben.id) await table.act(1);
    await queueDice(56 - step);
    await visible(ben.page.getByRole("button", { name: "Roll dice" })).click({ noWaitAfter: true });
    table.rolls++;
    await expect.poll(async () => Object.values(await characterStates(aman.page)).filter((s) => s === "cheering").length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
    await aman.page.screenshot({ path: `${dir}/12-win-celebration-2.5d.png` });
    await ben.page.screenshot({ path: `${dir}/13-win-celebration-3d.png` });
  }
  for (const p of [aman, ben]) await expect(p.page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
  await aman.page.waitForTimeout(600);
  await aman.page.screenshot({ path: `${dir}/14-victory-screen.png` });
  for (const p of [aman, ben]) await p.context.close();
});
