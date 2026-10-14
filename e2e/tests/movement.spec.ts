// Token movement on the 2.5D/3D board, in real browsers against the real server and PostgreSQL. Every move is
// recorded inside the page (e2e/support/movement.ts) and checked in board units against the seat's own path:
// each drawn position lies on the polyline through the cells in order (no cut corner, no skipped cell), it never
// goes back along it (no replay, no jump back), it ends exactly on the server's cell, and it gets there in about
// the move's planned time (no lag that grows cell after cell, no long freeze).
//
//  1. A character's whole journey in 3D (2 players, the other on the 2D board): leaving the base, a six-cell
//     walk round a corner, consecutive bonus turns, a single cell, the long track, the home lane and the finish.
//     Mid-move: camera modes, the CPU slowed four times, a graphics quality change, a refresh, the other
//     player's network dropping, switching to 2.5D and to 2D and back, and a lost WebGL context.
//  2. Four players: a capture (the attacker's path, the victim back to its own base slot), picked by touch on a
//     phone in 2.5D, in sync on every board.
//
// Headless Chromium draws WebGL in software here, a few frames a second at times: the timing checks allow for
// that (a frame can come late), not for lag that accumulates. MOVEMENT_ACCEPT_OUT=<file.json> saves the numbers.
import { writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { classicBaseSlots, gridToWorld } from "@ludo/board-layouts";
import { boardTokens, expectBoard3d, pickToken3d } from "../support/board3d";
import { createRoom, joinRoom, openPlayer, readBoard, seatTable, startGame, visible, type Player, type Table } from "../support/game";
import { cellWorld, installMoveRecorder, moveMetrics, startRecording, stopRecording, walkedPath, type MoveMetrics, type WalkedPath } from "../support/movement";

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};

/** The presentation's pace for characters (playbackPlan.ts CHARACTER_PACE). */
const PACE = { walkMs: 340, openMs: 800, homeMs: 700 };
const planned = (from: number | null, to: number) => (from === null ? PACE.openMs : (to - from) * PACE.walkMs + (to === 56 ? PACE.homeMs - PACE.walkMs : 0));

interface Measured {
  label: string;
  from: number | null;
  to: number;
  plannedMs: number;
  metrics: MoveMetrics | null;
  path: WalkedPath | null;
  moveEventToArrivalMs: number | null;
}
const results: Measured[] = [];

/** Where the watched page draws a token, in board units. */
function standing(page: Page, key: string): Promise<{ step: string | null; x: number | null; z: number | null; state: string | null }> {
  return page.evaluate((k) => {
    const li = document.querySelector<HTMLElement>(`[data-testid="board-mirror"] li[data-key="${k}"]`);
    return { step: li?.dataset.step ?? null, x: li?.dataset.wx ? Number(li.dataset.wx) : null, z: li?.dataset.wz ? Number(li.dataset.wz) : null, state: li?.dataset.characterState ?? null };
  }, key);
}

async function allReady(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('[data-testid="board-mirror"] li[data-character-ready="true"]').length), { message: "the characters have loaded", timeout: 240_000 }).toBe(count);
}

const on3d = async (page: Page) => (await page.locator("canvas[data-board-gl]").count()) > 0;

interface MoveOptions {
  /** Done while the move plays (after the server has committed it). Returns true if it disturbed the page's recording. */
  during?: () => Promise<boolean | void>;
  /** The page that records (default: the mover's). */
  watcher?: Player;
  label: string;
}

/**
 * The current player rolls `value` and moves `tokenId` (picked on the 3D board when it is there, else from the
 * tray; a single legal move plays itself). Recorded on the watcher's page and checked against the path.
 */
