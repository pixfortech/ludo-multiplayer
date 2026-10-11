// Batch C.2: the living Kolkata 3D environment, in real browsers against the
// real server. The city is a WebGL scene round the board, so these tests read
// what the renderer reports (which assets it built, where each landmark lands
// on screen, frames drawn, GPU objects) and what it drew (pixels), and they
// play through it with a mouse and with touch:
//  - the landmarks and the ambient life are built, around the board and never
//    over a cell; clicks on the scenery do nothing, clicks on tokens play;
//  - the ambient life moves on its own capped clock, stops while the tab is
//    hidden and under reduced motion, and never changes the board or sends
//    anything;
//  - every supported screen size, in 2.5D and 3D;
//  - switching views and graphics quality mid-turn, a refresh, a lost WebGL
//    context and a change of city.
// Set E2E_SHOTS_DIR to save a screenshot of every size and mode.
import { expect, test, type Browser, type Page, type WebSocketRoute } from "@playwright/test";
import { boardCells, boardTokens, colourDistance, decodePng, expectBoard3d, hexRgb, pickToken3d, pixelAt } from "../support/board3d";
import { createRoom, joinRoom, openPlayer, plan, readBoard, seatTable, startGame, visible, type BoardView, type Device, type Player } from "../support/game";

const LANDMARKS = ["howrah-bridge", "hooghly-river", "victoria-memorial", "writers-building", "shaheed-minar", "biswa-bangla-gate"] as const;
const LIFE = ["yellow-taxi", "tram", "ferry", "pedestrians", "trees", "lamp-posts", "heritage-houses", "ghats", "book-stalls", "contemporary-towers", "howrah-station", "skyline"] as const;

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};
const close = async (players: Player[]) => {
  for (const p of players) await p.context.close();
};

async function kolkataGame(browser: Browser, views: [BoardView, BoardView], devices: [Device, Device], reduced: [boolean, boolean] = [false, false], amanQuality?: "low" | "medium" | "high") {
  const aman = await openPlayer(browser, "Aman", devices[0], { board: views[0], reducedMotion: reduced[0] });
  // A fixed graphics level, where a test is not about the automatic one (its steps rebuild the canvas).
  if (amanQuality) await aman.context.addInitScript(([mode, q]) => localStorage.setItem("ludo.board-view.v1", JSON.stringify({ mode, quality: q })), [views[0], amanQuality] as const);
  const ben = await openPlayer(browser, "Ben", devices[1], { board: views[1], reducedMotion: reduced[1] });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  return { aman, ben, table, code, A: (id: number) => `${aman.id}:${id}`, B: (id: number) => `${ben.id}:${id}` };
}

interface EnvironmentReport {
  renderer: string | null;
  staged: boolean;
  environment: string | null;
  quality: string | null;
  canvas: { x: number; y: number; width: number; height: number; gl: string | null } | null;
  assets: string[];
  anchors: { id: string; x: number; y: number; inView: boolean; uncovered: boolean }[];
  frames: number;
  geometries: number;
  textures: number;
  calls: number;
  triangles: number;
  backdrop: string | null;
}

/** What the 3D board reports about its city: built assets, on-screen landmarks, frames and GPU objects. */
function environmentOf(page: Page): Promise<EnvironmentReport> {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    const canvasEl = document.querySelector<HTMLCanvasElement>("canvas[data-board-gl]");
    const c = canvasEl?.getBoundingClientRect() ?? null;
    const mirror = document.querySelector<HTMLElement>('[data-testid="environment-mirror"]');
    const anchors = [...(mirror?.querySelectorAll<HTMLElement>("li[data-cx]") ?? [])].map((el) => {
      const x = (c?.left ?? 0) + Number(el.dataset.cx);
      const y = (c?.top ?? 0) + Number(el.dataset.cy);
      const inView = el.dataset.inView === "true";
      const hit = inView && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
      return { id: el.dataset.id!, x, y, inView, uncovered: hit === canvasEl };
    });
    const n = (v?: string) => Number(v ?? 0);
    return {
      renderer: board?.dataset.renderer ?? null,
      staged: board?.dataset.stage !== undefined,
      environment: board?.dataset.environment ?? null,
      quality: board?.dataset.quality ?? null,
      canvas: c ? { x: c.x, y: c.y, width: c.width, height: c.height, gl: canvasEl!.dataset.boardGl ?? null } : null,
      assets: (mirror?.dataset.assets ?? "").split(" ").filter(Boolean),
      anchors,
      frames: n(board?.dataset.frames),
      geometries: n(board?.dataset.glGeometries),
      textures: n(board?.dataset.glTextures),
      calls: n(board?.dataset.glCalls),
      triangles: n(board?.dataset.glTriangles),
      backdrop: document.querySelector("[data-city-backdrop]")?.getAttribute("data-city-backdrop") ?? null,
    };
  });
}

