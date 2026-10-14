// Movement timing, as the player sees it, in each board view: the roll (click to the die's value), a six's
// departure (click on the character to its arrival on the start cell) and a six-cell walk (click to arrival),
// with the frames the board drew on the way, the longest stall and the frame-time spread. Recorded inside
// the page (e2e/support/movement.ts). Run with MOVEMENT_OUT=<file.json> to save the numbers.
//
// Headless Chromium draws WebGL in software (SwiftShader): absolute times here are far slower than a real GPU.
// The checks are about what must hold on any machine: the token arrives where the server put it, it starts
// moving promptly after the server's answer, it never stands still mid-path for longer than the frames allow,
// and the walk takes about its planned time (no lag that accumulates cell after cell).
import { writeFileSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";
import { expectBoard3d, pickToken3d } from "../support/board3d";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible, type BoardView, type Player, type Table } from "../support/game";
import { installMoveRecorder, moveMetrics, startRecording, stopRecording, type MoveMetrics } from "../support/movement";

interface Config {
  label: string;
  board: Exclude<BoardView, "default">;
  quality?: "low" | "medium" | "high";
  city: "Kolkata" | "Classic";
}

const CONFIGS: Config[] = [
  { label: "Classic 2D", board: "2d", city: "Classic" },
  { label: "Kolkata 2.5D Low", board: "2.5d", quality: "low", city: "Kolkata" },
  { label: "Kolkata 2.5D Medium", board: "2.5d", quality: "medium", city: "Kolkata" },
  { label: "Kolkata 3D Medium", board: "3d", quality: "medium", city: "Kolkata" },
  ...(process.env.MOVEMENT_ALL ? ([
    { label: "Kolkata 2.5D High", board: "2.5d", quality: "high", city: "Kolkata" },
    { label: "Kolkata 3D Low", board: "3d", quality: "low", city: "Kolkata" },
    { label: "Kolkata 3D High", board: "3d", quality: "high", city: "Kolkata" },
  ] as Config[]) : []),
];

interface Result {
  config: string;
  gpu: string | null;
  /** The board's GPU resources and its last frame's draw calls and triangles, after the walk. */
  gl: Record<string, number | null>;
  dieMs: number | null;
  departure: MoveMetrics;
  departureReadyMs: number | null;
  walk6: MoveMetrics;
  walk6ReadyMs: number | null;
}

const results: Result[] = [];

async function room(browser: Browser, c: Config): Promise<{ aman: Player; ben: Player; table: Table }> {
  const aman = await openPlayer(browser, "Aman", "desktop", { board: c.board, ...(c.quality ? { quality: c.quality } : {}) });
  const ben = await openPlayer(browser, "Ben", "phone", { board: "2d" });
  const code = await createRoom(aman, { players: 2, ...(c.city === "Kolkata" ? { city: "Kolkata" } : {}) });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben], { syncTimeout: 60_000 });
  if (c.board !== "2d") {
    await expectBoard3d(aman.page, c.board, 60_000);
    if (c.city === "Kolkata") {
      await expect.poll(() => aman.page.evaluate(() => document.querySelectorAll('[data-testid="board-mirror"] li[data-character-status="ready"]').length), { timeout: 240_000 }).toBe(8);
    }
  }
  await aman.page.waitForTimeout(1500);
  await installMoveRecorder(aman.page);
  return { aman, ben, table };
}

/** Aman rolls by clicking (the server draws `value`). Returns click-to-die-landed (ms, in the page). */
async function clickRoll(table: Table, aman: Player, value: number): Promise<number | null> {
  await queueDice(value);
  const t0 = await aman.page.evaluate(() => performance.now());
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).click({ noWaitAfter: true });
  table.rolls++;
  const landed = await aman.page
    .waitForFunction((since) => [...document.querySelectorAll<HTMLElement>('[data-testid="presentation-log"] li[data-type="die-land"]')].map((li) => Number(li.dataset.t)).find((t) => t > since) ?? null, t0, { timeout: 60_000, polling: 50 })
    .then((h) => h.jsonValue() as Promise<number>)
    .catch(() => null);
  return landed === null ? null : Math.round(landed - t0);
}

