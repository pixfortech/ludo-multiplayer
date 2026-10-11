// What the 2.5D board costs, measured in headless Chromium against the 2D
// board: time to the first drawn frame and the 3D chunk's size, frames and
// main-thread time while idle and while a token moves, GPU object counts, and
// the latency from a tap on a token to the move request leaving the page.
// The same, with the living Kolkata city round the board (its ambient frame
// rate, its chunk, and what it adds to every number above).
// Headless Chromium renders WebGL in software (SwiftShader) on the CPU: these
// are comparisons on one machine, not device frame rates. E2E_PERF_OUT saves
// the numbers as JSON. On a machine with a GPU, `npm run perf:gpu` runs this in
// the installed Chrome on the real GPU (docs/qa/gpu-performance.md).
import { writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { boardTokens, expectBoard3d } from "../support/board3d";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible, type BoardView } from "../support/game";

interface Sample {
  view: string;
  /** The renderer WebGL reports (a software renderer, or the GPU and driver). */
  gpu: string | null;
  /** Display frames a second while idle and while a token moves (requestAnimationFrame). */
  idleFps: number;
  moveFps: number;
  firstFrameMs: number;
  chunkKb: number | null;
  cityChunkKb: number | null;
  /** Frames the 3D board drew per second while nothing in the game moved (the city's ambient life). */
  ambientFps: number | null;
  /** Average main-thread time per drawn frame (React Three Fiber's update and render), ms. */
  frameWorkMs: number | null;
  /** Of which animating the human characters (Kolkata's Crimson team), ms per frame. */
  characterMs: number | null;
  /** From the reload to all four characters loaded (Kolkata), ms. */
  charactersReadyMs: number | null;
  /** The city's ambient life once settled: live, eased (slowed for this device), resting (stopped for this device) or still, with its rate. */
  ambient: string | null;
  /** Main-thread busy while idle once the city has settled, %. */
  settledBusyPct: number | null;
  idleFrames: number;
  idleBusyPct: number;
  moveFrames: number;
  moveWorstFrameMs: number;
  moveBusyPct: number;
  tapToRequestMs: number;
  glGeometries: number | null;
  glTextures: number | null;
  glCalls: number | null;
  glTriangles: number | null;
  heapMb: number;
}