async function expectKolkataBuilt(page: Page) {
  await expect
    .poll(async () => {
      const built = new Set((await environmentOf(page)).assets);
      return [...LANDMARKS, ...LIFE].filter((a) => !built.has(a));
    }, { message: "every Kolkata landmark and the ambient life are built", timeout: 20_000 })
    .toEqual([]);
}

/** Every cell drawn in its own colour, with the city around it (nothing over the board, no fog or tint on it). */
async function expectCellsClear(page: Page, where: string) {
  const cells = await boardCells(page);
  const at = (row: number, col: number) => cells.find((c) => c.row === row && c.col === col && c.kind !== "star")!;
  const cellPx = Math.abs(at(6, 2).x - at(6, 1).x);
  const covered = await page.evaluate((points) => points.filter((p) => !(document.elementFromPoint(p.x, p.y) as HTMLElement | null)?.matches("canvas[data-board-gl]")).map((p) => p.label), cells.map((c) => ({ x: c.x, y: c.y, label: `${c.kind} r${c.row}c${c.col}` })));
  expect(covered, `${where}: nothing covers a cell`).toEqual([]);
  for (const c of cells.filter((x) => x.kind === "start" || x.kind === "lane")) {
    const px = await pixelAt(page, c.x + cellPx * 0.3, c.y + cellPx * 0.3);
    expect(colourDistance(px, hexRgb(c.colour)), `${where}: ${c.kind} r${c.row}c${c.col} drawn ${px} for ${c.colour}`).toBeLessThan(16);
  }
}

