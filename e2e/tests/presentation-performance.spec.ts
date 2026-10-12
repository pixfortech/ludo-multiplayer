// What presenting the game's events costs, in a Kolkata room with the human
// characters (C.3C.1): the die's roll and reveal, a six's departure, a walk, a
// capture, a home entry, and the idle board afterwards. For each phase it
// records display frames (requestAnimationFrame) and the worst frame, the
// frames the 3D board drew, main-thread busy time and how long the phase took;
// the latency from a click to the request leaving the page; GPU objects and
// the JS heap (after garbage collection) at the start and the end.
// Headless Chromium renders WebGL in software (SwiftShader): these compare
// builds on one machine; they are not device frame rates.
// PRESENTATION_PERF_OUT saves the numbers as JSON.
//
// The second test plays the same events with the CPU slowed four times, to
// catch an animation that holds input or never finishes: every phase must
// end, the die must show its value before anything moves, and the board must
// end in step with the server.
import { writeFileSync } from "node:fs";
import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";
import { expectBoard3d, pickToken3d } from "../support/board3d";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, plan, seatTable, startGame, visible, type Player, type Table } from "../support/game";
import { readTimeline, startTimeline } from "../support/timeline";

interface PhaseSample {
  phase: string;
  /** From the action to the board showing its result, every character done moving. */
  ms: number;
  displayFps: number;
  worstFrameMs: number;
  /** Frames the 3D board drew. */
  boardFrames: number;
  busyPct: number;
  /** Click to request leaving the page (a roll or a move made by clicking). */
  inputMs: number | null;
}

/** Character states that mean a person is still moving or reacting to the event. */
const ACTIVE = new Set(["excited", "leavingBase", "walking", "captured", "returningToBase", "reachingHome", "celebrating", "cheering", "upset", "noticing"]);

const round = (n: number) => Math.round(n * 10) / 10;

async function metric(cdp: CDPSession): Promise<Record<string, number>> {
  return Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
}

async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  return round(((await metric(cdp)).JSHeapUsedSize ?? 0) / 1024 / 1024);
}