async function move(table: Table, value: number, tokenId: number, o: MoveOptions): Promise<Measured> {
  const before = await table.state();
  const mover = table.player(before.game!.currentPlayerId);
  const watcher = o.watcher ?? mover;
  const me = before.game!.players.find((p) => p.id === mover.id)!;
  const from = me.tokens[tokenId]!.step;
  const to = from === null ? 0 : from + value;
  const key = `${mover.id}:${tokenId}`;
  await installMoveRecorder(watcher.page);
  await startRecording(watcher.page, key);
  const rolled = await table.roll(value);
  if (rolled.game!.turn.phase === "awaiting-move" && rolled.game!.currentPlayerId === mover.id) {
    if (await on3d(mover.page)) {
      await expect.poll(async () => (await boardTokens(mover.page)).find((t) => t.key === key)?.state, { message: "the token is offered", timeout: 30_000 }).toBe("movable");
      await pickToken3d(mover, key);
      // On a touch screen the first tap selects (and previews) the move; a second tap plays it.
      if (mover.touch) {
        await expect.poll(async () => (await boardTokens(mover.page)).find((t) => t.key === key)?.state, { message: "the first tap selects it" }).toBe("selected");
        await pickToken3d(mover, key);
      }
      table.moves++;
    } else await table.move(tokenId);
  }
  await expect.poll(async () => (await table.state()).game!.players.find((p) => p.id === mover.id)!.tokens[tokenId]!.step, { message: "the server moved it", timeout: 60_000 }).toBe(to);
  const disturbed = o.during ? (await o.during()) === true : false;
  // Until the watcher shows it standing on its cell.
  const seat = me.seat;
  const cell = cellWorld(seat, to);
  if (await on3d(watcher.page)) {
    await expect
      .poll(
        async () => {
          const s = await standing(watcher.page, key);
          return s.step === String(to) && s.x !== null && Math.hypot(s.x - cell.x, s.z! - cell.z) < 0.35 && s.state !== "walking" && s.state !== "leavingBase" && s.state !== "reachingHome";
        },
        { message: `${o.label}: it stands on step ${to}`, timeout: 60_000 },
      )
      .toBe(true);
    await watcher.page.waitForTimeout(400);
  }
  let metrics: MoveMetrics | null = null;
  let path: WalkedPath | null = null;
  let moveEventToArrivalMs: number | null = null;
  if (!disturbed && (await on3d(watcher.page))) {
    const rec = await stopRecording(watcher.page);
    metrics = moveMetrics(rec, key, String(to));
    path = walkedPath(rec, seat, from, to);
    const moveEvent = [...rec.log].reverse().find((e) => e.type === "token-move" && e.tokens === key)?.t ?? null;
    moveEventToArrivalMs = moveEvent !== null && metrics.arrivalAt !== null ? Math.round(metrics.arrivalAt - moveEvent) : null;
    if (process.env.MOVE_DEBUG)
      console.log(`MOVEDEBUG ${o.label} ` + JSON.stringify({ moveEvent, metrics, frames: rec.frames.filter((f, i, a) => i === 0 || f.boardFrames !== a[i - 1]!.boardFrames).map((f) => [Math.round(f.t), f.step, f.state, f.wx, f.wz]), marks: rec.marks }));
  }
  const m: Measured = { label: o.label, from, to, plannedMs: planned(from, to), metrics, path, moveEventToArrivalMs };
  results.push(m);
  console.log(JSON.stringify({ label: m.label, from, to, plannedMs: m.plannedMs, moveEventToArrivalMs, clickToMotionMs: metrics?.clickToMotionMs, travelMs: metrics?.travelMs, frames: metrics?.drawnFrames, stallMs: metrics?.longestStallMs, path }));
  if (path) {
    expect(path.positions, `${o.label}: drawn while it moved`).toBeGreaterThan(1);
    expect(path.maxOffPath, `${o.label}: every drawn position on the path through each cell in order`).toBeLessThan(0.12);
    expect(path.maxBackwards, `${o.label}: never back along the path (no replay)`).toBeLessThan(0.05);
    expect(path.endOff, `${o.label}: ends on the server's cell`).toBeLessThan(0.05);
  }
  await table.expectInSync();
  return m;
}

/** Timing: from the move's start on screen to its arrival, about its planned time (a slow frame's worth of slack). */
function expectPrompt(m: Measured, slackMs: number) {
  if (m.moveEventToArrivalMs === null) return;
  expect(m.moveEventToArrivalMs, `${m.label}: arrives in about its planned ${m.plannedMs} ms`).toBeLessThan(m.plannedMs + slackMs);
  expect(m.metrics!.longestStallMs, `${m.label}: never stands still on the way`).toBeLessThan(1500);
}

async function twoPlayers(browser: Browser) {
  const aman = await openPlayer(browser, "Aman", "wide", { board: "3d", quality: "medium" });
  const ben = await openPlayer(browser, "Ben", "desktop", { board: "2d" });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben], { syncTimeout: 60_000 });
  await expectBoard3d(aman.page, "3d", 60_000);
  await allReady(aman.page, 8);
  return { aman, ben, table };
}

