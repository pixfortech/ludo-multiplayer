// The animation system as players see it, in real browsers against the real
// server: the die tumbles from the click and lands on the server's value,
// tokens travel cell by cell along their own path only after the server
// confirms, an automatic move waits for the reveal, captured tokens go home
// after the attacker lands, and nothing replays after a refresh or takeover.
// Dice are queued only through the test server's control port.
import { expect, test, type Browser, type Page, type WebSocketRoute } from "@playwright/test";
import { CLASSIC_FINISH, classicSeatPath, type Cell } from "@ludo/board-layouts";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, readBoard, seatTable, startGame, visible, type Player, type Table } from "../support/game";
import { dieSpinning, readTimeline, runningAnimations, startTimeline, type TimelineEvent } from "../support/timeline";

const CELL = 40;
const PAD = 16;

function layoutCell(seat: number, step: number): Cell {
  const path = classicSeatPath(seat);
  return step <= 50 ? path.track[step]! : step <= 55 ? path.lane[step - 51]! : CLASSIC_FINISH[seat]!;
}

async function drawnCell(page: Page, key: string): Promise<Cell> {
  const transform = await page.getByTestId(`token-${key}`).evaluate((el) => (el as SVGGElement).style.transform);
  const [x, y] = [...transform.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
  return { row: Math.floor((y! - PAD) / CELL), col: Math.floor((x! - PAD) / CELL) };
}

/** Waits until nothing is animating on the board or the die. */
async function atRest(page: Page) {
  await expect.poll(() => runningAnimations(page), { message: "animations finish" }).toEqual({ tokens: 0, die: 0 });
}

/** The die face nearest the viewer, found by hit-testing the die's centre (backfaces are hidden). */
function frontFace(page: Page): Promise<number> {
  return page.evaluate(() => {
    const die = [...document.querySelectorAll<HTMLElement>('[data-testid="die"]')].find((d) => d.getBoundingClientRect().width > 0)!;
    const r = die.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.2)?.closest("[data-face]");
    return Number(hit?.getAttribute("data-face"));
  });
}

const stepsOf = (timeline: TimelineEvent[], key: string) => timeline.filter((e) => e.target === key).map((e) => e.value);

/** A WebSocket proxy for one page: the test can hold the server's replies, or make the next move request stale. */
async function proxySocket(page: Page) {
  const control = { hold: false, staleNextMove: false, held: [] as (string | Buffer)[], route: null as WebSocketRoute | null };
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    control.route = ws;
    ws.onMessage((message) => {
      if (control.staleNextMove && typeof message === "string" && /^\d+\["game:move"/.test(message)) {
        control.staleNextMove = false;
        message = message.replace(/"expectedStateVersion":\d+/, '"expectedStateVersion":0');
      }
      server.send(message);
    });
    server.onMessage((message) => (control.hold ? control.held.push(message) : ws.send(message)));
  });
  return {
    control,
    release() {
      control.hold = false;
      for (const m of control.held.splice(0)) control.route?.send(m);
    },
  };
}

async function twoPlayers(browser: Browser, options: { reducedMotion?: boolean; proxy?: boolean } = {}) {
  const aman = await openPlayer(browser, "Aman", "desktop", options);
  const ben = await openPlayer(browser, "Ben", "phone", options);
  const proxy = options.proxy ? await proxySocket(aman.page) : null;
  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  return { aman, ben, table, proxy, A: (id: number) => `${aman.id}:${id}`, B: (id: number) => `${ben.id}:${id}` };
}

async function rollOnly(player: Player, table: Table, value: number) {
  await queueDice(value);
  await visible(player.page.getByRole("button", { name: "Roll dice" })).click();
  table.rolls++;
}

