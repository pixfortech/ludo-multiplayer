// The 2.5D board (and the 3D preview) in real browsers, against the real
// server and PostgreSQL. The board is a WebGL canvas: these tests read what
// it actually drew (screen pixels at the projected centres of the layout's
// cells) and pick tokens where they appear on screen, through the real
// raycaster, with a mouse and with touch. Positions are compared with the
// server and with the 2D board.
import { expect, test, type Browser, type WebSocketRoute } from "@playwright/test";
import { boardCells, boardTokens, colourDistance, expectBoard3d, hexRgb, pickToken3d, pixelAt } from "../support/board3d";
import { serverState } from "../support/control";
import { createRoom, joinRoom, openPlayer, plan, readBoard, seatTable, startGame, visible, type BoardView, type Player } from "../support/game";
import { readTimeline, startTimeline } from "../support/timeline";

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};
const close = async (players: Player[]) => {
  for (const p of players) await p.context.close();
};

async function game(browser: Browser, views: [BoardView, BoardView], devices: ["desktop" | "wide" | "tablet" | "phone", "desktop" | "wide" | "tablet" | "phone"] = ["desktop", "phone"]) {
  const aman = await openPlayer(browser, "Aman", devices[0], { board: views[0] });
  const ben = await openPlayer(browser, "Ben", devices[1], { board: views[1] });
  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  return { aman, ben, table, code, A: (id: number) => `${aman.id}:${id}`, B: (id: number) => `${ben.id}:${id}` };
}

test("the 2.5D board draws the approved topology: starts, safe stars, lanes and orientation", async ({ browser }) => {
  // Four players, so every seat is drawn in full colour.
  const players = [await openPlayer(browser, "Aman", "wide", { board: "2.5d" }), ...(await Promise.all(["Ben", "Cara", "Dev"].map((n) => openPlayer(browser, n, "phone", { board: "2d" }))))];
  const code = await createRoom(players[0]!, { players: 4 });
  for (const p of players.slice(1)) await joinRoom(p, code);
  await startGame(players[0]!, players);
  const page = players[0]!.page;
  await expectBoard3d(page);
  await page.waitForTimeout(400);
  const cells = await boardCells(page);

  // The layout's cells, in the layout's places: 52 track (4 starts), 20 lane cells, 4 stars.
  expect(cells.filter((c) => c.kind === "track" || c.kind === "start")).toHaveLength(52);
  expect(cells.filter((c) => c.kind === "start").map((c) => [c.seat, c.index])).toEqual([
    [0, 0],
    [1, 13],
    [2, 26],
    [3, 39],
  ]);
  expect(cells.filter((c) => c.kind === "lane")).toHaveLength(20);
  expect(cells.filter((c) => c.kind === "star")).toHaveLength(4);
  // Seen from above, as in 2D: columns run left to right and rows top to bottom.
  const at = (row: number, col: number) => cells.find((c) => c.row === row && c.col === col && c.kind !== "star")!;
  expect(at(6, 1).x).toBeLessThan(at(6, 13).x);
  expect(at(1, 6).y).toBeLessThan(at(13, 6).y);
  for (let col = 1; col < 6; col++) expect(at(6, col).x).toBeGreaterThan(at(6, col - 1).x);
  for (let row = 1; row < 6; row++) expect(at(row, 6).y).toBeGreaterThan(at(row - 1, 6).y);

  // What was drawn there: every start cell in its seat's colour, stars darker than plain cells, lanes deepening.
  // Cell colours are read off-centre, clear of the inlaid stars and chevrons.
  const cellPx = at(6, 2).x - at(6, 1).x;
  const off = (c: { x: number; y: number }) => ({ x: c.x + cellPx * 0.3, y: c.y + cellPx * 0.3 });
  const report: string[] = [];
  for (const c of cells.filter((x) => x.kind === "start" || x.kind === "lane" || x.kind === "track")) {
    const p = off(c);
    const px = await pixelAt(page, p.x, p.y);
    const d = colourDistance(px, hexRgb(c.colour));
    report.push(`${c.kind} r${c.row}c${c.col}: ${d.toFixed(1)}`);
    expect(d, `${c.kind} r${c.row}c${c.col} drawn ${px} for ${c.colour}`).toBeLessThan(c.kind === "track" ? 9 : 14);
  }
  const plain = await pixelAt(page, at(6, 3).x, at(6, 3).y);
  for (const s of cells.filter((x) => x.kind === "star")) {
    const px = await pixelAt(page, s.x, s.y);
    expect(colourDistance(px, plain), `the star at ${Math.round(s.x)},${Math.round(s.y)} stands out from a plain cell`).toBeGreaterThan(10);
  }
  for (let seat = 0; seat < 4; seat++) {
    const lane = cells.filter((c) => c.kind === "lane" && c.seat === seat);
    const lum = await Promise.all(lane.map(async (c) => (await pixelAt(page, off(c).x, off(c).y)).reduce((a, b) => a + b, 0)));
    for (let i = 1; i < lum.length; i++) expect(lum[i]!, `seat ${seat}'s lane deepens toward the centre`).toBeLessThan(lum[i - 1]!);
  }
  console.log(report.join("; "));

  // Every token is in its own base, on screen inside its base's corner.
  const tokens = await boardTokens(page);
  expect(tokens).toHaveLength(16);
  const centre = { x: (at(7, 1).x + at(7, 13).x) / 2, y: (at(1, 7).y + at(13, 7).y) / 2 };
  const seats = new Map((await serverState(code)).players.map((p) => [p.id, p.seat]));
  for (const p of players) {
    const seat = seats.get(p.id)!;
    for (const t of tokens.filter((x) => x.key.startsWith(`${p.id}:`))) {
      expect(t.step).toBe("base");
      expect(Math.sign(t.x - centre.x), `${p.name}'s token ${t.key}`).toBe(seat === 0 || seat === 3 ? -1 : 1);
      expect(Math.sign(t.y - centre.y), `${p.name}'s token ${t.key}`).toBe(seat < 2 ? -1 : 1);
    }
  }
  noErrors(players);
  await close(players);
});