function frames(page: Page, ms: number): Promise<{ count: number; worst: number }> {
  return page.evaluate(
    (duration) =>
      new Promise<{ count: number; worst: number }>((resolve) => {
        let count = 0;
        let worst = 0;
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          count++;
          worst = Math.max(worst, now - last);
          last = now;
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve({ count, worst });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

async function measure(browser: Browser, view: Exclude<BoardView, "default">, quality: "low" | "medium" | null, city?: "Kolkata"): Promise<Sample> {
  const aman = await openPlayer(browser, "Aman", "desktop", { board: view });
  if (quality) await aman.context.addInitScript((q) => localStorage.setItem("ludo.board-view.v1", JSON.stringify({ mode: localStorage.getItem("ludo.board-view.v1") ? JSON.parse(localStorage.getItem("ludo.board-view.v1")!).mode : null, quality: q })), quality);
  // Record when a pointer is released and when a move request leaves the page.
  await aman.context.addInitScript(() => {
    const w = window as unknown as { __tap: number; __sent: number };
    addEventListener("pointerup", () => (w.__tap = performance.now()), true);
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
      if (typeof data === "string" && data.includes('"game:move"')) w.__sent = performance.now();
      return send.call(this, data);
    };
  });
  const ben = await openPlayer(browser, "Ben", "phone", { board: "2d" });
  const code = await createRoom(aman, city ? { players: 2, city } : { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);

  // Time to the first drawn board after a fresh load, and the 3D chunk's transfer size.
  await aman.page.reload();
  const firstFrameMs = await aman.page.evaluate(
    (is3d) =>
      new Promise<number>((resolve) => {
        const check = () => {
          const ready = is3d ? document.querySelector('[data-testid="board-cells-mirror"] li[data-cx]') : document.querySelector('svg[data-testid="game-board"] [data-testid^="token-"]');
          if (ready) resolve(performance.now());
          else requestAnimationFrame(check);
        };
        check();
      }),
    view !== "2d",
  );
  const charactersReadyMs = city
    ? await aman.page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const check = () => {
              if (document.querySelectorAll('[data-testid="board-mirror"] li[data-character-ready="true"]').length === 4) resolve(Math.round(performance.now()));
              else requestAnimationFrame(check);
            };
            check();
          }),
      )
    : null;
  const chunk = (pattern: string) =>
    aman.page.evaluate((p) => {
      const e = performance.getEntriesByType("resource").find((r) => new RegExp(p).test(r.name)) as PerformanceResourceTiming | undefined;
      return e ? Math.round((e.encodedBodySize / 1024) * 10) / 10 : null;
    }, pattern);
  const chunkKb = await chunk("Board3D-.*\\.js$");
  if (view !== "2d") await expectBoard3d(aman.page, view);
  if (city) await expect.poll(() => aman.page.getByTestId("environment-mirror").getAttribute("data-assets"), { timeout: 20_000 }).toContain("yellow-taxi");
  const cityChunkKb = await chunk("KolkataEnvironment-.*\\.js$");
  await table.expectInSync();
  await aman.page.waitForTimeout(800);

  const cdp = await aman.context.newCDPSession(aman.page);
  await cdp.send("Performance.enable");
  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) as Record<string, number>;
  let before = await metric();
  const idle = await frames(aman.page, 3000);
  let after = await metric();
  const idleBusyPct = Math.round(((after.TaskDuration! - before.TaskDuration!) / 3) * 1000) / 10;
  // Frames the board draws while the game is idle (the city's ambient life), and its main-thread work per frame.
  const stats = () =>
    aman.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="game-board"]')!;
      return { frames: Number(el.dataset.frames ?? 0), work: el.dataset.frameMs === undefined ? null : Number(el.dataset.frameMs), characters: el.dataset.characterMs === undefined ? null : Number(el.dataset.characterMs), ambient: el.dataset.ambient ? `${el.dataset.ambient} ${el.dataset.ambientFps}` : null };
    });
  let ambientFps: number | null = null;
  let frameWorkMs: number | null = null;
  let characterMs: number | null = null;
  let ambient: string | null = null;
  let settledBusyPct: number | null = null;
  if (view !== "2d") {
    if (city) {
      // The city measures what this device can afford in its first seconds, then keeps (or lowers) its rate.
      await aman.page.waitForTimeout(6000);
      before = await metric();
    }
    const a = await stats();
    await aman.page.waitForTimeout(4000);
    const b = await stats();
    ambientFps = Math.round(((b.frames - a.frames) / 4) * 10) / 10;
    frameWorkMs = b.work;
    characterMs = city ? b.characters : null;
    ambient = b.ambient;
    if (city) settledBusyPct = Math.round((((await metric()).TaskDuration! - before.TaskDuration!) / 4) * 1000) / 10;
  }

  // A six, then a tap on a token: the latency from release to the move request, then the travel's frames.
  await queueDice(6);
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).click();
  table.rolls++;
  await expect(visible(aman.page.getByTestId("move-tray"))).toBeVisible();
  await aman.page.waitForTimeout(400);
  const key = `${aman.id}:0`;
  if (view === "2d") {
    await aman.page.getByTestId(`token-${key}`).click();
  } else {
    const t = (await boardTokens(aman.page)).find((x) => x.key === key)!;
    await aman.page.mouse.click(t.x, t.y);
  }
  before = await metric();
  const moving = await frames(aman.page, 1500);
  after = await metric();
  table.moves++;
  const tapToRequestMs = await aman.page.evaluate(() => {
    const w = window as unknown as { __tap: number; __sent: number };
    return Math.round((w.__sent - w.__tap) * 10) / 10;
  });
  await table.expectInSync();
  const gl = await aman.page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="game-board"]')!;
    const n = (v?: string) => (v === undefined ? null : Number(v));
    return { glGeometries: n(el.dataset.glGeometries), glTextures: n(el.dataset.glTextures), glCalls: n(el.dataset.glCalls), glTriangles: n(el.dataset.glTriangles) };
  });
  const heapMb = Math.round(((await metric()).JSHeapUsedSize! / 1024 / 1024) * 10) / 10;
  const gpu = await aman.page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
  });
  await aman.context.close();
  await ben.context.close();
  return {
    view: `${city ? `${city} ` : ""}${quality ? `${view} (${quality})` : view}`,
    gpu,
    idleFps: Math.round((idle.count / 3) * 10) / 10,
    moveFps: Math.round((moving.count / 1.5) * 10) / 10,
    firstFrameMs: Math.round(firstFrameMs),
    chunkKb,
    cityChunkKb,
    ambientFps,
    frameWorkMs,
    characterMs,
    charactersReadyMs,
    ambient,
    settledBusyPct,
    idleFrames: idle.count,
    idleBusyPct,
    moveFrames: moving.count,
    moveWorstFrameMs: Math.round(moving.worst),
    moveBusyPct: Math.round(((after.TaskDuration! - before.TaskDuration!) / 1.5) * 1000) / 10,
    tapToRequestMs,
    ...gl,
    heapMb,
  };
}