test("Kolkata surrounds the board: landmarks and life are built round it, cells stay clear, and only tokens take a click or tap", async ({ browser }) => {
  const { aman, ben, table, A, B } = await kolkataGame(browser, ["2.5d", "3d"], ["wide", "phone"], [false, false], "medium");

  // Aman's wide screen, in 2.5D: Kolkata fills the window behind the game.
  await expectBoard3d(aman.page);
  await expectKolkataBuilt(aman.page);
  let env = await environmentOf(aman.page);
  expect(env).toMatchObject({ renderer: "2.5d", staged: true, environment: "kolkata", backdrop: null });
  expect(env.canvas).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080, gl: "stage" });
  const host = await aman.page.getByTestId("board-stage").evaluate((el) => ({ position: getComputedStyle(el).position, z: getComputedStyle(el).zIndex }));
  expect(host).toEqual({ position: "fixed", z: "0" });
  await expectCellsClear(aman.page, "2.5D on the stage");
  // The river and the bridge show beside the left-hand panels, the Shaheed Minar past the right-hand rail.
  const show = (id: string) => env.anchors.find((a) => a.id === id)!;
  console.log(`2.5D landmarks: ${env.anchors.map((a) => `${a.id} ${a.inView ? (a.uncovered ? "seen" : "behind a panel") : "out of view"}`).join(", ")}`);
  for (const id of ["howrah-bridge", "hooghly-river", "shaheed-minar"]) expect(show(id).uncovered, `${id} is seen in 2.5D`).toBe(true);
  // The board's cells lie inside the board's own slot, which the city never enters.
  const slot = (await aman.page.getByTestId("game-board").boundingBox())!;
  for (const c of await boardCells(aman.page)) {
    expect(c.x).toBeGreaterThan(slot.x);
    expect(c.x).toBeLessThan(slot.x + slot.width);
    expect(c.y).toBeGreaterThan(slot.y);
    expect(c.y).toBeLessThan(slot.y + slot.height);
  }

  // Ben's phone, in 3D: the city is in the board's own canvas.
  await expectBoard3d(ben.page, "3d");
  await expectKolkataBuilt(ben.page);
  const benEnv = await environmentOf(ben.page);
  expect(benEnv).toMatchObject({ renderer: "3d", staged: false, environment: "kolkata" });
  expect(benEnv.canvas!.gl).toBe("board");
  console.log(`3D phone landmarks in view: ${benEnv.anchors.filter((a) => a.inView).map((a) => a.id).join(", ")}`);
  // The phone's square canvas frames the board closely: the nearest landmarks show (the river, Writers' Building).
  expect(benEnv.anchors.filter((a) => a.inView && (LANDMARKS as readonly string[]).includes(a.id)).length, "landmarks in the phone's 3D overview").toBeGreaterThanOrEqual(2);

  // The city measures what this device can afford in its first seconds, and decides quickly where frames are slow.
  const t0 = Date.now();
  await expect.poll(() => aman.page.getByTestId("game-board").getAttribute("data-ambient"), { message: "the city has decided its rate", timeout: 30_000 }).not.toBe("measuring");
  console.log(`the city decided "${await aman.page.getByTestId("game-board").getAttribute("data-ambient")}" within ${Date.now() - t0} ms of being checked`);

  // Aman rolls a six. Clicks on the scenery (each landmark in sight, the river, the ring road's corners) do nothing.
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.state === "movable").length).toBe(4);
  const version = (await table.state()).game!.stateVersion;
  env = await environmentOf(aman.page);
  const scenery = [...env.anchors.filter((a) => a.uncovered), { id: "below the board", x: slot.x + slot.width / 2, y: Math.min(1070, slot.y + slot.height + 30), uncovered: true }];
  for (const s of scenery) {
    const hit = await aman.page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === document.querySelector("canvas[data-board-gl]"), s);
    if (!hit) continue;
    await aman.page.mouse.click(s.x, s.y);
  }
  await aman.page.waitForTimeout(600);
  expect(aman.sent.move, "clicks on the city send nothing").toBe(0);
  expect((await table.state()).game!.stateVersion).toBe(version);
  await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.state === "movable").length, { message: "the choice is still open" }).toBe(4);
  // A click on his token, through the city's stage, plays it.
  await pickToken3d(aman, A(0));
  await expect.poll(async () => (await table.state()).game!.stateVersion, { message: "the click sends the move" }).toBeGreaterThan(version);
  table.moves++;
  await table.expectInSync();
  await table.act(2); // the bonus roll: the one token out moves by itself

  // Ben, on his phone in 3D, taps his token among the city's scenery.
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(ben.page)).filter((t) => t.state === "movable").length).toBe(4);
  const before = (await table.state()).game!.stateVersion;
  // On touch the first tap selects and previews; the second plays.
  await pickToken3d(ben, B(1));
  await expect.poll(async () => (await boardTokens(ben.page)).find((t) => t.key === B(1))?.state, { message: "the first tap selects" }).toBe("selected");
  expect(ben.sent.move, "nothing is sent on the first tap").toBe(0);
  await pickToken3d(ben, B(1));
  await expect.poll(async () => (await table.state()).game!.stateVersion, { message: "the tap sends the move" }).toBeGreaterThan(before);
  table.moves++;
  const snap = await table.expectInSync();
  expect(snap.game!.players.find((p) => p.id === ben.id)!.tokens[1]!.step).toBe(0);
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("the city's life moves on its own capped clock, rests when hidden, under reduced motion or on a device that cannot afford it, and never touches the game", async ({ browser }) => {
  const { aman, ben, table } = await kolkataGame(browser, ["2.5d", "3d"], ["wide", "phone"], [false, true]);
  await expectBoard3d(aman.page);
  await expectKolkataBuilt(aman.page);
  await table.act(6, () => 0);
  await table.act(3);
  // It is Ben's turn: Aman's board has nothing to do, so every frame it draws is the city's.
  const version = (await table.state()).game!.stateVersion;
  const sent = { ...aman.sent };
  const board = await readBoard(aman.page);
  const frames = async (p: Page) => Number((await p.getByTestId("game-board").getAttribute("data-frames")) ?? 0);
  const ambient = (p: Page) => p.getByTestId("game-board").getAttribute("data-ambient");

  // Choosing another graphics level rebuilds the city, which then runs live while it measures what this device can afford.
  const level = (await aman.page.getByTestId("game-board").getAttribute("data-quality")) === "medium" ? "low" : "medium";
  await visible(aman.page.getByRole("radio", { name: level === "low" ? "Low" : "Medium" })).click();
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-quality", level);
  await expectKolkataBuilt(aman.page);
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-ambient", "measuring");
  const cells = await boardCells(aman.page);
  // Two pictures apart: the traffic has moved; the board's cells have not changed by a pixel.
  const f0 = await frames(aman.page);
  const t0 = Date.now();
  const shot = async () => decodePng(await aman.page.screenshot({ animations: "allow" }));
  const one = await shot();
  await aman.page.waitForTimeout(700);
  const two = await shot();
  const rate = ((await frames(aman.page)) - f0) / ((Date.now() - t0) / 1000);
  console.log(`ambient frames per second while live (wide 2.5D, ${level}): ${rate.toFixed(1)}`);
  expect(rate, "at most the capped ambient rate (Low 12, Medium 20 a second), never the display's").toBeLessThanOrEqual(22);
  let moved = 0;
  for (let y = 0; y < one.height; y += 4) for (let x = 0; x < one.width; x += 4) if (colourDistance(one.pixel(x, y), two.pixel(x, y)) > 6) moved++;
  expect(moved, "the taxis, trams, ferries and people moved").toBeGreaterThan(20);
  for (const c of cells) {
    const [x, y] = [Math.round(c.x), Math.round(c.y)];
    expect(colourDistance(one.pixel(x, y), two.pixel(x, y)), `cell r${c.row}c${c.col} unchanged`).toBeLessThan(2);
  }

  // Hidden tab: the city stops asking for frames; back in view, it carries on.
  await aman.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await aman.page.waitForTimeout(800);
  const hidden = await frames(aman.page);
  await aman.page.waitForTimeout(3000);
  expect(await frames(aman.page), "no frames while hidden").toBe(hidden);
  await aman.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => frames(aman.page), { message: "frames again once visible", timeout: 10_000 }).toBeGreaterThan(hidden);

  // Once it has measured, the city keeps its rate, slows down, or (where frames cost too much, as with software WebGL) rests.
  await expect.poll(async () => (await environmentOf(aman.page)).assets.length > 0 && (await ambient(aman.page)) !== null, { timeout: 5000 }).toBe(true);
  await aman.page.waitForTimeout(8000);
  const settled = await ambient(aman.page);
  const fps = Number(await aman.page.getByTestId("game-board").getAttribute("data-ambient-fps"));
  const a = await frames(aman.page);
  await aman.page.waitForTimeout(3000);
  const settledRate = ((await frames(aman.page)) - a) / 3;
  console.log(`settled: ${settled} at ${fps} a second; drew ${settledRate.toFixed(1)} frames a second`);
  expect(["live", "eased", "resting"]).toContain(settled);
  // A resting city draws nothing of its own; the Crimson team's characters (C.3A) keep a slow pulse (at most 2 a second) so they never freeze.
  if (settled === "resting") expect(settledRate, "a resting city draws only the characters' pulse").toBeLessThanOrEqual(2.5);
  else expect(settledRate).toBeLessThanOrEqual(fps + 2);
  expect(await readBoard(aman.page)).toEqual(board);
  expect(aman.sent, "the city sends nothing").toEqual(sent);
  expect((await table.state()).game!.stateVersion).toBe(version);

  // Ben asked for reduced motion: his city is built, taxis and all, but stands still.
  await expectBoard3d(ben.page, "3d");
  await expectKolkataBuilt(ben.page);
  await expect(ben.page.getByTestId("game-board")).toHaveAttribute("data-ambient", "still");
  await ben.page.waitForTimeout(2000);
  const still = await frames(ben.page);
  await ben.page.waitForTimeout(3000);
  expect(await frames(ben.page), "reduced motion: no ambient frames").toBe(still);

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
  { label: "small-phone", width: 360, height: 800 },
  { label: "phone-landscape", width: 844, height: 390 },
  { label: "small-phone-landscape", width: 740, height: 360 },
] as const;

