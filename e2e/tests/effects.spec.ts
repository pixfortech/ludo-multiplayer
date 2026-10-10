// Capture, home and victory effects in real browsers against the real server.
// What each page showed is recorded in the page (timeline.ts); dice are queued
// only through the test server's control port.
import { expect, test, type Browser } from "@playwright/test";
import { createRoom, expectNoDuplicates, expectResults, joinRoom, openPlayer, playToEnd, playUntil, readBoard, seatTable, startGame, visible, type Player } from "../support/game";
import { readTimeline, runningAnimations, startTimeline, type TimelineEvent } from "../support/timeline";

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
  // On the phone, the banner and effects never cover the board, and the controls stay in view.
  const uncovered = await ben.page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-testid="game-board"]')].find((b) => b.getBoundingClientRect().width > 0)!;
    const r = board.getBoundingClientRect();
    const points = [[0.5, 0.5], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]] as const;
    return points.map(([fx, fy]) => board.contains(document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy)));
  });
  expect(uncovered, "board centre and corners are not covered").toEqual([true, true, true, true, true]);
  await expect(visible(ben.page.getByTestId("dice-tray"))).toBeInViewport({ ratio: 1 });
  await expect(visible(aman.page.getByRole("button", { name: "Roll dice" }))).toBeVisible();
  // A refresh shows the result without replaying the capture.
  await ben.page.reload();
  await table.expectInSync();
  await startTimeline(ben.page); // from the moment the reloaded page shows the server's state
  expect((await readBoard(ben.page))[`token-${B(0)}`]).toBe("base");
  await ben.page.waitForTimeout(800);
  expect(await readTimeline(ben.page)).toEqual([]);
  noErrors([aman, ben]);
});

test("home: the token runs up its own lane, the gold accent plays, and the counter changes only on arrival", async ({ browser }) => {
  const { aman, ben, table, A } = await twoPlayers(browser);
  // Round the board with sixes (Ben has nothing out, so his 1s are auto-passed).
  await table.act(6, () => 0); // opens: 0
  await table.act(6, () => 0); // 6
  await table.act(5); // 11
  await table.act(1); // Ben
  for (let lap = 0; lap < 2; lap++) {
    await table.act(6, () => 0); // 17 | 34
    await table.act(6, () => 0); // 23 | 40
    await table.act(5); // 28 | 45
    await table.act(1); // Ben
  }
  await table.act(6, () => 0); // 45 → 51, the first lane cell
  for (const p of [aman, ben]) await startTimeline(p.page);
  const snap = await table.act(5); // 51 → 56: home
  expect(snap.history.some((e) => e.type === "home" && e.playerId === aman.id)).toBe(true);
  for (const p of [aman, ben]) {
    await expect(p.page.locator('[data-effect="home"]').first(), `${p.name} sees the gold accent`).toBeAttached({ timeout: 3000 });
  }
  for (const p of [aman, ben]) {
    await expect.poll(async () => (await readTimeline(p.page)).some((e) => e.target === `home:${aman.id}` && e.value === "1"), { message: `${p.name}'s counter shows 1` }).toBe(true);
    const tl = await readTimeline(p.page);
    expect(stepsOf(tl, A(0)), `${p.name}: up the lane, cell by cell`).toEqual(["52", "53", "54", "55", "56"]);
    const arrivedAt = tl.find((e) => e.target === A(0) && e.value === "56")!.t;
    const counted = tl.find((e) => e.target === `home:${aman.id}` && e.value === "1")!;
    expect(counted.t - arrivedAt, `${p.name}: the counter waits for the glide home`).toBeGreaterThan(450);
    await expect(p.page.getByTestId(`token-${A(0)}`)).toHaveAttribute("data-state", "finished");
    await expect(p.page.getByTestId(`token-${A(0)}`)).not.toHaveAttribute("role", "button");
  }
  await expect(visible(aman.page.getByText("Home: roll again"))).toBeVisible();
  await expect(visible(ben.page.getByText("Home: Aman rolls again"))).toBeVisible();
  await expect(visible(ben.page.locator(`[data-testid="home-count"][data-player="${aman.id}"]`))).toHaveText("1/4");
  noErrors([aman, ben]);
});

