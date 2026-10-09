// Classic rules as players see them, in real browsers with normal motion.
// One scripted two-player game: Aman on a desktop (mouse), Ben on a phone
// (touch). Dice are queued at the server; every action is made in the UI.
import { expect, test, type Page } from "@playwright/test";
import { CLASSIC_FINISH, classicSeatPath, type Cell } from "@ludo/board-layouts";
import type { GameHistoryEntry, LegalMoveView } from "@ludo/shared-types";
import { queueDice } from "../support/control";
import { createRoom, joinRoom, openPlayer, readBoard, seatTable, startGame, visible, type Table } from "../support/game";

const CELL = 40;
const PAD = 16;

/** The grid cell a token is drawn in, read from its rendered SVG transform. */
async function drawnCell(page: Page, key: string): Promise<Cell> {
  const transform = await page.getByTestId(`token-${key}`).evaluate((el) => (el as SVGGElement).style.transform);
  const [x, y] = [...transform.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
  return { row: Math.floor((y! - PAD) / CELL), col: Math.floor((x! - PAD) / CELL) };
}

function layoutCell(seat: number, step: number): Cell {
  const path = classicSeatPath(seat);
  return step <= 50 ? path.track[step]! : step <= 55 ? path.lane[step - 51]! : CLASSIC_FINISH[seat]!;
}

/** Entries the server added since `fromSeq`. */
const since = (history: GameHistoryEntry[], fromSeq: number) => history.filter((e) => e.seq > fromSeq);
const lastSeq = (history: GameHistoryEntry[]) => history.at(-1)?.seq ?? 0;
const pick = (tokenId: number) => (legal: LegalMoveView[]) => {
  expect(legal.map((m) => m.tokenId)).toContain(tokenId);
  return tokenId;
};

test("classic rules in the browser: clockwise moves, sixes, safe cells, captures, home and duplicates", async ({ browser }) => {
  const aman = await openPlayer(browser, "Aman", "desktop");
  const ben = await openPlayer(browser, "Ben", "phone");
  const code = await createRoom(aman, { players: 2 });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table: Table = await seatTable(code, [aman, ben]);
  const A = (id: number) => `${aman.id}:${id}`;
  const B = (id: number) => `${ben.id}:${id}`;
  const seats = new Map((await table.state()).players.map((p) => [p.id, p.seat]));
  expect([seats.get(aman.id), seats.get(ben.id)]).toEqual([0, 2]);

  // Clockwise: wherever Aman's token stops, it is drawn on the layout's cell for that step,
  // and its angle around the board centre only ever increases (clockwise on screen).
  const stops: number[] = [];
  const checkStop = async (step: number) => {
    for (const p of [aman, ben]) expect(await drawnCell(p.page, A(0)), `${p.name} draws step ${step} on its layout cell`).toEqual(layoutCell(0, step));
    stops.push(step);
  };

  // 1. A six opens a token: Aman clicks it on the board (mouse: one click moves it).
  await queueDice(6);
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).click();
  table.rolls++;
  await expect(aman.page.getByTestId(`token-${A(0)}`)).toHaveAttribute("data-state", "movable");
  await expect(aman.page.locator('[data-state="movable"]')).toHaveCount(4);
  await aman.page.getByTestId(`token-${A(0)}`).click();
  table.moves++;
  let snap = await table.expectInSync();
  expect(snap.game!.currentPlayerId, "a six earns another roll").toBe(aman.id);
  await checkStop(0);

  // 2. Six again: bonus. 3. A third six forfeits the turn, and nothing moves.
  snap = await table.act(6, pick(0));
  await checkStop(6);
  let mark = lastSeq(snap.history);
  snap = await table.act(6);
  expect(since(snap.history, mark).map((e) => e.type)).toEqual(expect.arrayContaining(["roll", "forfeit"]));
  expect(snap.game!.currentPlayerId).toBe(ben.id);
  expect((await readBoard(aman.page))[`token-${A(0)}`]).toBe("6");
  await expect(visible(aman.page.getByText("Three sixes: turn forfeited"))).toBeVisible();
  await expect(visible(ben.page.getByText("Aman rolled three sixes: turn forfeited"))).toBeVisible();

  // Ben opens two tokens on his start (tap to preview, tap again), then moves one off it.
  await table.act(6, pick(0));
  await table.act(6, pick(1));
  snap = await table.act(3, pick(1));
  expect(snap.game!.currentPlayerId).toBe(aman.id);

  // 10. Exactly one legal move (a five; tokens in base need a six): the server moves it.
  mark = lastSeq(snap.history);
  const movesBefore = table.moves;
  snap = await table.act(5);
  expect(since(snap.history, mark).map((e) => e.type)).toContain("auto-move");
  expect(table.moves, "no choice was offered").toBe(movesBefore);
  await checkStop(11);

  await table.act(2, pick(1)); // Ben: 3 → 5, leaving token 0 on his start

  // 5. Safe cell: Aman lands on Ben's start (a safe cell) where Ben's token stands. No capture.
  await table.act(6, pick(0));
  await checkStop(17);
  await table.act(6, pick(0));
  await checkStop(23);
  mark = lastSeq(snap.history);
  snap = await table.act(3);
  await checkStop(26);
  expect(since(snap.history, mark).map((e) => e.type)).not.toContain("capture");
  expect((await readBoard(ben.page))[`token-${B(0)}`], "Ben's token stays on its safe start").toBe("0");
  expect(await drawnCell(ben.page, B(0))).toEqual(layoutCell(0, 26)); // the same cell, drawn as a stack
  expect(snap.game!.currentPlayerId).toBe(ben.id);

  await table.act(1, pick(1)); // Ben: 5 → 6, an unprotected cell

  // 6. Capture: Aman lands on Ben's token; it goes back to base on both screens; Aman rolls again.
  mark = lastSeq(snap.history);
  snap = await table.act(6, pick(0));
  await checkStop(32);
  const captured = since(snap.history, mark);
  expect(captured).toContainEqual(expect.objectContaining({ type: "capture", playerId: aman.id, victimPlayerId: ben.id, victimTokenId: 1 }));
  expect(captured).toContainEqual(expect.objectContaining({ type: "bonus-roll", playerId: aman.id, reasons: expect.arrayContaining(["capture"]) }));
  for (const p of [aman, ben]) expect((await readBoard(p.page))[`token-${B(1)}`]).toBe("base");
  await expect(visible(aman.page.getByText(/Capture: roll again/))).toBeVisible();
  expect(snap.game!.currentPlayerId).toBe(aman.id);

  // Toward home, one auto-move at a time.
  await table.act(4);
  await checkStop(36);
  for (const step of [41, 46, 51]) {
    await table.act(1); // Ben: his one token on the board moves (auto)
    await table.act(5);
    await checkStop(step);
  }
  // 8. Step 51 is the first home-lane cell.
  expect(layoutCell(0, 51)).toEqual(classicSeatPath(0).lane[0]);

  // Exact finish: a six would overshoot home, so the server offers only the openings.
  await table.act(1);
  snap = await table.roll(6);
  expect(snap.game!.turn.legalMoves.map((m) => m.tokenId).sort()).toEqual([1, 2, 3]);
  await table.move(1);
  await table.expectInSync();
  // An exact five finishes: home, and a bonus roll.
  mark = lastSeq((await table.state()).history);
  snap = await table.act(5, pick(0));
  await checkStop(56);
  expect(since(snap.history, mark)).toContainEqual(expect.objectContaining({ type: "home", playerId: aman.id, tokenId: 0 }));
  expect(since(snap.history, mark)).toContainEqual(expect.objectContaining({ type: "bonus-roll", reasons: expect.arrayContaining(["home"]) }));
  for (const p of [aman, ben]) await expect(p.page.getByTestId(`token-${A(0)}`)).toHaveAttribute("data-state", "finished");
  await expect(visible(aman.page.getByLabel("1 of 4 tokens home"))).toBeVisible();

  // 9. A finished token never moves again: not offered, not clickable.
  await table.act(3); // only token 1 can move: auto
  await table.act(1);
  snap = await table.roll(6);
  expect(snap.game!.turn.legalMoves.map((m) => m.tokenId)).not.toContain(0);
  await expect(aman.page.getByTestId(`token-${A(0)}`)).not.toHaveAttribute("role", "button");

  // 13. Duplicates: a double click on a move, and on Roll, each commit exactly once.
  const before = await table.state();
  await visible(aman.page.getByTestId("move-tray"))
    .getByRole("button", { name: /^Token 2:/ })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  table.moves++;
  await expect.poll(async () => (await table.state()).events.length, { message: "the move commits" }).toBeGreaterThan(before.events.length);
  snap = await table.expectInSync();
  expect(snap.events.length, "one move committed for a double click").toBe(before.events.length + 1);
  await queueDice(2);
  await visible(aman.page.getByRole("button", { name: "Roll dice" })).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  table.rolls++;
  await expect.poll(async () => (await table.state()).events.length).toBe(before.events.length + 2);
  snap = await table.expectInSync();
  expect(snap.events.filter((e) => e.actionType === "game:roll")).toHaveLength(table.rolls);
  expect(snap.events.filter((e) => e.actionType === "game:move")).toHaveLength(table.moves);
  // And the browser sent exactly one request per action: no second, stale request was even attempted.
  expect(aman.sent.roll + ben.sent.roll, "roll requests sent").toBe(table.rolls);
  expect(aman.sent.move + ben.sent.move, "move requests sent").toBe(table.moves);
  await expect(aman.page.getByTestId("game-status"), "no refusal shown").toHaveCount(0);

  // Clockwise overall: the angle around the centre increases from stop to stop until the lane.
  const centre = PAD + 7.5 * CELL;
  const angle = (step: number) => {
    const c = layoutCell(0, step);
    return Math.atan2(PAD + (c.row + 0.5) * CELL - centre, PAD + (c.col + 0.5) * CELL - centre);
  };
  const trackStops = stops.filter((s) => s <= 50);
  let turned = 0;
  for (let i = 1; i < trackStops.length; i++) {
    let delta = angle(trackStops[i]!) - angle(trackStops[i - 1]!);
    if (delta <= -Math.PI) delta += 2 * Math.PI;
    expect(delta, `step ${trackStops[i - 1]} → ${trackStops[i]} turns clockwise`).toBeGreaterThan(0);
    turned += delta;
  }
  expect(turned).toBeGreaterThan(Math.PI); // most of a lap
  for (const p of [aman, ben]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
});
