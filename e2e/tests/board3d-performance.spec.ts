// What the 2.5D board costs, measured in headless Chromium against the 2D
// board: time to the first drawn frame and the 3D chunk's size, frames and
// main-thread time while idle and while a token moves, GPU object counts, and
// the latency from a tap on a token to the move request leaving the page.
// Headless Chromium renders WebGL in software (SwiftShader) on the CPU: these
// are comparisons on one machine, not device frame rates. E2E_PERF_OUT saves
// the numbers as JSON.
import { writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { boardTokens, expectBoard3d } from "../support/board3d";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible, type BoardView } from "../support/game";

interface Sample {
  view: string;
  firstFrameMs: number;
  chunkKb: number | null;
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

async function measure(browser: Browser, view: Exclude<BoardView, "default">, quality: "low" | "medium" | null): Promise<Sample> {
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
  const code = await createRoom(aman, { players: 2 });
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
  const chunkKb = await aman.page.evaluate(() => {
    const e = performance.getEntriesByType("resource").find((r) => /Board3D-.*\.js$/.test(r.name)) as PerformanceResourceTiming | undefined;
    return e ? Math.round((e.encodedBodySize / 1024) * 10) / 10 : null;
  });
  if (view !== "2d") await expectBoard3d(aman.page, view);
  await table.expectInSync();
  await aman.page.waitForTimeout(800);

  const cdp = await aman.context.newCDPSession(aman.page);
  await cdp.send("Performance.enable");
  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) as Record<string, number>;
  let before = await metric();
  const idle = await frames(aman.page, 3000);
  let after = await metric();
  const idleBusyPct = Math.round(((after.TaskDuration! - before.TaskDuration!) / 3) * 1000) / 10;

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
  await aman.context.close();
  await ben.context.close();
  return {
    view: quality ? `${view} (${quality})` : view,
    firstFrameMs: Math.round(firstFrameMs),
    chunkKb,
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

test("the 2.5D board: load, frames, main-thread time, GPU objects and tap latency against the 2D board", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  for (const context of browser.contexts()) await context.close();
  const samples: Sample[] = [];
  samples.push(await measure(browser, "2d", null));
  samples.push(await measure(browser, "2.5d", "low"));
  samples.push(await measure(browser, "2.5d", "medium"));
  samples.push(await measure(browser, "3d", "medium"));
  console.table(samples);
  if (process.env.E2E_PERF_OUT) writeFileSync(process.env.E2E_PERF_OUT, JSON.stringify(samples, null, 2));
  const [flat, ...threeD] = samples;
  for (const s of threeD) {
    // On-demand rendering: at rest the 3D board does almost no main-thread work.
    expect(s.idleBusyPct, `${s.view}: main thread busy while idle`).toBeLessThan(Math.max(20, flat!.idleBusyPct + 12));
    // A tap reaches the server's request quickly (raycast included).
    expect(s.tapToRequestMs, `${s.view}: tap to request`).toBeLessThan(150);
    expect(s.chunkKb, `${s.view}: the 3D chunk was loaded lazily`).not.toBeNull();
    expect(s.glGeometries, `${s.view}: GPU geometries stay bounded`).toBeLessThan(120);
    expect(s.glTextures, `${s.view}: GPU textures stay bounded`).toBeLessThan(40);
  }
  expect(flat!.chunkKb, "the 2D board never loads the 3D chunk").toBeNull();
});