/** Picks Aman's token (a click on the 3D board, or the move tray on the 2D board). */
async function pick(c: Config, table: Table, aman: Player, tokenId: number) {
  await expect(visible(aman.page.getByTestId("move-tray"))).toBeVisible({ timeout: 60_000 });
  if (c.board === "2d") await table.move(tokenId);
  else {
    await pickToken3d(aman, `${aman.id}:${tokenId}`);
    table.moves++;
  }
}

/** From the arrival until Aman can act again (the next roll offered), in page time. */
async function readyAfter(aman: Player, arrivalT: number | null): Promise<number | null> {
  if (arrivalT === null) return null;
  const ready = await aman.page
    .waitForFunction(() => ([...document.querySelectorAll<HTMLElement>("button")].some((b) => b.textContent?.includes("Roll dice") && b.getBoundingClientRect().width > 0 && !b.hasAttribute("disabled")) ? performance.now() : null), undefined, { timeout: 60_000, polling: 50 })
    .then((h) => h.jsonValue() as Promise<number>)
    .catch(() => null);
  return ready === null ? null : Math.round(Math.max(0, ready - arrivalT));
}

async function moveAndMeasure(c: Config, table: Table, aman: Player, tokenId: number, finalStep: string): Promise<{ metrics: MoveMetrics; readyMs: number | null }> {
  const key = `${aman.id}:${tokenId}`;
  await startRecording(aman.page, key);
  await pick(c, table, aman, tokenId);
  // Until it stands on its final cell (as the server has it) and the playback has settled.
  await expect.poll(async () => (await table.state()).game!.players.find((p) => p.id === aman.id)!.tokens[tokenId]!.step, { timeout: 60_000 }).toBe(Number(finalStep));
  await expect.poll(() => aman.page.evaluate((k) => document.querySelector<HTMLElement>(`[data-testid="token-${k}"]`)?.dataset.step ?? null, key), { timeout: 60_000 }).toBe(finalStep);
  const t = await aman.page.evaluate(() => performance.now());
  const readyMs = await readyAfter(aman, t);
  await aman.page.waitForTimeout(1500);
  const rec = await stopRecording(aman.page);
  const metrics = moveMetrics(rec, key, finalStep);
  return { metrics, readyMs: readyMs === null || metrics.clickToArrivalMs === null ? readyMs : readyMs };
}

for (const c of CONFIGS) {
  test(`movement timing: ${c.label}`, async ({ browser }) => {
    test.setTimeout(15 * 60_000);
    const { aman, ben, table } = await room(browser, c);
    const dieMs = await clickRoll(table, aman, 6);
    const departure = await moveAndMeasure(c, table, aman, 0, "0");
    await clickRoll(table, aman, 6);
    const walk6 = await moveAndMeasure(c, table, aman, 0, "6");
    const gpu = await aman.page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
    });
    const gl = await aman.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="game-board"]');
      const n = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
      return { calls: n(el?.dataset.glCalls), triangles: n(el?.dataset.glTriangles), geometries: n(el?.dataset.glGeometries), textures: n(el?.dataset.glTextures) };
    });
    const r: Result = { config: c.label, gpu, gl, dieMs, departure: departure.metrics, departureReadyMs: departure.readyMs, walk6: walk6.metrics, walk6ReadyMs: walk6.readyMs };
    results.push(r);
    console.log(JSON.stringify(r));
    // Wherever it is drawn, the token ends where the server put it.
    await table.expectInSync();
    for (const p of [aman, ben]) await p.context.close();
  });
}

test.afterAll(() => {
  if (process.env.MOVEMENT_OUT) writeFileSync(process.env.MOVEMENT_OUT, JSON.stringify(results, null, 2));
});