function token(page: Page, key: string): Promise<{ step: string; state: string | null; ready: boolean } | null> {
  return page.evaluate((k) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="board-mirror"] li[data-key="${k}"]`);
    return el ? { step: el.dataset.step!, state: el.dataset.characterState ?? null, ready: el.dataset.characterReady === "true" } : null;
  }, key);
}

/** The token shows `step` and its person has finished moving and reacting. */
async function settledAt(page: Page, key: string, step: string): Promise<boolean> {
  const t = await token(page, key);
  return t !== null && t.step === step && !ACTIVE.has(t.state ?? "");
}

const visibleDie = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="die"]')].find((d) => d.getBoundingClientRect().width > 0)?.dataset.value ?? null);

async function phase(p: Player, cdp: CDPSession, name: string, act: () => Promise<unknown>, done: () => Promise<boolean>, timeout = 60_000): Promise<PhaseSample> {
  await p.page.evaluate(() => {
    const w = window as unknown as { __pf: { count: number; worst: number; last: number; on: boolean; board0: number }; __click: number; __sent: number };
    const board = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    w.__pf = { count: 0, worst: 0, last: performance.now(), on: true, board0: Number(board?.dataset.frames ?? 0) };
    w.__click = 0;
    w.__sent = 0;
    const tick = (now: number) => {
      if (!w.__pf.on) return;
      w.__pf.count++;
      w.__pf.worst = Math.max(w.__pf.worst, now - w.__pf.last);
      w.__pf.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const m0 = await metric(cdp);
  const t0 = Date.now();
  await act();
  await expect.poll(done, { message: `${name} finishes`, timeout, intervals: [100] }).toBe(true);
  const ms = Date.now() - t0;
  const m1 = await metric(cdp);
  const r = await p.page.evaluate(() => {
    const w = window as unknown as { __pf: { count: number; worst: number; on: boolean; board0: number }; __click: number; __sent: number };
    w.__pf.on = false;
    const board = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    return { count: w.__pf.count, worst: w.__pf.worst, frames: Number(board?.dataset.frames ?? 0) - w.__pf.board0, input: w.__click && w.__sent >= w.__click ? w.__sent - w.__click : null };
  });
  return { phase: name, ms, displayFps: round(r.count / (ms / 1000)), worstFrameMs: Math.round(r.worst), boardFrames: r.frames, busyPct: round(((m1.TaskDuration! - m0.TaskDuration!) / (ms / 1000)) * 100), inputMs: r.input === null ? null : round(r.input) };
}

async function kolkataRoom(browser: Browser) {
  const aman = await openPlayer(browser, "Aman", "desktop", { board: "2.5d" });
  await aman.context.addInitScript(() => {
    localStorage.setItem("ludo.board-view.v1", JSON.stringify({ mode: "2.5d", quality: "low" }));
    const w = window as unknown as { __click: number; __sent: number };
    addEventListener("pointerup", () => (w.__click = performance.now()), true);
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
      if (typeof data === "string" && /"game:(roll|move)"/.test(data)) w.__sent = performance.now();
      return send.call(this, data);
    };
  });
  const ben = await openPlayer(browser, "Ben", "phone", { board: "2d" });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  await expectBoard3d(aman.page, "2.5d");
  await expect
    .poll(async () => aman.page.evaluate(() => document.querySelectorAll('[data-testid="board-mirror"] li[data-character-ready="true"]').length), { message: "the characters have loaded", timeout: 120_000 })
    .toBe(8);
  const cdp = await aman.context.newCDPSession(aman.page);
  await cdp.send("Performance.enable");
  return { aman, ben, table, cdp };
}

/** Aman rolls by clicking (the server draws `value`); returns once the roll has committed. */
async function clickRoll(table: Table, aman: Player, value: number) {
  await queueDice(value);
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).click();
  table.rolls++;
}

/**
 * The scripted events: a six and its departure, a walk, two turns to step 28, Ben's capture from his start
 * (two cells behind), then Aman's runner home. Returns the phases measured.
 */
async function playEvents(table: Table, aman: Player, ben: Player, cdp: CDPSession, opts: { home: boolean }): Promise<PhaseSample[]> {
  const A = (t: number) => `${aman.id}:${t}`;
  const out: PhaseSample[] = [];
  const timeout = opts.home ? 60_000 : 120_000;
  // The die: from the click to the value shown.
  out.push(await phase(aman, cdp, "roll (click to value)", () => clickRoll(table, aman, 6), async () => (await visibleDie(aman.page)) === "6", timeout));
  // A six: the chosen person reacts and walks to the start cell.
  await expect.poll(async () => (await token(aman.page, A(0)))?.state ?? null, { timeout }).not.toBe(null);
  out.push(
    await phase(
      aman,
      cdp,
      "six: departure (tap to start cell)",
      async () => {
        await expect(visible(aman.page.getByTestId("move-tray"))).toBeVisible({ timeout });
        await pickToken3d(aman, A(0));
        table.moves++;
      },
      () => settledAt(aman.page, A(0), "0"),
      timeout,
    ),
  );
  await table.expectInSync();
  out.push(
    await phase(
      aman,
      cdp,
      "walk 6 cells",
      async () => {
        await table.roll(6);
        await table.move(0);
      },
      () => settledAt(aman.page, A(0), "6"),
      timeout,
    ),
  );
  await table.expectInSync();
  out.push(await phase(aman, cdp, "walk 5 cells", () => table.roll(5), () => settledAt(aman.page, A(0), "11"), timeout));
  await table.expectInSync();
  await table.act(1); // Ben: nothing out, the turn passes
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  await table.act(5); // Aman's storyteller on step 28
  await table.act(6, () => 0); // Ben opens on his start, two cells behind
  out.push(
    await phase(
      aman,
      cdp,
      "capture (Ben's move to back in base)",
      async () => {
        await table.roll(2);
      },
      () => settledAt(aman.page, A(0), "base"),
      timeout,
    ),
  );
  let snap = await table.expectInSync();
  expect(snap.history.some((e) => e.type === "capture" && e.victimPlayerId === aman.id), "the capture happened").toBe(true);
  expect(snap.game!.players.find((p) => p.id === ben.id)!.tokens[0]!.step, "Ben's token on the capture cell (his step 2)").toBe(2);
  if (!opts.home) return out;
  // Aman's runner (a fresh token) all the way home; the last move is measured.
  for (let i = 0; i < 80; i++) {
    const g = snap.game!;
    const next = plan(g, [aman.id]);
    const runner = g.players.find((p) => p.id === aman.id)!.tokens.filter((t) => t.step !== null && t.step < 56).sort((a, b) => b.step! - a.step!)[0];
    const finishing = g.currentPlayerId === aman.id && runner && runner.step! + next.value === 56;
    if (finishing) {
      out.push(
        await phase(
          aman,
          cdp,
          "home entry (roll to celebration done)",
          async () => {
            await table.roll(next.value);
            const s = await table.state();
            if (s.game!.turn.phase === "awaiting-move" && s.game!.currentPlayerId === aman.id) await table.move(next.token!(s.game!.turn.legalMoves));
          },
          () => settledAt(aman.page, A(runner.id), "56"),
          timeout,
        ),
      );
      snap = await table.expectInSync();
      break;
    }
    snap = await table.act(next.value, next.token ? (legal) => next.token!(legal) : undefined);
  }
  return out;
}

test("presenting events with sixteen-character Kolkata: roll, six, walk, capture, home entry, idle — frames, main thread, input, GPU objects, heap", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  for (const context of browser.contexts()) await context.close();
  const { aman, ben, table, cdp } = await kolkataRoom(browser);
  const heapStart = await heapMb(cdp);
  const phases = await playEvents(table, aman, ben, cdp, { home: true });
  // Idle afterwards: the board settles; no render loop keeps going.
  await aman.page.waitForTimeout(3000);
  const idle = await phase(aman, cdp, "idle 5 s after", () => aman.page.waitForTimeout(5000), async () => true);
  phases.push(idle);
  const heapEnd = await heapMb(cdp);
  const gl = await aman.page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="game-board"]')!;
    return { geometries: Number(el.dataset.glGeometries), textures: Number(el.dataset.glTextures), calls: Number(el.dataset.glCalls), triangles: Number(el.dataset.glTriangles), ambient: el.dataset.ambient ?? null };
  });
  console.table(phases);
  console.log("GPU", gl, "heap MB", { start: heapStart, end: heapEnd });
  if (process.env.PRESENTATION_PERF_OUT) writeFileSync(process.env.PRESENTATION_PERF_OUT, JSON.stringify({ phases, gl, heap: { start: heapStart, end: heapEnd } }, null, 2));
  // Bounded: once everything has played, the board draws no more than the characters' slow pulse and the
  // city's own (capped) life; and the heap does not grow without bound over a few dozen actions.
  expect(idle.boardFrames, "frames drawn in 5 s at rest").toBeLessThan(5 * 22);
  expect(heapEnd, "heap after the events").toBeLessThan(heapStart + 40);
  for (const p of phases.filter((x) => x.inputMs !== null)) expect(p.inputMs!, `${p.phase}: click to request`).toBeLessThan(150);
  for (const p of [aman, ben]) await p.context.close();
});

test("with the CPU slowed four times, every event still plays to its end: the die shows first, input stays live, the board ends in step", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  for (const context of browser.contexts()) await context.close();
  const { aman, ben, table, cdp } = await kolkataRoom(browser);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await startTimeline(aman.page);
  const phases = await playEvents(table, aman, ben, cdp, { home: false });
  console.table(phases);
  // The die showed each value before any token moved on it: no token changes step between the die starting
  // to roll and the die showing its value.
  const events = [...(await readTimeline(aman.page))].sort((a, b) => a.t - b.t);
  let rolling = false;
  let reveals = 0;
  for (const e of events) {
    if (e.target === "die") {
      rolling = e.value === "rolling";
      if (/^[1-6]$/.test(e.value)) reveals++;
    } else if (!e.target.startsWith("home:")) expect(rolling, `${e.target} moved to ${e.value} while the die was still rolling`).toBe(false);
  }
  expect(reveals, "the die showed every roll").toBeGreaterThanOrEqual(8);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await table.expectInSync();
  for (const p of [aman, ben]) await p.context.close();
});