test("Kolkata fits every supported screen in 2.5D and 3D: the whole board in view and uncovered, the city where there is room", async ({ browser }) => {
  const { aman, ben } = await kolkataGame(browser, ["2.5d", "2.5d"], ["wide", "phone"]);
  const report: string[] = [];
  for (const mode of ["2.5d", "3d"] as const) {
    for (const size of SIZES) {
      const p = size.width >= 1024 ? aman : ben;
      await p.page.setViewportSize({ width: size.width, height: size.height });
      if ((await p.page.getByTestId("game-board").getAttribute("data-renderer")) !== mode) await visible(p.page.getByRole("radio", { name: mode === "3d" ? "3D board (preview)" : "2.5D board" })).click();
      await expectBoard3d(p.page, mode);
      const where = `${mode} at ${size.label}`;
      const wide = size.width >= 1024 && size.height >= 541;
      // The stage (the city filling the window) needs a wide screen; elsewhere 3D shows the city in the board's canvas and 2.5D keeps the 2D backdrop.
      await expect.poll(async () => (await environmentOf(p.page)).staged, { message: `${where}: stage` }).toBe(wide);
      const env = await environmentOf(p.page);
      expect(env.environment, `${where}: environment`).toBe(wide || mode === "3d" ? "kolkata" : null);
      if (!env.environment) expect(env.backdrop, `${where}: the 2D Kolkata backdrop`).toBe("kolkata");
      expect(await p.page.evaluate(() => document.documentElement.scrollWidth), `${where}: no sideways scroll`).toBeLessThanOrEqual(size.width);
      // Once the camera settles, every cell and token is inside the board's slot.
      const slot = async () => (await p.page.getByTestId("game-board").boundingBox())!;
      // An automatic quality step after a resize rebuilds the canvas: for a moment there is none, so these checks retry.
      const outside = async () => {
        try {
          const s = await slot();
          const inSlot = (pt: { x: number; y: number }) => pt.x > s.x - 1 && pt.x < s.x + s.width + 1 && pt.y > s.y - 1 && pt.y < s.y + s.height + 1;
          return [...(await boardCells(p.page)).filter((c) => !inSlot(c)).map((c) => `cell r${c.row}c${c.col}`), ...(await boardTokens(p.page)).filter((t) => !inSlot(t)).map((t) => `token ${t.key}`)];
        } catch {
          return ["the canvas is being rebuilt"];
        }
      };
      await expect.poll(outside, { message: `${where}: the whole board and every token in its slot`, timeout: 15_000 }).toEqual([]);
      // Where the board is on screen, nothing (panel, bar or scenery) covers a cell.
      const s = await slot();
      if (s.y >= 0 && s.y + s.height <= size.height) {
        const covered = async () => {
          try {
            return await p.page.evaluate(
              (points) => points.filter((pt) => !(document.elementFromPoint(pt.x, pt.y) as HTMLElement | null)?.matches("canvas[data-board-gl]")).length,
              (await boardCells(p.page)).map((c) => ({ x: c.x, y: c.y })),
            );
          } catch {
            return -1; // the canvas is being rebuilt
          }
        };
        await expect.poll(covered, { message: `${where}: cells covered`, timeout: 8000 }).toBe(0);
      }
      if (env.environment) await expectKolkataBuilt(p.page);
      const shown = (await environmentOf(p.page)).anchors.filter((a) => a.inView && (LANDMARKS as readonly string[]).includes(a.id)).length;
      report.push(`${where}: ${env.staged ? "stage" : env.environment ? "city in canvas" : "2D backdrop"}, landmarks in view ${shown}`);
      if (mode === "3d") expect(shown, `${where}: landmarks in the 3D view`).toBeGreaterThanOrEqual(env.staged ? 4 : 2);
      if (process.env.E2E_SHOTS_DIR) await p.page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/kolkata-${mode}-${size.label}.png` });
    }
  }
  console.log(report.join("\n"));
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("switching views and graphics quality mid-turn, a refresh, a lost context and a change of city keep the game exact", async ({ browser }) => {
  const { aman, ben, table, A } = await kolkataGame(browser, ["2.5d", "2d"], ["wide", "phone"]);
  await expectBoard3d(aman.page);
  await expectKolkataBuilt(aman.page);
  await table.act(6, () => 0);
  await table.act(4);
  await table.act(1); // Ben, nothing out: passes
  const board = await readBoard(aman.page);
  const sent = { ...aman.sent };
  const view = (label: string) => visible(aman.page.getByRole("radio", { name: label }));

  // 2D: the 2D Kolkata backdrop, no canvas. 3D: the city on the stage again. Back to 2.5D. Nothing sent, nothing changed.
  await view("2D board (lightweight)").click();
  await expect(aman.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await expect(aman.page.locator("canvas[data-board-gl]")).toHaveCount(0);
  await expect(aman.page.locator('[data-city-backdrop="kolkata"]')).toBeAttached();
  expect(await readBoard(aman.page)).toEqual(board);
  await view("3D board (preview)").click();
  await expectBoard3d(aman.page, "3d");
  await expectKolkataBuilt(aman.page);
  expect((await environmentOf(aman.page)).staged).toBe(true);
  expect(await readBoard(aman.page)).toEqual(board);
  await view("2.5D board").click();
  await expectBoard3d(aman.page);
  await expectKolkataBuilt(aman.page);
  expect(aman.sent).toEqual(sent);

  // Graphics quality, changed while a choice is open: each level rebuilds the city at its detail, the choice survives,
  // and GPU objects come back to the same count (nothing leaks between rebuilds).
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.state === "movable").length).toBe(4);
  const counts: Record<string, { geometries: number; triangles: number; calls: number }> = {};
  for (const level of ["Medium", "High", "Low", "Medium"] as const) {
    await view(level).click();
    await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-quality", level.toLowerCase());
    await expectBoard3d(aman.page);
    await expectKolkataBuilt(aman.page);
    // The old canvas (and its WebGL context) is gone: one board canvas at a time.
    await expect(aman.page.locator("canvas")).toHaveCount(1);
    await aman.page.waitForTimeout(2500);
    const e = await environmentOf(aman.page);
    const key = counts[level] ? `${level} (again)` : level;
    counts[key] = { geometries: e.geometries, triangles: e.triangles, calls: e.calls };
  }
  console.table(counts);
  // Each level builds a fresh renderer, so its counts cannot carry anything over; they stay bounded, and the
  // second Medium is within what the levels drew (the movable tokens' rings appear once a choice is open).
  // Under 80 for the city and board, plus the four Crimson characters (C.3A: a few primitives and props each).
  for (const [level, c] of Object.entries(counts)) expect(c.geometries, `${level}: GPU geometries bounded`).toBeLessThan(130);
  expect(counts["Medium (again)"]!.geometries).toBeLessThanOrEqual(Math.max(...Object.values(counts).map((c) => c.geometries)));
  expect(counts.Low!.triangles, "Low draws less than High").toBeLessThan(counts.High!.triangles);
  // On a software GPU under load the WebGL context can be lost (seen once on the Windows runner); the board then
  // falls back to 2D with a notice, which is the designed behaviour. Either way the choice stays open and the pick plays.
  const on3d = (await aman.page.locator("canvas[data-board-gl]").count()) > 0;
  if (on3d) {
    await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.state === "movable").length, { message: "the choice is still open" }).toBe(4);
    const version = (await table.state()).game!.stateVersion;
    await pickToken3d(aman, A(1));
    await expect.poll(async () => (await table.state()).game!.stateVersion, { message: "the pick after the quality changes plays" }).toBeGreaterThan(version);
    table.moves++;
    await table.expectInSync();
  } else {
    console.log(`after the quality changes the board fell back to 2D: ${await visible(aman.page.getByTestId("game-status")).textContent()}`);
    await expect(visible(aman.page.getByTestId("game-status"))).toContainText("2D board");
    await table.move(1);
    await table.expectInSync();
  }
  await table.act(5, () => 0); // the bonus roll

  // A refresh: back on the stage with the city, exact.
  await aman.page.reload();
  await expectBoard3d(aman.page);
  await expectKolkataBuilt(aman.page);
  await table.expectInSync();

  // The WebGL context is lost: the 2D board (with its Kolkata backdrop) takes over and play continues.
  await table.act(2); // Ben
  await aman.page.evaluate(() => {
    const canvas = document.querySelector("canvas[data-board-gl]") as HTMLCanvasElement;
    (canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context") as { loseContext: () => void }).loseContext();
  });
  await expect(aman.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await expect(visible(aman.page.getByTestId("game-status"))).toContainText("2D board");
  await expect(aman.page.locator('[data-city-backdrop="kolkata"]')).toBeAttached();
  await expect(aman.page.getByTestId("board-stage")).toHaveCount(0);
  await table.act(3, () => 0);
  await table.expectInSync();
  noErrors([aman, ben]);
  await close([aman, ben]);

  // Another city: no Kolkata scene, no stage, and the Kolkata chunk is never fetched.
  const dev = await openPlayer(browser, "Dev", "wide", { board: "default" });
  const eve = await openPlayer(browser, "Eve", "phone", { board: "2d" });
  const code = await createRoom(dev, { players: 2, city: "Delhi" });
  await joinRoom(eve, code);
  await startGame(dev, [dev, eve]);
  await expectBoard3d(dev.page);
  await dev.page.waitForTimeout(1500);
  const delhi = await environmentOf(dev.page);
  expect(delhi).toMatchObject({ staged: false, environment: null, assets: [], backdrop: "delhi" });
  expect(delhi.canvas!.gl).toBe("board");
  await expect(dev.page.getByTestId("environment-mirror")).toHaveCount(0);
  await expect(dev.page.getByTestId("board-stage")).toHaveCount(0);
  const chunks = await dev.page.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /Kolkata(Environment|Ambient)/.test(n)));
  expect(chunks, "the Kolkata 3D chunk is not loaded for Delhi").toEqual([]);
  noErrors([dev, eve]);
  await close([dev, eve]);
});

test("gameplay in the living city: captures, bonus turns, home entry, token focus, camera reset and a reconnect, in sync on the stage and on a phone in 3D", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const aman = await openPlayer(browser, "Aman", "wide", { board: "3d" });
  const ben = await openPlayer(browser, "Ben", "phone", { board: "3d" });
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
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  const A = (id: number) => `${aman.id}:${id}`;
  const B = (id: number) => `${ben.id}:${id}`;
  for (const p of [aman, ben]) {
    await expectBoard3d(p.page, "3d");
    await expectKolkataBuilt(p.page);
  }
  expect((await environmentOf(aman.page)).staged).toBe(true);

  // Bonus turns (sixes) and a double capture, as on the classic 3D board.
  await table.act(6, () => 0); // Aman opens, rolls again
  await table.act(1);
  await table.act(6, () => 0); // Ben opens B0
  await table.act(6, () => 1); // and B1
  await table.act(2, () => 0);
  await table.act(3);
  await table.act(2, () => 1); // two of Ben's tokens on one cell
  // Token focus while Aman's runner moves, then back to the overview (camera reset).
  await visible(aman.page.getByRole("button", { name: "Follow token" })).click();
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "follow");
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  await table.act(5);
  await visible(aman.page.getByRole("button", { name: "Overview" })).click();
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "overview");
  await table.act(6, () => 2);
  await table.act(6, () => 3);
  await table.act(6); // a third six: forfeited
  await table.act(6, () => 0);
  let snap = await table.act(1); // captures both of Ben's tokens
  expect(snap.history.filter((e) => e.type === "capture").length).toBe(2);
  for (const p of [aman, ben]) for (const k of [B(0), B(1)]) expect((await readBoard(p.page))[`token-${k}`], `${p.name}: ${k} back in base`).toBe("base");

  // Ben's network drops and returns: his board, city and all, snaps back to the server's state.
  offline = true;
  table.offline.add(ben);
  for (const ws of routes) void ws.close({ code: 1006, reason: "network down" });
  routes.clear();
  await expect(visible(ben.page.getByText(/Reconnecting|Offline/))).toBeVisible();
  snap = await table.act(snap.game!.currentPlayerId === aman.id ? 3 : 1, (legal) => Math.min(...legal.map((m) => m.tokenId)));
  offline = false;
  table.offline.delete(ben);
  await expect(visible(ben.page.getByText("Reconnected: your seat is back"))).toBeVisible({ timeout: 45_000 });
  snap = await table.expectInSync();
  await expectBoard3d(ben.page, "3d");
  await expectKolkataBuilt(ben.page);

  // Home entry: the runner goes up its lane into the finish.
  const runner = () => snap.game!.players.find((p) => p.id === aman.id)!.tokens[0]!.step!;
  while (runner() !== 56) {
    const g = snap.game!;
    if (g.currentPlayerId === aman.id) {
      const next = plan(g, [aman.id]);
      snap = await table.act(next.value, next.token);
    } else snap = await table.act(1, (legal) => Math.min(...legal.map((m) => m.tokenId)));
  }
  for (const p of [aman, ben]) await expect(p.page.getByTestId(`token-${A(0)}`)).toHaveAttribute("data-state", "finished");
  await table.expectInSync();
  // Throughout, the city sent nothing of its own: every gameplay request matches a roll or a move the players made.
  expect(aman.sent.roll + ben.sent.roll, "rolls sent").toBe(table.rolls);
  noErrors([aman, ben]);
  await close([aman, ben]);
});
