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

/**
 * Waits in the page (every 50 ms) until `keys` include `count` characters in one of `states`, then shoots the
 * area round them. Short-lived states can be over before a busy page is captured: the shot is then skipped and
 * logged (this is evidence, not a check; the recordings show every moment).
 */
async function shotWhen(page: Page, keys: string[], states: string[], count: number, pad: number, path: string, timeout = 8_000) {
  const caught = await page
    .waitForFunction(
      ([ks, ss, n]) => [...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].filter((el) => ks.includes(el.dataset.key!) && ss.includes(el.dataset.characterState ?? "")).length >= n,
      [keys, states, count] as const,
      { polling: 50, timeout },
    )
    .then(
      () => true,
      () => false,
    );
  if (!caught) {
    console.log(`not captured (over too soon): ${path}`);
    return;
  }
  const die = await dieState(page);
  await around(page, [...(await tokensAt(page, keys)), ...(die && keys.length === 4 ? [die] : [])], pad, path);
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
  await around(aman.page, [(await dieState(aman.page))!, ...(await tokensAt(aman.page, team(aman.id)))], 140, `${dir}/01b-die-resting-in-base.png`);

  // A six: the team reacts as the die lands (the die in the air is shot on a later roll, so it never delays this).
  await queueDice(6);
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).click({ noWaitAfter: true });
  table.rolls++;
  await shotWhen(aman.page, team(aman.id), ["cheering", "noticing"], 2, 140, `${dir}/03-landed-six-team-reacts.png`);
  await aman.page.screenshot({ path: `${dir}/04-six-full-view.png` });
  await ben.page.screenshot({ path: `${dir}/05-six-seen-in-3d.png` });

  // Selectable, then the chosen one leaves for the start cell.
  await shotWhen(aman.page, team(aman.id), ["selectable"], 4, 140, `${dir}/06-all-four-selectable.png`, 20_000);
  await pickToken3d(aman, A(0));
  table.moves++;
  await shotWhen(aman.page, [A(0)], ["selected", "excited", "leavingBase"], 1, 200, `${dir}/07-chosen-leaves-base.png`);
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
  const thrown = await aman.page
    .waitForFunction(() => document.querySelector<HTMLElement>('[data-testid="die-3d"]')?.dataset.state === "throw", undefined, { polling: 30, timeout: 8_000 })
    .then(
      () => true,
      () => false,
    );
  if (thrown) {
    const d = (await dieState(aman.page))!;
    await around(aman.page, [d], 220, `${dir}/02-die-in-the-air.png`);
  }
  await shotWhen(aman.page, [A(0), B(0)], ["cheering"], 1, 180, `${dir}/09-capture-attacker-cheers.png`, 20_000);
  await ben.page.screenshot({ path: `${dir}/10-capture-in-3d.png` });
  await shotWhen(aman.page, [A(0)], ["captured", "returningToBase"], 1, 200, `${dir}/11-victim-dismayed.png`, 20_000);
  await expect.poll(async () => (await characterStates(aman.page))[A(0)], { timeout: 20_000 }).not.toMatch(/captured|returningToBase/);
  await around(aman.page, await tokensAt(aman.page, team(aman.id)), 140, `${dir}/11b-victim-back-in-its-base.png`);
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
    await shotWhen(aman.page, [...team(aman.id), ...team(ben.id)], ["cheering", "celebrating", "reachingHome"], 3, 200, `${dir}/12-win-celebration-2.5d.png`, 30_000);
    await ben.page.screenshot({ path: `${dir}/13-win-celebration-3d.png` });
  }
  for (const p of [aman, ben]) await expect(p.page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
  await aman.page.waitForTimeout(600);
  await aman.page.screenshot({ path: `${dir}/14-victory-screen.png` });
  for (const p of [aman, ben]) await p.context.close();
});