test("2.5D play: mouse and touch pick only legal tokens, the die shows before tokens move, and the board follows the server", async ({ browser }) => {
  const { aman, ben, table, A, B } = await game(browser, ["2.5d", "2.5d"]);
  for (const p of [aman, ben]) await expectBoard3d(p.page);

  // Aman (mouse) rolls a six: every token in base may open.
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.state === "movable").length, { message: "Aman's four tokens are movable" }).toBe(4);
  // An opponent's token is not a choice: clicking it sends nothing.
  const before = (await table.state()).game!.stateVersion;
  await pickToken3d(aman, B(0));
  await aman.page.waitForTimeout(600);
  expect(aman.sent.move, "no move for an opponent's token").toBe(0);
  expect((await table.state()).game!.stateVersion).toBe(before);
  // Clicking his own token (through the raycaster) moves it, once the server agrees.
  await pickToken3d(aman, A(0));
  await expect.poll(async () => (await table.state()).game!.stateVersion, { message: "the click sends the move" }).toBeGreaterThan(before);
  expect(aman.sent.move).toBe(1);
  table.moves++;
  let snap = await table.expectInSync();
  expect(snap.game!.players.find((p) => p.id === aman.id)!.tokens[0]!.step).toBe(0);

  // A one: only the token on the board can move, so it moves by itself, after the die has shown the 1.
  for (const p of [aman, ben]) await startTimeline(p.page);
  await table.roll(1);
  snap = await table.expectInSync();
  for (const p of [aman, ben]) {
    const tl = await readTimeline(p.page);
    const die = tl.find((e) => e.target === "die" && e.value === "1");
    const moved = tl.find((e) => e.target === A(0) && e.value === "1");
    expect(die, `${p.name} saw the die`).toBeTruthy();
    expect(moved, `${p.name} saw the token move`).toBeTruthy();
    expect(moved!.t, `${p.name}: the die first, then the token`).toBeGreaterThan(die!.t);
  }

  // Ben (touch) rolls a six. Tapping an opponent's token does nothing; the first tap on his own token
  // previews the move, and only the second sends it.
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(ben.page)).filter((t) => t.state === "movable").length).toBe(4);
  const v = (await table.state()).game!.stateVersion;
  await pickToken3d(ben, A(0));
  await ben.page.waitForTimeout(400);
  await pickToken3d(ben, B(2));
  await expect.poll(async () => (await boardTokens(ben.page)).find((t) => t.key === B(2))?.state, { message: "the first tap selects" }).toBe("selected");
  await expect(ben.page.getByTestId("move-preview-3d")).toHaveAttribute("data-to", "0");
  expect(ben.sent.move, "nothing is sent on the first tap").toBe(0);
  expect((await table.state()).game!.stateVersion).toBe(v);
  await pickToken3d(ben, B(2));
  await expect.poll(async () => (await table.state()).game!.stateVersion).toBeGreaterThan(v);
  table.moves++;
  snap = await table.expectInSync();
  expect(snap.game!.players.find((p) => p.id === ben.id)!.tokens[2]!.step).toBe(0);

  // On screen, each token stands on the cell of its step (or in its base), on both pages.
  for (const p of [aman, ben]) {
    const cells = await boardCells(p.page);
    const tokens = await boardTokens(p.page);
    const cellPx = Math.abs(cells.find((c) => c.row === 6 && c.col === 2)!.x - cells.find((c) => c.row === 6 && c.col === 1)!.x);
    const startOf = (seat: number) => cells.find((c) => c.kind === "start" && c.seat === seat)!;
    const seat = (id: string) => snap.players.find((x) => x.id === id)!.seat;
    for (const [key, cellOf] of [
      [A(0), () => cells.find((c) => c.kind === "track" && c.index === 1)!],
      [B(2), () => startOf(seat(ben.id))],
    ] as const) {
      const t = tokens.find((x) => x.key === key)!;
      const c = cellOf();
      expect(Math.hypot(t.x - c.x, t.y - c.y), `${p.name}: ${key} stands on its cell`).toBeLessThan(cellPx * 0.6);
    }
  }
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("2.5D capture and home entry: the captured tokens go home and the runner enters its lane and the finish, in sync with 2D", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  // Aman plays on the 2.5D board, Ben on the 2D board: both must always agree with the server and each other.
  const { aman, ben, table, A, B } = await game(browser, ["2.5d", "2d"]);
  await expectBoard3d(aman.page);
  await table.act(6, () => 0); // Aman opens
  await table.act(1); // 0 → 1
  await table.act(6, () => 0); // Ben opens B0
  await table.act(6, () => 1); // Ben opens B1
  await table.act(2, () => 0); // B0 → 2 (absolute 28)
  await table.act(3); // Aman 1 → 4
  await table.act(2, () => 1); // B1 → 2: two of Ben's tokens on one cell
  await table.act(6, () => 0); // Aman 4 → 10
  await table.act(6, () => 0); // 10 → 16
  await table.act(5); // 16 → 21
  await table.act(6, () => 2); // Ben opens B2
  await table.act(6, () => 3); // Ben opens B3
  await table.act(6); // a third six: forfeited
  await table.act(6, () => 0); // Aman 21 → 27
  let snap = await table.act(1); // 27 → 28: captures both of Ben's tokens there
  expect(snap.history.filter((e) => e.type === "capture").length).toBe(2);
  for (const k of [B(0), B(1)]) {
    expect((await readBoard(aman.page))[`token-${k}`], "back in base on the 2.5D board").toBe("base");
    expect((await readBoard(ben.page))[`token-${k}`], "and on the 2D board").toBe("base");
  }
  // Back in base on screen too: inside Ben's base corner.
  const tokens = await boardTokens(aman.page);
  const cells = await boardCells(aman.page);
  const centre = { x: (cells.find((c) => c.row === 7 && c.col === 1)!.x + cells.find((c) => c.row === 7 && c.col === 13)!.x) / 2, y: (cells.find((c) => c.row === 1 && c.col === 7)!.y + cells.find((c) => c.row === 13 && c.col === 7)!.y) / 2 };
  for (const k of [B(0), B(1)]) {
    const t = tokens.find((x) => x.key === k)!;
    expect(t.x, "in the bottom-right base").toBeGreaterThan(centre.x);
    expect(t.y).toBeGreaterThan(centre.y);
  }

  // Then the runner goes home: up its own lane and into the finish. Ben, who has tokens out, creeps forward one
  // cell a turn with his rearmost token (well behind the runner); Aman follows the racing plan.
  const runner = () => snap.game!.players.find((p) => p.id === aman.id)!.tokens[0]!.step!;
  const turn = async () => {
    const g = snap.game!;
    if (g.currentPlayerId === aman.id) {
      const next = plan(g, [aman.id]);
      snap = await table.act(next.value, next.token);
    } else snap = await table.act(1, (legal) => Math.min(...legal.map((m) => m.tokenId)));
  };
  while (runner() < 45) await turn();
  for (const p of [aman, ben]) await startTimeline(p.page);
  while (runner() !== 56) await turn();
  for (const p of [aman, ben]) {
    const tl = await readTimeline(p.page);
    const lane = tl.filter((e) => e.target === A(0) && Number(e.value) >= 51).map((e) => e.value);
    expect(lane.at(-1), `${p.name}: finished`).toBe("56");
    expect(lane, `${p.name}: through the lane in order`).toEqual([...lane].sort((x, y) => Number(x) - Number(y)));
  }
  await expect(aman.page.getByTestId(`token-${A(0)}`)).toHaveAttribute("data-state", "finished");
  const finished = (await boardTokens(aman.page)).find((t) => t.key === A(0))!;
  expect(Math.hypot(finished.x - centre.x, finished.y - centre.y), "the finished token is at the centre").toBeLessThan(Math.abs(cells.find((c) => c.row === 7 && c.col === 5)!.x - centre.x));
  await table.expectInSync();
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("switching views never restarts the game; refresh, reconnect and full screen keep the 2.5D board exact", async ({ browser }) => {
  const aman = await openPlayer(browser, "Aman", "desktop", { board: "default" });
  const ben = await openPlayer(browser, "Ben", "tablet", { board: "2.5d" });
  let offline = false;
  const routes = new Set<WebSocketRoute>();
  await ben.page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (offline) {
      void ws.close({ code: 1006, reason: "network down" });
      return;
    }
    ws.connectToServer();
    routes.add(ws);
  });
  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  // The default view is the 2.5D board.
  await expectBoard3d(aman.page);
  await table.act(6, () => 0);
  await table.act(4);
  const sentBefore = { ...aman.sent };
  const version = (await table.state()).game!.stateVersion;
  const board = await readBoard(aman.page);

  const view = (label: string) => visible(aman.page.getByRole("radio", { name: label }));
  // 2D, then the 3D preview, then back: the same game, the same tokens, nothing sent.
  await view("2D board (lightweight)").click();
  await expect(aman.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  expect(await readBoard(aman.page)).toEqual(board);
  await view("3D board (preview)").click();
  await expectBoard3d(aman.page, "3d");
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "overview");
  expect(await readBoard(aman.page)).toEqual(board);
  // The 3D camera: orbit by dragging, follow the token, back to the overview. The camera never moves a token.
  const canvas = (await aman.page.locator('[data-testid="game-board"] canvas').boundingBox())!;
  await aman.page.mouse.move(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.8);
  await aman.page.mouse.down();
  await aman.page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.7, { steps: 8 });
  await aman.page.mouse.up();
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "free");
  await visible(aman.page.getByRole("button", { name: "Follow token" })).click();
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "follow");
  await visible(aman.page.getByRole("button", { name: "Overview" })).click();
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "overview");
  await view("2.5D board").click();
  await expectBoard3d(aman.page);
  expect(await readBoard(aman.page)).toEqual(board);
  expect((await table.state()).game!.stateVersion, "switching views changed nothing on the server").toBe(version);
  expect(aman.sent).toEqual(sentBefore);
  await table.act(6, () => 0); // Ben opens
  await table.act(2); // and moves on: Aman's turn

  // A refresh: the chosen view is remembered and the board is exact.
  await aman.page.reload();
  await expectBoard3d(aman.page);
  await table.expectInSync();

  // Ben's network drops and returns: his 2.5D board snaps to the server's state.
  offline = true;
  table.offline.add(ben);
  for (const ws of routes) void ws.close({ code: 1006, reason: "network down" });
  routes.clear();
  await expect(visible(ben.page.getByText(/Reconnecting|Offline/))).toBeVisible();
  await table.act(3); // Aman plays on while Ben is away
  offline = false;
  table.offline.delete(ben);
  // The simulated outage leaves one connection attempt hanging until socket.io's 20 s connect timeout
  // (a real network failure ends attempts at once), so allow for that before checking the board.
  await expect(visible(ben.page.getByText("Reconnected: your seat is back"))).toBeVisible({ timeout: 45_000 });
  await table.expectInSync();
  await expectBoard3d(ben.page);

  // Full screen: the board is redrawn at the new size and stays whole.
  await visible(aman.page.getByRole("button", { name: "Full screen" })).click();
  await expect.poll(() => aman.page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expectBoard3d(aman.page);
  const fs = (await aman.page.locator('[data-testid="game-board"] canvas').boundingBox())!;
  const vp = aman.page.viewportSize()!;
  expect(fs.y + fs.height).toBeLessThanOrEqual(vp.height + 1);
  await visible(aman.page.getByRole("button", { name: "Exit full screen" })).click();
  await expect.poll(() => aman.page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await table.act(2);
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("without WebGL, or when the 3D board loses its context, the game continues on the 2D board", async ({ browser }) => {
  // No WebGL at all: the 2D board, and the 3D views offered as unavailable with the reason.
  const aman = await openPlayer(browser, "Aman", "desktop", { board: "default" });
  await aman.context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  const ben = await openPlayer(browser, "Ben", "desktop", { board: "2.5d" });
  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  await expect(aman.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await expect(visible(aman.page.getByRole("radio", { name: "2.5D board" }))).toBeDisabled();
  await expect(visible(aman.page.getByText("3D needs WebGL, which this browser does not offer."))).toBeVisible();
  await table.act(6, () => 0);

  // Ben's 3D board loses its WebGL context mid-game: the 2D board takes over, and play continues.
  await expectBoard3d(ben.page);
  await ben.page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="game-board"] canvas') as HTMLCanvasElement;
    (canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context") as { loseContext: () => void }).loseContext();
  });
  await expect(ben.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await expect(visible(ben.page.getByTestId("game-status"))).toContainText("2D board");
  await table.act(5);
  await table.act(6, () => 0);
  await table.expectInSync();
  noErrors([aman, ben]);
  await close([aman, ben]);
});

const SIZES = [
  { label: "desktop", width: 1920, height: 1080 },
  { label: "laptop", width: 1366, height: 768 },
  { label: "tablet-landscape", width: 1024, height: 768 },
  { label: "tablet-portrait", width: 768, height: 1024 },
  { label: "phone-portrait", width: 390, height: 844 },
  { label: "phone-landscape", width: 844, height: 390 },
] as const;

test("the 2.5D board fits every supported screen: whole board and all tokens in view, no sideways scroll", async ({ browser }) => {
  const { aman, ben } = await game(browser, ["2.5d", "2.5d"], ["wide", "phone"]);
  for (const mode of ["2.5d", "3d"] as const) {
    for (const size of SIZES) {
      const p = size.width < 900 ? ben : aman;
      if (mode === "3d" && size.width < 900) continue;
      if (mode === "3d") await visible(p.page.getByRole("radio", { name: "3D board (preview)" })).click();
      await p.page.setViewportSize({ width: size.width, height: size.height });
      await expectBoard3d(p.page, mode);
      await p.page.waitForTimeout(500);
      const where = `${mode} at ${size.label}`;
      const canvas = (await p.page.locator('[data-testid="game-board"] canvas').boundingBox())!;
      expect(canvas.x, where).toBeGreaterThanOrEqual(0);
      expect(canvas.x + canvas.width, where).toBeLessThanOrEqual(size.width + 0.5);
      expect(canvas.y + canvas.height, where).toBeLessThanOrEqual(size.height + 0.5);
      expect(await p.page.evaluate(() => document.documentElement.scrollWidth), `${where}: no sideways scroll`).toBeLessThanOrEqual(size.width);
      const inCanvas = (pt: { x: number; y: number }) => pt.x > canvas.x && pt.x < canvas.x + canvas.width && pt.y > canvas.y && pt.y < canvas.y + canvas.height;
      // Once the view has settled (the 3D camera eases into its overview), every cell and token is in view.
      const outOfView = async () => [...(await boardCells(p.page)).filter((c) => !inCanvas(c)).map((c) => `cell ${c.kind} r${c.row}c${c.col}`), ...(await boardTokens(p.page)).filter((t) => !inCanvas(t)).map((t) => `token ${t.key}`)];
      await expect.poll(outOfView, { message: `${where}: the whole board and every token in view`, timeout: 5000 }).toEqual([]);
      expect(await boardCells(p.page)).toHaveLength(76);
      if (process.env.E2E_SHOTS_DIR) await p.page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/board-${mode}-${size.label}.png` });
      if (mode === "3d") await visible(p.page.getByRole("radio", { name: "2.5D board" })).click();
    }
  }
  noErrors([aman, ben]);
  await close([aman, ben]);
});