test("victory: the fourth token home leads into the victory screen once; actions work; a refresh replays nothing", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const { aman, ben, table, A } = await twoPlayers(browser, { reducedMotion: true });
  // Most of the game quickly, until Aman's last token is on its way home.
  const nearEnd = await playUntil(table, [aman.id], (snap) => {
    const tokens = snap.game!.players.find((p) => p.id === aman.id)!.tokens;
    return tokens.filter((t) => t.step === 56).length === 3 && tokens.some((t) => t.step !== null && t.step >= 45 && t.step < 56);
  });
  const last = nearEnd.game!.players.find((p) => p.id === aman.id)!.tokens.find((t) => t.step !== 56)!.id;
  // Then the finish with full motion, as most players see it.
  for (const p of [aman, ben]) {
    await p.page.emulateMedia({ reducedMotion: "no-preference" });
    await startTimeline(p.page);
    await expect(p.page.getByRole("dialog")).toHaveCount(0);
  }
  const end = await playToEnd(table, [aman.id]);
  const finalEntries = end.history.slice(-4).map((e) => e.type);
  expect(finalEntries, "home, finished, win, game over: no bonus roll").toEqual(["home", "player-finished", "win", "game-over"]);

  for (const p of [aman, ben]) {
    const dialog = p.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(p.page.getByTestId("confetti"), `${p.name}: one confetti burst`).toHaveCount(1);
    const tl = await readTimeline(p.page);
    expect(tl.some((e) => e.target === A(last) && e.value === "56"), `${p.name} saw the last token arrive`).toBe(true);
    expect(tl.some((e) => e.target === `home:${aman.id}` && e.value === "4"), `${p.name}'s counter reached 4/4`).toBe(true);
    await expect(visible(p.page.getByTestId("turn-callouts"))).toHaveAttribute("data-kind", "win");
  }
  await expectResults(table, end);
  expectNoDuplicates(table, end);
  await expect(aman.page.getByRole("dialog").getByRole("heading", { name: "You win!" })).toBeFocused();

  // A refresh shows the result at once: no confetti, nothing animating, nothing replayed.
  await ben.page.reload();
  await expect(ben.page.getByRole("dialog", { name: "Aman wins!" })).toBeVisible();
  await startTimeline(ben.page); // from the moment the reloaded page is showing the result
  await ben.page.waitForTimeout(1500);
  await expect(ben.page.getByTestId("confetti")).toHaveCount(0);
  expect(await runningAnimations(ben.page)).toEqual({ tokens: 0, die: 0 });
  expect(await readTimeline(ben.page)).toEqual([]);

  // The actions are real. Escape and View board return to the board; Show results reopens it.
  await aman.page.keyboard.press("Escape");
  await expect(aman.page.getByRole("dialog")).toHaveCount(0);
  await expect(aman.page.getByTestId("game-board")).toBeVisible();
  const showResults = visible(aman.page.getByRole("button", { name: "Show results" }));
  await expect(showResults).toBeFocused();
  await showResults.click();
  await aman.page.getByRole("dialog").getByRole("button", { name: "View board" }).click();
  await expect(aman.page.getByRole("dialog")).toHaveCount(0);
  await showResults.click();
  await aman.page.getByRole("dialog").getByRole("link", { name: /New game/ }).click();
  await expect(aman.page.getByRole("heading", { level: 1, name: "Create a game" })).toBeVisible();
  await ben.page.getByRole("dialog").getByRole("link", { name: /Return home/ }).tap();
  await expect(ben.page.getByRole("heading", { level: 1, name: /Ludo, beautifully/ })).toBeVisible();
  noErrors([aman, ben]);
});

test("reduced motion: a capture is one straight move home, with no effect animation, and still explained", async ({ browser }) => {
  const { aman, ben, table, B } = await twoPlayers(browser, { reducedMotion: true });
  await table.act(6, () => 0); // Aman opens
  await table.act(1); // 1
  await table.act(6, () => 0); // Ben opens (absolute 26)
  await table.act(1); // Ben 1 (absolute 27)
  await table.act(6, () => 0); // Aman 7
  await table.act(6, () => 0); // 13
  await table.act(5); // 18
  await table.act(1); // Ben 2 (absolute 28)
  await table.act(6, () => 0); // Aman 24
  for (const p of [aman, ben]) await startTimeline(p.page);
  const snap = await table.act(4); // 28: capture
  expect(snap.history.some((e) => e.type === "capture")).toBe(true);
  for (const p of [aman, ben]) {
    expect(stepsOf(await readTimeline(p.page), B(0)), `${p.name}: one straight move home`).toEqual(["base"]);
    const effectAnimations = await p.page.evaluate(() => [...document.querySelectorAll("[data-effect] *")].flatMap((el) => el.getAnimations()).filter((a) => a.playState === "running").length);
    expect(effectAnimations, `${p.name}: no effect animation`).toBe(0);
    await expect(visible(p.page.getByTestId("turn-callouts"))).toHaveAttribute("data-kind", "capture");
  }
  noErrors([aman, ben]);
});