test("a character's whole journey in 3D: every cell in order, on time, ending on the server's cell, through camera, CPU, quality, view and network changes", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const { aman, ben, table } = await twoPlayers(browser);
  const view = (label: string) => visible(aman.page.getByRole("radio", { name: label }));
  const slack = 2500;

  // Leaving the base, then two bonus turns: six cells round the arm's corner, then a single cell.
  expectPrompt(await move(table, 6, 0, { label: "leaving base" }), slack);
  expectPrompt(
    await move(table, 6, 0, {
      label: "six cells, round a corner, camera modes mid-walk",
      during: async () => {
        await visible(aman.page.getByRole("button", { name: "Follow token" })).click();
        await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "follow");
        await aman.page.waitForTimeout(400);
        await visible(aman.page.getByRole("button", { name: "Overview" })).click();
        await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-camera", "overview");
      },
    }),
    slack,
  );
  expectPrompt(await move(table, 1, 0, { label: "one cell" }), slack);
  await table.act(1); // Ben: nothing out, the turn passes

  // The CPU slowed four times for a whole six-cell walk: slower frames, the same path, the same end.
  const cdp = await aman.context.newCDPSession(aman.page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const slowed = await move(table, 6, 0, { label: "six cells, CPU slowed 4x" });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expectPrompt(slowed, 6000);

  // Graphics quality changed mid-walk: the board is rebuilt; the walk ends on its cell, nothing replays.
  await move(table, 5, 0, {
    label: "five cells, quality changed mid-walk",
    during: async () => {
      await view("Low").click();
      await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-quality", "low");
      return true;
    },
  });
  await expectBoard3d(aman.page, "3d", 60_000);
  await table.act(1);

  // A refresh mid-walk: the board comes back with it on its cell, and the walk does not play again.
  await move(table, 6, 0, {
    label: "six cells, refreshed mid-walk",
    during: async () => {
      await aman.page.reload();
      await expectBoard3d(aman.page, "3d", 60_000);
      return true;
    },
  });
  await installMoveRecorder(aman.page);
  await startRecording(aman.page, `${aman.id}:0`);
  await aman.page.waitForTimeout(1500);
  const still = await stopRecording(aman.page);
  const walkedAgain = still.frames.filter((f) => f.state === "walking").length;
  expect(walkedAgain, "nothing replays after the refresh").toBe(0);

  // The other player's network drops mid-walk and comes back: their 2D board catches up to the server's state.
  await move(table, 5, 0, {
    label: "five cells, the other player offline mid-walk",
    during: async () => {
      await ben.context.setOffline(true);
      table.offline.add(ben);
      await aman.page.waitForTimeout(500);
      await ben.context.setOffline(false);
      table.offline.delete(ben);
    },
  });
  await table.act(1);

  // Switching to 2.5D mid-walk, then to 2D mid-walk, and back to 3D: the move is neither repeated nor lost.
  await move(table, 6, 0, {
    label: "six cells, switched to 2.5D mid-walk",
    during: async () => {
      await view("2.5D board").click();
      await expectBoard3d(aman.page, "2.5d", 60_000);
      return true;
    },
  });
  await move(table, 5, 0, {
    label: "five cells, switched to 2D mid-walk",
    during: async () => {
      await view("2D board (lightweight)").click();
      await expect(aman.page.locator('svg[data-testid="game-board"]')).toBeVisible();
      return true;
    },
  });
  expect((await readBoard(aman.page))[`token-${aman.id}:0`]).toBe("40");
  await view("3D board (preview)").click();
  await expectBoard3d(aman.page, "3d", 60_000);
  await allReady(aman.page, 8);
  await table.act(1);

  // Into the home lane and the finish.
  expectPrompt(await move(table, 6, 0, { label: "six cells, the long track" }), slack);
  expectPrompt(await move(table, 5, 0, { label: "five cells, into the home lane" }), slack);
  await table.act(1);
  expectPrompt(await move(table, 5, 0, { label: "the finish" }), slack);

  // The home bonus: a six takes another out, and the WebGL context is lost mid-walk: the 2D board takes over,
  // on the server's state.
  await move(table, 6, 1, {
    label: "leaving base, context lost mid-walk",
    during: async () => {
      await aman.page.evaluate(() => {
        const canvas = document.querySelector("canvas[data-board-gl]") as HTMLCanvasElement | null;
        (canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context") as { loseContext: () => void } | null)?.loseContext();
      });
      await expect(aman.page.locator('svg[data-testid="game-board"]')).toBeVisible({ timeout: 30_000 });
      return true;
    },
  });
  expect((await readBoard(aman.page))[`token-${aman.id}:1`]).toBe("0");
  noErrors([aman, ben]);
  for (const p of [aman, ben]) await p.context.close();
});

