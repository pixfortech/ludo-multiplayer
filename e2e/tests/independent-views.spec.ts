// Every player chooses their own board view, graphics quality and camera; one
// player's choice never changes another's: not in another browser, not in
// another tab of the same browser. The game itself (dice, moves, captures,
// turns, the room's city) is the server's and the same on every screen.
//  - four players in one Kolkata room: 3D with a free orbit camera at High,
//    the 2D board, 2.5D at Medium, 3D following the play at Low. One changes
//    camera and view again and again: the other three do not move, nothing is
//    sent, nothing replays; then everyone plays and stays in step with the
//    server; a refresh restores that player's own view only;
//  - two players in two tabs of one browser (shared localStorage): each keeps
//    their own choices, through play and refreshes.
import { expect, test, type Page } from "@playwright/test";
import { expectBoard3d } from "../support/board3d";
import { createRoom, expectNoDuplicates, joinRoom, openPlayer, openTab, plan, seatTable, startGame, visible, type Player, type Table } from "../support/game";

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};

interface ViewState {
  renderer: string;
  quality: string | null;
  camera: string | null;
  /** Where the board's cells are on screen (3D boards) or the board's box (2D): moves when the camera does. */
  picture: string;
  /** Presentation events shown so far (the die, cues, moves): grows only when something plays. */
  events: number;
}

function viewOf(page: Page): Promise<ViewState> {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    const flat = board?.tagName.toLowerCase() === "svg";
    const cells = [...document.querySelectorAll<HTMLElement>('[data-testid="board-cells-mirror"] li[data-cx]')].map((li) => `${Math.round(Number(li.dataset.cx))},${Math.round(Number(li.dataset.cy))}`);
    const box = board?.getBoundingClientRect();
    const log = document.querySelector('[data-testid="presentation-log"]');
    return {
      renderer: flat ? "2d" : (board?.dataset.renderer ?? "none"),
      quality: flat ? null : (board?.dataset.quality ?? null),
      camera: flat ? null : (board?.dataset.camera ?? null),
      picture: flat ? `${Math.round(box!.x)},${Math.round(box!.y)},${Math.round(box!.width)}` : cells.join(" "),
      events: Number(log?.lastElementChild?.getAttribute("data-n") ?? 0),
    };
  });
}

/** The view once its camera has come to rest (a follow camera eases into place). */
async function settledView(page: Page): Promise<ViewState> {
  let last = await viewOf(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(700);
    const now = await viewOf(page);
    if (JSON.stringify(now) === JSON.stringify(last)) return now;
    last = now;
  }
  return last;
}

