// Capture, home and victory effects in real browsers against the real server.
// What each page showed is recorded in the page (timeline.ts); dice are queued
// only through the test server's control port.
import { expect, test, type Browser } from "@playwright/test";
import { createRoom, joinRoom, openPlayer, readBoard, seatTable, startGame, visible, type Player } from "../support/game";
import { readTimeline, startTimeline, type TimelineEvent } from "../support/timeline";

const stepsOf = (timeline: TimelineEvent[], key: string) => timeline.filter((e) => e.target === key).map((e) => e.value);

async function twoPlayers(browser: Browser, options: { reducedMotion?: boolean; fullRanking?: boolean } = {}) {
  const aman = await openPlayer(browser, "Aman", "desktop", options);
  const ben = await openPlayer(browser, "Ben", "phone", options);
  const code = await createRoom(aman, { players: 2, ...(options.fullRanking ? { fullRanking: true } : {}) });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  return { aman, ben, table, A: (id: number) => `${aman.id}:${id}`, B: (id: number) => `${ben.id}:${id}` };
}

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};

test("a double capture: both tokens react and go home together, after the attacker lands; the bonus is explained", async ({ browser }) => {
  const { aman, ben, table, A, B } = await twoPlayers(browser);
  await table.act(6, () => 0); // Aman opens
  await table.act(1); // 0 → 1
  await table.act(6, () => 0); // Ben opens B0
  await table.act(6, () => 1); // Ben opens B1
  await table.act(2, () => 0); // B0 → 2 (absolute 28: not a safe cell)
  await table.act(3); // Aman 1 → 4
  await table.act(2, () => 1); // B1 → 2: two of Ben's tokens on one cell
  await table.act(6, () => 0); // Aman 4 → 10
  await table.act(6, () => 0); // 10 → 16
  await table.act(5); // 16 → 21
  await table.act(6, () => 2); // Ben opens B2 (onto his safe start)
  await table.act(6, () => 3); // Ben opens B3
  await table.act(6); // a third six: forfeited, nothing moves
  await table.act(6, () => 0); // Aman 21 → 27

  for (const p of [aman, ben]) await startTimeline(p.page);
  const snap = await table.act(1); // 27 → 28: lands on both of Ben's tokens
  expect(snap.history.filter((e) => e.type === "capture").slice(-2).map((e) => (e.type === "capture" ? e.victimTokenId : -1))).toEqual([0, 1]);
  expect(snap.game!.currentPlayerId, "the capture earns Aman another roll").toBe(aman.id);

  for (const p of [aman, ben]) {
    const tl = await readTimeline(p.page);
    const landed = tl.find((e) => e.target === A(0) && e.value === "28")!;
    const homes = [B(0), B(1)].map((k) => tl.find((e) => e.target === k && e.value === "base")!);
    expect(landed, `${p.name} saw Aman land`).toBeTruthy();
    for (const h of homes) {
      expect(h, `${p.name} saw each token go home`).toBeTruthy();
      expect(h.t, `${p.name}: only after Aman landed`).toBeGreaterThan(landed.t);
    }
    expect(Math.abs(homes[1]!.t - homes[0]!.t), `${p.name}: together, as one group`).toBeLessThan(200);
    expect(stepsOf(tl, B(0))).toEqual(["base"]);
    expect(stepsOf(tl, B(1))).toEqual(["base"]);
    // Each token is drawn exactly once.
    for (const k of [B(0), B(1), A(0)]) await expect(p.page.getByTestId(`token-${k}`)).toHaveCount(1);
  }
  // One coherent banner, worded for each player; Aman's panel is highlighted.
  await expect(visible(aman.page.getByText("Double capture: roll again"))).toBeVisible();
  await expect(visible(aman.page.getByText("You captured Ben's 2 tokens"))).toBeVisible();
  await expect(visible(ben.page.getByText("Double capture: Aman rolls again"))).toBeVisible();
  await expect(visible(ben.page.getByText("Aman captured your 2 tokens"))).toBeVisible();
  for (const p of [aman, ben]) await expect(visible(p.page.getByTestId("turn-callouts"))).toHaveAttribute("data-kind", "capture");
  await expect(visible(aman.page.getByRole("button", { name: "Roll dice" }))).toBeVisible();
  // A refresh shows the result without replaying the capture.
  await ben.page.reload();
  await startTimeline(ben.page);
  await table.expectInSync();
  expect((await readBoard(ben.page))[`token-${B(0)}`]).toBe("base");
  await ben.page.waitForTimeout(800);
  expect(await readTimeline(ben.page)).toEqual([]);
  noErrors([aman, ben]);
});