test("four players: a capture picked by touch in 2.5D — the attacker walks its cells, the victim goes back to its own base slot, every board in sync", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const aman = await openPlayer(browser, "Aman", "wide", { board: "3d", quality: "low" });
  const ben = await openPlayer(browser, "Ben", "phone", { board: "2.5d", quality: "low" });
  const cara = await openPlayer(browser, "Cara", "tablet", { board: "2d" });
  const dev = await openPlayer(browser, "Dev", "desktop", { board: "2d" });
  const code = await createRoom(aman, { players: 4, city: "Kolkata" });
  for (const p of [ben, cara, dev]) await joinRoom(p, code);
  await startGame(aman, [aman, ben, cara, dev]);
  const table = await seatTable(code, [aman, ben, cara, dev], { syncTimeout: 60_000 });
  await expectBoard3d(aman.page, "3d", 60_000);
  await expectBoard3d(ben.page, "2.5d", 60_000);
  await allReady(aman.page, 16);
  await allReady(ben.page, 16);
  const seats = Object.fromEntries((await table.state()).game!.players.map((p) => [p.id, p.seat]));

  // Aman's character to two cells past Ben's start (each seat starts 13 cells further on), recorded move by move;
  // everyone else passes (nothing out, a 1).
  const target = 13 * ((seats[ben.id]! - seats[aman.id]! + 4) % 4) + 2;
  for (let guard = 0; guard < 60; guard++) {
    const g = (await table.state()).game!;
    const step = g.players.find((p) => p.id === aman.id)!.tokens[0]!.step;
    if (step === target && g.currentPlayerId !== aman.id) break;
    if (g.currentPlayerId !== aman.id) {
      await table.act(1);
      continue;
    }
    const remaining = step === null ? Infinity : target - step;
    const value = step === null ? 6 : remaining > 6 ? (g.turn.consecutiveSixes < 2 ? 6 : 5) : remaining === 6 ? 5 : remaining;
    await move(table, value, 0, { label: `4p: ${step === null ? "leaving base" : `${value} cells`}` });
  }
  while ((await table.state()).game!.currentPlayerId !== ben.id) await table.act(1);

  // Ben (touch, 2.5D) brings one out and lands on Aman's character with a 2; Aman's 3D board records both.
  await move(table, 6, 0, { label: "4p: Ben leaves base (touch)" });
  const victimKey = `${aman.id}:0`;
  const attack = await move(table, 2, 0, {
    label: "4p: Ben captures",
    watcher: aman,
    during: async () => {
      // The victim goes back to its own base slot (its seat's slot 0) on Aman's board.
      const slot = classicBaseSlots(seats[aman.id]!)[0]!;
      const home = gridToWorld(slot.x, slot.y);
      await expect
        .poll(
          async () => {
            const s = await standing(aman.page, victimKey);
            return s.step === "base" && s.x !== null && Math.hypot(s.x - home.x, s.z! - home.z) < 0.05;
          },
          { message: "the victim is back in its own base slot", timeout: 60_000 },
        )
        .toBe(true);
    },
  });
  expectPrompt(attack, 2500);
  const after = await table.state();
  expect(after.game!.players.find((p) => p.id === aman.id)!.tokens[0]!.step, "the server sent it home").toBeNull();
  for (const p of [aman, ben, cara, dev]) expect((await readBoard(p.page))[`token-${aman.id}:0`], `${p.name}: the victim in base`).toBe("base");
  noErrors([aman, ben, cara, dev]);
  for (const p of [aman, ben, cara, dev]) await p.context.close();
});

test.afterAll(() => {
  if (process.env.MOVEMENT_ACCEPT_OUT) writeFileSync(process.env.MOVEMENT_ACCEPT_OUT, JSON.stringify(results, null, 2));
});