test("the die tumbles from the click, lands on the server's six, and nothing moves until the server confirms", async ({ browser }) => {
  const { aman, ben, table, proxy, A } = await twoPlayers(browser, { proxy: true });
  const die = visible(aman.page.getByTestId("die"));
  const restingBox = await die.boundingBox();
  for (const p of [aman, ben]) await startTimeline(p.page);

  // 1. The tumble starts on the click.
  await rollOnly(aman, table, 6);
  await expect(die).toHaveAttribute("data-value", "rolling", { timeout: 300 });
  expect(await dieSpinning(aman.page), "the die is tumbling").toBe(true);
  const rollingBox = await die.boundingBox();
  // 2 + 4. It lands on the server's value: a six, with its gold accent and the bonus explained.
  await expect(die).toHaveAttribute("data-value", "6");
  await expect(die).toHaveAttribute("data-six", "true");
  await expect
    .poll(() => die.getByTestId("die-six-glow").evaluate((el) => el.getAnimations().some((a) => a.id === "die-six-glow")), { message: "the six's gold glow plays", timeout: 2000, intervals: [50] })
    .toBe(true);
  await atRest(aman.page);
  expect(await frontFace(aman.page), "the face shown is the server's value").toBe(6);
  expect((await table.state()).game!.lastRoll!.value).toBe(6);
  await expect(visible(aman.page.getByText("Six! Move a token, then roll again"))).toBeVisible();
  await expect(visible(ben.page.getByText("Aman rolled a six and rolls again"))).toBeVisible();
  // 3. One die, always the same: size and faces never change.
  expect(rollingBox!.width).toBeCloseTo(restingBox!.width, 0);
  expect(await die.locator("[data-face]").count()).toBe(6);
  const timeline = await readTimeline(aman.page);
  expect(timeline.filter((e) => e.target === "die").map((e) => e.value), "rolling, then the value: never another number shown first").toEqual(["rolling", "6"]);

  // 5. Choosing a move: the token waits for the server. Hold the server's replies, choose, check, release.
  proxy!.control.hold = true;
  await visible(aman.page.getByTestId("move-tray")).getByRole("button", { name: /^Token 1:/ }).click();
  table.moves++;
  await aman.page.waitForTimeout(700);
  expect((await readBoard(aman.page))[`token-${A(0)}`], "no movement before the server's answer").toBe("base");
  await expect(aman.page.getByTestId(`token-${A(0)}`)).toHaveAttribute("data-state", "selected");
  proxy!.release();
  await table.expectInSync();
  expect((await readBoard(aman.page))[`token-${A(0)}`]).toBe("0");

  // A rejected move never animates: the next move request goes out stale and the real server refuses it.
  await table.roll(6);
  await startTimeline(aman.page);
  proxy!.control.staleNextMove = true;
  await visible(aman.page.getByTestId("move-tray")).getByRole("button", { name: /^Token 1:/ }).click();
  await expect(visible(aman.page.getByTestId("game-status"))).toContainText("The game moved on");
  await aman.page.waitForTimeout(500);
  expect(stepsOf(await readTimeline(aman.page), A(0)), "the refused move did not move the token").toEqual([]);
  expect((await table.state()).events.filter((e) => e.actionType === "game:move")).toHaveLength(1);
  // The server still offers the choice; this time it goes through.
  await table.move(0);
  await table.expectInSync();
  for (const p of [aman, ben]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
});

test("auto-move waits for the reveal; tokens hop cell by cell; captures wait for the attacker; lanes and home follow the seat's own path", async ({ browser }) => {
  const { aman, ben, table, A, B } = await twoPlayers(browser);
  await table.act(6, () => 0);

  // 6 + 7. An automatic move: the die lands, holds, and only then does the token hop 1, 2, 3, 4.
  for (const p of [aman, ben]) await startTimeline(p.page);
  await table.act(4);
  for (const p of [aman, ben]) {
    const tl = await readTimeline(p.page);
    const revealed = tl.find((e) => e.target === "die" && e.value === "4");
    const firstHop = tl.find((e) => e.target === A(0));
    expect(revealed, `${p.name} saw the die land on 4`).toBeTruthy();
    expect(firstHop!.t - revealed!.t, `${p.name}: the token waits for the reveal`).toBeGreaterThan(300);
    expect(stepsOf(tl, A(0)), `${p.name}: cell by cell`).toEqual(["1", "2", "3", "4"]);
    expect(await drawnCell(p.page, A(0))).toEqual(layoutCell(0, 4));
  }

  // Ben opens a token and moves it to his step 4 (absolute 30, an unprotected cell).
  await table.act(6, () => 0);
  await table.act(4);
  // Aman comes round: 4 → 10 → 16 → 21, then Ben opens a second token and steps it on.
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  await table.act(5);
  await table.act(6, () => 1);
  await table.act(2, () => 1);
  await table.act(6, () => 0); // Aman 21 → 27

  // 8. Capture: Aman's 27 → 30 lands on Ben's token. It goes home only after Aman's token has landed.
  for (const p of [aman, ben]) await startTimeline(p.page);
  const snap = await table.act(3);
  expect(snap.history.some((e) => e.type === "capture" && e.victimPlayerId === ben.id && e.victimTokenId === 0)).toBe(true);
  for (const p of [aman, ben]) {
    const tl = await readTimeline(p.page);
    expect(stepsOf(tl, A(0))).toEqual(["28", "29", "30"]);
    const landed = tl.find((e) => e.target === A(0) && e.value === "30")!;
    const sentHome = tl.find((e) => e.target === B(0) && e.value === "base")!;
    expect(sentHome, `${p.name} saw Ben's token go home`).toBeTruthy();
    expect(sentHome.t, `${p.name}: after the attacker landed`).toBeGreaterThan(landed.t);
    expect(stepsOf(tl, B(0)), "straight home, not hopping back along the track").toEqual(["base"]);
  }

  // 9. Into the home lane: 47 → 52 crosses from the track into Aman's own lane, cell by cell.
  await table.act(6, () => 0); // 36 (capture bonus)
  await table.act(6, () => 0); // 42
  await table.act(5); // 47
  await table.act(1); // Ben's remaining token steps on
  for (const p of [aman, ben]) await startTimeline(p.page);
  await table.act(5);
  for (const p of [aman, ben]) {
    expect(stepsOf(await readTimeline(p.page), A(0))).toEqual(["48", "49", "50", "51", "52"]);
    expect(await drawnCell(p.page, A(0)), "in Aman's lane").toEqual(classicSeatPath(0).lane[1]);
  }
  await table.act(1);
  // Home: an exact four; the token settles in the finish and becomes inactive.
  await table.act(4);
  for (const p of [aman, ben]) {
    await expect(p.page.getByTestId(`token-${A(0)}`)).toHaveAttribute("data-state", "finished");
    expect(await drawnCell(p.page, A(0))).toEqual(CLASSIC_FINISH[0]);
    await atRest(p.page);
  }

  // 10. Refresh mid-move: the reloaded page shows the result at rest; nothing replays.
  await rollOnly(aman, table, 6);
  await expect(visible(aman.page.getByTestId("move-tray"))).toBeVisible();
  await table.move(1);
  await ben.page.reload();
  await startTimeline(ben.page);
  await table.expectInSync();
  expect(await runningAnimations(ben.page)).toEqual({ tokens: 0, die: 0 });
  expect(await readTimeline(ben.page)).toEqual([]);

  // A replacement tab (takeover) starts from the server's state, with no animation queue of its own.
  await table.act(2);
  const second = await aman.context.newPage();
  await second.goto(aman.page.url());
  await visible(second.getByRole("button", { name: /Continue here as Aman/ })).click();
  await expect(second.getByTestId("game-board")).toBeVisible();
  await expect.poll(() => readBoard(second)).toEqual(await readBoard(ben.page));
  expect(await runningAnimations(second)).toEqual({ tokens: 0, die: 0 });
  await expect(visible(aman.page.getByText("This seat is open elsewhere"))).toBeVisible();
  for (const p of [aman, ben]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
});

test("reduced motion: no tumble, no hops; the reveal still comes first", async ({ browser }) => {
  const { aman, ben, table, A } = await twoPlayers(browser, { reducedMotion: true });
  await rollOnly(aman, table, 6);
  for (let i = 0; i < 8; i++) {
    expect(await dieSpinning(aman.page), "no tumble").toBe(false);
    await aman.page.waitForTimeout(40);
  }
  await visible(aman.page.getByTestId("move-tray")).getByRole("button", { name: /^Token 1:/ }).click();
  table.moves++;
  await table.expectInSync();
  for (const p of [aman, ben]) await startTimeline(p.page);
  await table.act(5);
  for (const p of [aman, ben]) {
    const tl = await readTimeline(p.page);
    expect(stepsOf(tl, A(0)), `${p.name}: one straight slide`).toEqual(["5"]);
    const revealed = tl.find((e) => e.target === "die" && e.value === "5");
    expect(revealed && tl.find((e) => e.target === A(0))!.t - revealed.t, `${p.name}: still after the reveal`).toBeGreaterThan(300);
  }
  for (const p of [aman, ben]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
});
