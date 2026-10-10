// City themes, Batch B: does a city cost the game anything? The same game is
// measured on the classic table and in each city, in headless Chromium on a
// laptop-sized screen: main-thread work while idle (the city's ambient motion
// running), frame pacing while idle and while a token moves, and page weight.
// Headless Chromium renders in software, so these are relative comparisons on
// one machine, not real-device frame rates. Set E2E_PERF_OUT to save the
// numbers as JSON.
import { writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible } from "../support/game";

interface Sample {
  city: string;
  idleBusyPct: number;
  idleScriptMs: number;
  idleStyleLayoutMs: number;
  idleFrames: number;
  idleWorstFrameMs: number;
  moveFrames: number;
  moveWorstFrameMs: number;
  domNodes: number;
  heapMb: number;
  sceneReadyMs: number | null;
}

/** Counts animation frames for `ms` and returns the count and the longest gap between frames. */
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

async function measureCity(browser: Browser, city: string, reducedMotion = false): Promise<Sample> {
  const host = await openPlayer(browser, "Aman", "desktop", { reducedMotion });
  const guest = await openPlayer(browser, "Ben", "phone");
  const code = await createRoom(host, { players: 2, ...(city === "Classic" ? {} : { city }) });
  await joinRoom(guest, code);
  const started = Date.now();
  await startGame(host, [host, guest]);
  let sceneReadyMs: number | null = null;
  if (city !== "Classic") {
    await expect(host.page.locator('[data-city-backdrop] [data-role="hero"]')).toHaveCount(1);
    sceneReadyMs = Date.now() - started;
  }
  const table = await seatTable(code, [host, guest]);
  await host.page.waitForTimeout(1000);

  const cdp = await host.context.newCDPSession(host.page);
  await cdp.send("Performance.enable");
  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) as Record<string, number>;
  const before = await metric();
  const idle = await frames(host.page, 4000);
  const after = await metric();
  const busy = after.TaskDuration! - before.TaskDuration!;

  // A token moving: roll a six (the host starts) and bring a token out, while counting frames.
  await queueDice(6);
  const moving = frames(host.page, 2500);
  await visible(host.page.getByRole("button", { name: "Roll dice" })).click();
  table.rolls++;
  const move = await moving;
  const dom = await host.page.evaluate(() => document.getElementsByTagName("*").length);
  const heap = (await metric()).JSHeapUsedSize! / 1024 / 1024;
  await host.context.close();
  await guest.context.close();
  return {
    city,
    idleBusyPct: Math.round((busy / 4) * 1000) / 10,
    idleScriptMs: Math.round((after.ScriptDuration! - before.ScriptDuration!) * 1000),
    idleStyleLayoutMs: Math.round((after.RecalcStyleDuration! - before.RecalcStyleDuration! + after.LayoutDuration! - before.LayoutDuration!) * 1000),
    idleFrames: idle.count,
    idleWorstFrameMs: Math.round(idle.worst),
    moveFrames: move.count,
    moveWorstFrameMs: Math.round(move.worst),
    domNodes: dom,
    heapMb: Math.round(heap * 10) / 10,
    sceneReadyMs,
  };
}

test("a city costs the game no significant main-thread time or frame pacing", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  // Earlier tests leave their pages open (and animating): close them so they do not load the machine being measured.
  for (const context of browser.contexts()) await context.close();
  const cities = ["Classic", "Kolkata", "Delhi", "Chennai", "Mumbai", "Bengaluru"];
  const moving: Sample[] = [];
  const still: Sample[] = [];
  for (const city of cities) moving.push(await measureCity(browser, city));
  // With reduced motion the scenery is static: this isolates what the artwork itself costs.
  for (const city of cities) still.push(await measureCity(browser, city, true));
  console.log("ambient motion on");
  console.table(moving);
  console.log("reduced motion (static scenery)");
  console.table(still);
  if (process.env.E2E_PERF_OUT) writeFileSync(process.env.E2E_PERF_OUT, JSON.stringify({ moving, still }, null, 2));

  // Frame pacing is only meaningful on a machine that is not saturated: the classic table must reach
  // at least 15 fps here. Otherwise the numbers are recorded and the frame checks are skipped (said so).
  const measurable = moving[0]!.idleFrames >= 60 && still[0]!.idleFrames >= 60;
  if (!measurable) test.info().annotations.push({ type: "skipped-frame-checks", description: `machine saturated: classic drew ${moving[0]!.idleFrames} frames in 4 s` });

  const [classicStill, ...citiesStill] = still;
  for (const s of measurable ? citiesStill : []) {
    // Static scenery is painted once: frame pacing matches the classic table.
    expect(s.idleFrames, `${s.city} (static): frames while idle`).toBeGreaterThanOrEqual(classicStill!.idleFrames * 0.85);
    expect(s.moveWorstFrameMs, `${s.city} (static): worst frame during a move`).toBeLessThan(Math.max(120, classicStill!.moveWorstFrameMs * 1.6));
  }
  const [classic, ...citiesMoving] = moving;
  for (const s of citiesMoving) {
    // Ambient motion is compositor-only (transforms): the main thread stays nearly idle.
    expect(s.idleBusyPct, `${s.city}: main thread busy while idle`).toBeLessThan(Math.max(15, classic!.idleBusyPct + 8));
    expect(s.idleStyleLayoutMs, `${s.city}: style and layout while idle`).toBeLessThan(classic!.idleStyleLayoutMs + 250);
    expect(s.domNodes, `${s.city}: page size`).toBeLessThan(classic!.domNodes + 1500);
    if (!measurable) continue;
    // Headless Chromium composites in software, so moving layers cost frames here that a GPU does
    // not; the bound is loose and the numbers are reported, not claimed as device frame rates.
    expect(s.idleFrames, `${s.city}: frames while idle (software compositing)`).toBeGreaterThan(classic!.idleFrames * 0.6);
    expect(s.idleWorstFrameMs, `${s.city}: worst idle frame`).toBeLessThan(Math.max(150, classic!.idleWorstFrameMs * 1.8));
    // A coarse stall check: single frames are noisy when the machine is shared with other tests.
    expect(s.moveWorstFrameMs, `${s.city}: worst frame during a move`).toBeLessThan(Math.max(300, classic!.moveWorstFrameMs * 2.5));
  }
});