test("the 2.5D board, and the living Kolkata city: load, frames, main-thread time, GPU objects and tap latency against the 2D board", async ({ browser }) => {
  test.setTimeout(16 * 60_000);
  for (const context of browser.contexts()) await context.close();
  const samples: Sample[] = [];
  samples.push(await measure(browser, "2d", null));
  samples.push(await measure(browser, "2.5d", "low"));
  samples.push(await measure(browser, "2.5d", "medium"));
  samples.push(await measure(browser, "3d", "medium"));
  samples.push(await measure(browser, "2.5d", "low", "Kolkata"));
  samples.push(await measure(browser, "2.5d", "medium", "Kolkata"));
  samples.push(await measure(browser, "3d", "medium", "Kolkata"));
  console.table(samples);
  if (process.env.E2E_PERF_OUT) writeFileSync(process.env.E2E_PERF_OUT, JSON.stringify(samples, null, 2));
  const [flat, ...threeD] = samples;
  const classic = threeD.filter((s) => s.cityChunkKb === null);
  const kolkata = threeD.filter((s) => s.cityChunkKb !== null);
  expect(kolkata, "the Kolkata scene loads as its own chunk").toHaveLength(3);
  for (const s of classic) {
    // Without a living city, nothing draws while the game is idle.
    expect(s.ambientFps, `${s.view}: no frames while idle`).toBeLessThan(1);
  }
  for (const s of kolkata) {
    // The city's life draws at most at its capped ambient rate (Low 12, Medium 20 frames a second), never the display's;
    // where the device cannot afford that (software WebGL here), it slows down or rests.
    expect(s.ambientFps, `${s.view}: ambient frames capped`).toBeLessThanOrEqual(22);
    const [state, fps] = (s.ambient ?? "").split(" ");
    expect(["live", "eased", "resting"], `${s.view}: ambient state`).toContain(state);
    // A resting city draws nothing of its own; the characters keep a slow pulse (at most 2 frames a second and a tenth of the device's time) so they never freeze.
    if (state === "resting") expect(s.ambientFps, `${s.view}: a resting city draws only the characters' slow pulse`).toBeLessThan(2.6);
    else expect(s.ambientFps, `${s.view}: the city is alive`).toBeGreaterThan(Number(fps) * 0.25);
    expect(s.charactersReadyMs, `${s.view}: the characters load`).not.toBeNull();
    // Once settled, the city leaves the main thread mostly free (docs/architecture/performance-budgets.md).
    expect(s.settledBusyPct, `${s.view}: main thread busy once the city has settled`).toBeLessThan(45);
    expect(s.glGeometries, `${s.view}: GPU geometries stay bounded`).toBeLessThan(160);
  }
  for (const s of threeD) {
    // On-demand rendering: at rest the 3D board does almost no main-thread work.
    if (s.cityChunkKb === null) expect(s.idleBusyPct, `${s.view}: main thread busy while idle`).toBeLessThan(Math.max(20, flat!.idleBusyPct + 12));
    // A tap reaches the server's request quickly (raycast included).
    expect(s.tapToRequestMs, `${s.view}: tap to request`).toBeLessThan(150);
    expect(s.chunkKb, `${s.view}: the 3D chunk was loaded lazily`).not.toBeNull();
    if (s.cityChunkKb === null) expect(s.glGeometries, `${s.view}: GPU geometries stay bounded`).toBeLessThan(120);
    expect(s.glTextures, `${s.view}: GPU textures stay bounded`).toBeLessThan(40);
  }
  expect(flat!.chunkKb, "the 2D board never loads the 3D chunk").toBeNull();
  for (const s of [flat!, ...classic]) expect(s.cityChunkKb, `${s.view}: the classic board never loads the Kolkata chunk`).toBeNull();
});