/** Drags the 3D board's camera round (a free orbit) and zooms with the wheel. */
async function orbit(p: Player, dx: number) {
  const box = (await p.page.locator("canvas[data-board-gl]").boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await p.page.mouse.move(x, y);
  await p.page.mouse.down();
  await p.page.mouse.move(x + dx, y + dx / 4, { steps: 6 });
  await p.page.mouse.up();
  await p.page.mouse.wheel(0, dx > 0 ? -120 : 120);
}

/** Every frame a page sends over its game socket (Engine.IO heartbeats aside). */
async function countSocketFrames(p: Player): Promise<() => string[]> {
  const frames: string[] = [];
  p.page.on("websocket", (ws) => ws.on("framesent", (f) => (typeof f.payload === "string" && f.payload !== "3" && f.payload !== "2" ? frames.push(f.payload) : undefined)));
  return () => frames;
}

async function playSome(table: Table, racer: string, actions: number) {
  for (let i = 0; i < actions; i++) {
    const snap = await table.state();
    const next = plan(snap.game!, [racer]);
    await table.act(next.value, next.token ? (legal) => next.token!(legal) : undefined);
  }
}

test("four players in one Kolkata room each keep their own view, quality and camera; one player's changes never move another's; the game is the same on all four", async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  const a = await openPlayer(browser, "Asha", "desktop", { board: "3d", quality: "high" });
  const b = await openPlayer(browser, "Bina", "desktop", { board: "2d" });
  const c = await openPlayer(browser, "Chandan", "desktop", { board: "2.5d", quality: "medium" });
  const d = await openPlayer(browser, "Dev", "tablet", { board: "3d", quality: "low" });
  const players = [a, b, c, d];
  const code = await createRoom(a, { players: 4, city: "Kolkata" });
  for (const p of [b, c, d]) await joinRoom(p, code);
  await startGame(a, players);
  const table = await seatTable(code, players);
  await expectBoard3d(a.page, "3d");
  await expect(b.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await expectBoard3d(c.page, "2.5d");
  await expectBoard3d(d.page, "3d");

  // D follows the play; A orbits freely.
  await visible(d.page.getByRole("button", { name: "Follow token" })).click();
  await expect(d.page.getByTestId("game-board")).toHaveAttribute("data-camera", "follow");
  await orbit(a, 160);
  await expect(a.page.getByTestId("game-board")).toHaveAttribute("data-camera", "free");
  expect(await viewOf(a.page)).toMatchObject({ renderer: "3d", quality: "high", camera: "free" });
  expect(await viewOf(b.page)).toMatchObject({ renderer: "2d" });
  expect(await viewOf(c.page)).toMatchObject({ renderer: "2.5d", quality: "medium", camera: "aerial" });
  expect(await viewOf(d.page)).toMatchObject({ renderer: "3d", quality: "low", camera: "follow" });

  // A changes camera and view again and again. B, C and D do not move at all; A sends nothing about it.
  const others = [b, c, d];
  const before = await Promise.all(others.map((p) => settledView(p.page)));
  const aSent = await countSocketFrames(a);
  for (let i = 0; i < 3; i++) {
    await orbit(a, i % 2 ? -140 : 200);
    await visible(a.page.getByRole("button", { name: "Overview" })).click();
    await expect(a.page.getByTestId("game-board")).toHaveAttribute("data-camera", "overview");
    await visible(a.page.getByRole("button", { name: "Follow token" })).click();
    await expect(a.page.getByTestId("game-board")).toHaveAttribute("data-camera", "follow");
    await orbit(a, 120);
    await expect(a.page.getByTestId("game-board")).toHaveAttribute("data-camera", "free");
  }
  // And A's view: 2.5D, back to 3D (its quality and camera choices are its own).
  await visible(a.page.getByRole("radio", { name: "2.5D board" })).click();
  await expectBoard3d(a.page, "2.5d");
  await visible(a.page.getByRole("radio", { name: "3D board (preview)" })).click();
  await expectBoard3d(a.page, "3d");
  await expect(a.page.getByTestId("game-board")).toHaveAttribute("data-quality", "high");
  const after = await Promise.all(others.map((p) => settledView(p.page)));
  for (const [i, p] of others.entries()) expect(after[i], `${p.name}: untouched by Asha's camera and view`).toEqual(before[i]);
  expect(aSent(), "camera and view changes are never sent").toEqual([]);

  // Everyone plays: rolls, a six, moves. Every screen shows the server's positions, whatever its renderer.
  await playSome(table, a.id, 6);
  let snap = await table.expectInSync();
  expect(await viewOf(a.page)).toMatchObject({ renderer: "3d", quality: "high" });
  expect(await viewOf(b.page)).toMatchObject({ renderer: "2d" });
  expect(await viewOf(c.page)).toMatchObject({ renderer: "2.5d", quality: "medium", camera: "aerial" });
  expect(await viewOf(d.page)).toMatchObject({ renderer: "3d", quality: "low", camera: "follow" });

  // C refreshes (and reconnects): its own view comes back; nobody else's changes.
  const othersOfC = [a, b, d];
  const beforeRefresh = await Promise.all(othersOfC.map(async (p) => ({ renderer: (await viewOf(p.page)).renderer, quality: (await viewOf(p.page)).quality, camera: (await viewOf(p.page)).camera })));
  await c.page.reload();
  await expectBoard3d(c.page, "2.5d");
  await expect(c.page.getByTestId("game-board")).toHaveAttribute("data-quality", "medium");
  snap = await table.expectInSync();
  for (const [i, p] of othersOfC.entries()) {
    const v = await viewOf(p.page);
    expect({ renderer: v.renderer, quality: v.quality, camera: v.camera }, `${p.name}: unchanged by Chandan's refresh`).toEqual(beforeRefresh[i]);
  }
  await playSome(table, a.id, 2);
  snap = await table.expectInSync();
  expectNoDuplicates(table, snap);
  noErrors(players);
  for (const p of players) await p.context.close();
});

test("two players in two tabs of one browser keep their own views and cameras, through play and refreshes", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  // One browser (one localStorage), two tabs, no view chosen yet: both start on the default.
  const aman = await openPlayer(browser, "Aman", "desktop", { board: "default" });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  const ben = await openTab(aman, "Ben");
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  for (const p of [aman, ben]) await expectBoard3d(p.page, "2.5d");

  // Aman: 3D at High. Ben's tab stays on 2.5D, automatic quality.
  await visible(aman.page.getByRole("radio", { name: "3D board (preview)" })).click();
  await visible(aman.page.getByRole("radio", { name: "High" })).click();
  await expectBoard3d(aman.page, "3d");
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-quality", "high");
  await ben.page.waitForTimeout(1500);
  expect((await viewOf(ben.page)).renderer, "Ben's tab does not follow Aman's").toBe("2.5d");
  await expect(visible(ben.page.getByRole("radio", { name: "Auto" }))).toBeChecked();

  // Ben: the 2D board. Aman's tab stays 3D at High; his camera is his own.
  await visible(ben.page.getByRole("radio", { name: "2D board (lightweight)" })).click();
  await expect(ben.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await aman.page.waitForTimeout(1500);
  expect(await viewOf(aman.page)).toMatchObject({ renderer: "3d", quality: "high" });
  const benBefore = await settledView(ben.page);
  await orbit(aman, 180);
  await visible(aman.page.getByRole("button", { name: "Follow token" })).click();
  expect(await settledView(ben.page)).toEqual(benBefore);

  // Play: both tabs show the server's game.
  await playSome(table, aman.id, 4);
  await table.expectInSync();

  // Each refresh restores that tab's own player's view only.
  await ben.page.reload();
  await expect(ben.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  expect(await viewOf(aman.page)).toMatchObject({ renderer: "3d", quality: "high" });
  await aman.page.reload();
  await expectBoard3d(aman.page, "3d");
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-quality", "high");
  expect((await viewOf(ben.page)).renderer).toBe("2d");
  // Each seat remembers its own choice (for resuming it in a new tab); the old shared preference is not used.
  const seats = await aman.page.evaluate(() => ({ seats: JSON.parse(localStorage.getItem("ludo.view.seats.v2") ?? "{}") as Record<string, { mode: string; quality: string | null }>, legacy: localStorage.getItem("ludo.board-view.v1") }));
  expect(seats.seats[`${code}:${aman.id}`]).toMatchObject({ mode: "3d", quality: "high" });
  expect(seats.seats[`${code}:${ben.id}`]).toMatchObject({ mode: "2d" });
  expect(seats.legacy).toBeNull();
  const snap = await table.expectInSync();
  expectNoDuplicates(table, snap);
  noErrors([aman, ben]);
  await aman.context.close();
});
