// C.3A: the Crimson team's human characters, in real browsers against the
// real server. The renderer's token mirror reports which character each
// token is, whether it has loaded (its team colour, clips and level of
// detail) and what it is doing (its presentation state), so these tests can
// follow the characters through real play:
//  - four distinct characters for Kolkata's Crimson seat only; pawns
//    everywhere else; the team colour applied; every clip loaded;
//  - their base routine (a chat, tea, reading, exercise) and their turn;
//  - a six: the chosen character reacts and leaves its base only after the
//    server has accepted the move, walks the exact cells at a walking pace,
//    and stands on its cell; a capture sends it back to its base slot;
//  - a refresh mid-walk restores it at its place without replaying;
//  - camera focus, mouse picks in 2.5D and touch picks in 3D on a phone,
//    quality changes, the 2D fallback and GPU objects.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { boardCells, boardTokens, expectBoard3d, pickToken3d } from "../support/board3d";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible, type BoardView, type Device, type Player } from "../support/game";
import { cellWorld, installMoveRecorder, moveMetrics, startRecording, stopRecording, walkedPath } from "../support/movement";
import { readTimeline, startTimeline } from "../support/timeline";

const CLIPS = ["cheer", "dismay", "drink", "excited", "exercise", "idle", "listen", "look_around", "read", "run", "stretch", "talk", "upset", "walk", "wave"];

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};
const close = async (players: Player[]) => {
  for (const p of players) await p.context.close();
};

interface CharacterView {
  key: string;
  character: string | null;
  ready: boolean;
  state: string | null;
  clip: string | null;
  team: string | null;
  level: string | null;
  clips: string[];
  step: string;
}

function characters(page: Page): Promise<CharacterView[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].map((el) => ({
      key: el.dataset.key!,
      character: el.dataset.character ?? null,
      ready: el.dataset.characterReady === "true",
      state: el.dataset.characterState ?? null,
      clip: el.dataset.characterClip ?? null,
      team: el.dataset.characterTeam ?? null,
      level: el.dataset.characterLevel ?? null,
      clips: (el.dataset.characterClips ?? "").split(" ").filter(Boolean),
      step: el.dataset.step!,
    })),
  );
}

/** Every character on the board has loaded (two teams in a two-player game). */
/**
 * A departure as drawn, from the page's recording (started before the pick): every frame the board drew between
 * the base slot and the start cell shows the departure (the excited hop, then walking off; a software renderer
 * drawing a frame or two a second may show either, or neither), every drawn position lies on the straight line
 * from the base slot to the start cell, and it ends standing there. Returns when it first showed leaving.
 */
async function expectDeparture(page: Page, key: string, seat: number, message: string): Promise<number | null> {
  await expect.poll(async () => (await characters(page)).find((c) => c.key === key)!.step, { message: `${message}: on the start cell`, timeout: 20_000 }).toBe("0");
  await expect.poll(async () => (await characters(page)).find((c) => c.key === key)!.state, { message: `${message}: standing`, timeout: 15_000 }).not.toMatch(/^(excited|leavingBase)$/);
  const rec = await stopRecording(page);
  const path = walkedPath(rec, seat, null, 0);
  console.log(`${message}: ${JSON.stringify(path)}`);
  expect(path.maxOffPath, `${message}: straight from its base slot to the start cell`).toBeLessThan(0.12);
  expect(path.maxBackwards, `${message}: never back`).toBeLessThan(0.05);
  expect(path.endOff, `${message}: on the start cell`).toBeLessThan(0.05);
  const drawn = rec.frames.filter((f, i, a) => i > 0 && f.boardFrames !== a[i - 1]!.boardFrames && f.wx !== null);
  const base = drawn[0]!;
  const start = cellWorld(seat, 0);
  const away = (f: (typeof drawn)[number]) => Math.hypot(f.wx! - base.wx!, f.wz! - base.wz!) > 0.01;
  const onTheWay = drawn.filter((f) => away(f) && Math.hypot(f.wx! - start.x, f.wz! - start.z) > 0.05);
  console.log(`${message}: ${onTheWay.length} frames drawn on the way: ${onTheWay.map((f) => f.state).join(", ")}`);
  for (const f of onTheWay) expect(["excited", "leavingBase"], `${message}: leaving`).toContain(f.state);
  return drawn.find((f) => f.state === "excited" || f.state === "leavingBase" || away(f))?.t ?? null;
}

async function allReady(page: Page, count = 8) {
  await expect.poll(async () => (await characters(page)).filter((c) => c.ready).length, { message: "the characters have loaded", timeout: 90_000 }).toBe(count);
}

/** Records each character's states in the page (every change, with a timestamp). */
async function watchStates(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __states: { t: number; key: string; state: string }[] };
    w.__states = [];
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (r.attributeName === "data-character-state") w.__states.push({ t: performance.now(), key: el.dataset.key!, state: el.dataset.characterState! });
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-character-state"] });
  });
}
const states = (page: Page) => page.evaluate(() => (window as unknown as { __states: { t: number; key: string; state: string }[] }).__states);

async function kolkata(host: { name: string; device: Device; board: BoardView }, guest: { name: string; device: Device; board: BoardView }, browser: Browser) {
  const aman = await openPlayer(browser, host.name, host.device, { board: host.board });
  const ben = await openPlayer(browser, guest.name, guest.device, { board: guest.board });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  return { aman, ben, table, code };
}

test("each Kolkata seat is played by its own team of four distinct characters in its colours, with every clip; other cities keep pawns", async ({ browser }) => {
  const { aman, ben, table } = await kolkata({ name: "Aman", device: "wide", board: "2.5d" }, { name: "Ben", device: "phone", board: "3d" }, browser);
  for (const p of [aman, ben]) {
    await expectBoard3d(p.page, p === aman ? "2.5d" : "3d");
    await allReady(p.page);
    const cs = await characters(p.page);
    const crimson = cs.filter((c) => c.key.startsWith(`${aman.id}:`));
    expect(crimson.map((c) => c.character), `${p.name}: tokens 0-3 are the four people`).toEqual(["adda", "tea", "newspaper", "exercise"]);
    // Ben's seat has its own team: four other people, in his colour.
    const others = cs.filter((c) => !c.key.startsWith(`${aman.id}:`));
    expect(others.map((c) => c.character).every((k) => k !== null), `${p.name}: Ben's tokens are people too`).toBe(true);
    expect(new Set([...crimson, ...others].map((c) => c.character)).size, "eight different people").toBe(8);
    expect(new Set(others.map((c) => c.team)).size, "one colour for Ben's team").toBe(1);
    expect(others[0]!.team, "Ben's team wears his colour, not crimson").not.toBe(crimson[0]!.team);
    for (const c of others) expect(c.clips, `${c.character}: every clip`).toEqual(CLIPS);
    for (const c of crimson) {
      expect(c.clips, `${c.character}: every clip`).toEqual(CLIPS);
      // Tinted to the seat's colour: a crimson red.
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.team!.slice(i, i + 2), 16));
      expect(r, `${c.character} wears the team colour ${c.team}`).toBeGreaterThan(g! + 60);
      expect(r).toBeGreaterThan(b! + 40);
    }
    expect(new Set(crimson.map((c) => c.team)).size, "one team colour").toBe(1);
    await expect(visible(p.page.getByTestId("characters-prototype"))).toBeVisible();
  }
  // The base routine: in a minute, the storyteller and the tea lover chat (both "interacting" at once),
  // the reader reads, the runner stretches or exercises.
  await watchStates(aman.page);
  await expect
    .poll(
      async () => {
        const cs = await characters(aman.page);
        const by = (k: string) => cs.find((c) => c.character === k)!;
        return by("adda").state === "interacting" && by("tea").state === "interacting";
      },
      { message: "the storyteller and the tea lover chat", timeout: 60_000, intervals: [500] },
    )
    .toBe(true);
  const clipsSeen = new Map<string, Set<string>>();
  for (let i = 0; i < 24; i++) {
    for (const c of await characters(aman.page)) if (c.character) clipsSeen.set(c.character, (clipsSeen.get(c.character) ?? new Set()).add(c.clip!));
    await aman.page.waitForTimeout(1000);
  }
  console.log(Object.fromEntries([...clipsSeen].map(([k, v]) => [k, [...v]])));
  expect(clipsSeen.get("newspaper")).toContain("read");
  expect([...clipsSeen.get("exercise")!].some((c) => c === "stretch" || c === "exercise")).toBe(true);
  expect(clipsSeen.get("tea")).toContain("drink");
  await table.act(6, () => 0);
  await table.act(1); // Aman's bonus roll moves his storyteller on

  // The second team plays too: Ben, on his phone in 3D, picks one of his own people by touch (a tap selects,
  // a second plays), and Aman's screen shows that character leaving Ben's base.
  await watchStates(aman.page);
  await table.roll(6);
  const bens = `${ben.id}:0`;
  await expect.poll(async () => (await boardTokens(ben.page)).filter((t) => t.state === "movable").length).toBe(4);
  await pickToken3d(ben, bens);
  await expect.poll(async () => (await characters(ben.page)).find((c) => c.key === bens)!.state, { message: "Ben's character is selected" }).toBe("selected");
  const before = (await table.state()).game!.stateVersion;
  await installMoveRecorder(aman.page);
  await startRecording(aman.page, bens);
  await pickToken3d(ben, bens);
  await expect.poll(async () => (await table.state()).game!.stateVersion, { message: "Ben's tap plays the move" }).toBeGreaterThan(before);
  table.moves++;
  await expectDeparture(aman.page, bens, (await table.state()).game!.players.find((p) => p.id === ben.id)!.seat, "Ben's character leaves his base");
  await table.expectInSync();
  noErrors([aman, ben]);
  await close([aman, ben]);

  // Another city has no characters at all.
  const dev = await openPlayer(browser, "Dev", "wide", { board: "2.5d" });
  const eve = await openPlayer(browser, "Eve", "phone", { board: "2d" });
  const code = await createRoom(dev, { players: 2, city: "Delhi" });
  await joinRoom(eve, code);
  await startGame(dev, [dev, eve]);
  await expectBoard3d(dev.page);
  expect((await characters(dev.page)).every((c) => c.character === null)).toBe(true);
  await expect(dev.page.getByTestId("characters-prototype")).toHaveCount(0);
  await close([dev, eve]);
});

test("a six: the chosen character reacts, leaves only once the server accepts, walks the exact cells at a walking pace, and stands on its cell", async ({ browser }) => {
  const { aman, ben, table } = await kolkata({ name: "Aman", device: "wide", board: "3d" }, { name: "Ben", device: "phone", board: "2d" }, browser);
  await expectBoard3d(aman.page, "3d");
  await allReady(aman.page);
  await watchStates(aman.page);
  const adda = `${aman.id}:0`;
  // Their turn comes round: they notice.
  await table.act(1); // Aman: no token out, passes
  await table.act(1); // Ben passes
  await expect.poll(async () => (await states(aman.page)).filter((s) => s.state === "turnAlert" && s.key.startsWith(`${aman.id}:`)).length, { message: "the team notices its turn" }).toBeGreaterThan(0);
  // A six: all four may go; none leaves before the click and the server's answer.
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.state === "movable").length).toBe(4);
  await aman.page.waitForTimeout(800);
  expect((await states(aman.page)).some((s) => s.state === "leavingBase" || s.state === "excited"), "nobody leaves on the roll alone").toBe(false);
  expect((await characters(aman.page)).find((c) => c.key === adda)!.state).toBe("selectable");
  await startTimeline(aman.page);
  const before = (await table.state()).game!.stateVersion;
  await installMoveRecorder(aman.page);
  await startRecording(aman.page, adda);
  await pickToken3d(aman, adda);
  await expect.poll(async () => (await table.state()).game!.stateVersion, { message: "the server accepts the move" }).toBeGreaterThan(before);
  table.moves++;
  const leftAt = await expectDeparture(aman.page, adda, 0, "excited, then off to the start cell, then standing");
  const committedAt = (await readTimeline(aman.page)).find((e) => e.target === adda)!.t;
  expect(leftAt, "it was drawn leaving").not.toBeNull();
  expect(leftAt!, "it reacts only once the move is on the board").toBeGreaterThanOrEqual(committedAt - 5);
  await table.expectInSync();

  // The bonus roll: four cells, walked one by one at a walking pace (not the pawns' 170 ms hops), recorded frame by
  // frame in board units and checked against the seat's path.
  await startTimeline(aman.page);
  await installMoveRecorder(aman.page);
  await startRecording(aman.page, adda);
  await table.act(4);
  await expect.poll(async () => (await characters(aman.page)).find((c) => c.key === adda)!.state, { timeout: 15_000 }).toBe("idle");
  const rec = await stopRecording(aman.page);
  const walked = walkedPath(rec, 0, 0, 4);
  console.log(`walked: ${JSON.stringify(walked)}`);
  expect(walked.maxOffPath, "every drawn position on the path through cells 1, 2, 3 and 4 in order").toBeLessThan(0.12);
  expect(walked.maxBackwards, "never back along it").toBeLessThan(0.05);
  expect(walked.endOff, "standing on step 4").toBeLessThan(0.05);
  // The board's logical steps go forward to 4 (a busy page may commit two that fell due together at once; the
  // character still walks through both, as checked above).
  const steps = (await readTimeline(aman.page)).filter((e) => e.target === adda).map((e) => Number(e.value));
  expect(steps).toEqual([...steps].sort((a, b) => a - b));
  expect(steps.at(-1)).toBe(4);
  // A walking pace: about 0.34 s a cell (pawns hop in 0.17 s).
  const pace = moveMetrics(rec, adda, "4");
  console.log(`travel ${pace.travelMs} ms over ${pace.drawnFrames} drawn frames`);
  expect(pace.travelMs, "four cells at a walking pace").toBeGreaterThan(4 * 170);
  expect((await states(aman.page)).some((s) => s.key === adda && s.state === "walking")).toBe(true);
  // Standing on its cell: the token's projection sits on the cell of step 4 of seat 0.
  const cells = await boardCells(aman.page);
  const t = (await boardTokens(aman.page)).find((x) => x.key === adda)!;
  const cell = cells.find((c) => c.kind !== "star" && c.kind !== "lane" && Math.hypot(c.x - t.x, c.y - t.y) < 40);
  expect(cell, "on a track cell").toBeTruthy();
  await table.expectInSync();
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("caught: dismay, then back to its own base slot; a refresh mid-walk puts the character where it belongs without replaying", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const { aman, ben, table } = await kolkata({ name: "Aman", device: "wide", board: "2.5d" }, { name: "Ben", device: "phone", board: "2d" }, browser);
  await expectBoard3d(aman.page);
  await allReady(aman.page);
  const adda = `${aman.id}:0`;
  // The storyteller walks to step 28 (6, 6, 5 then 6, 6, 5): Ben's start is two cells behind.
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  await table.act(5);
  await table.act(1); // Ben passes
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  // A refresh while he walks: he is put straight on his cell, with no replayed reaction or walk.
  await queueAndRoll(table, 5);
  await aman.page.waitForTimeout(700);
  await aman.page.reload();
  await expectBoard3d(aman.page);
  await allReady(aman.page);
  await watchStates(aman.page);
  await aman.page.waitForTimeout(2500);
  expect((await states(aman.page)).filter((s) => s.key === adda).map((s) => s.state), "nothing replays after a refresh").not.toContain("walking");
  await table.expectInSync();
  expect((await table.state()).game!.players.find((p) => p.id === aman.id)!.tokens[0]!.step).toBe(28);

  // Ben opens and lands on him: dismay, and back to his own base slot.
  await table.act(6, () => 0);
  await installMoveRecorder(aman.page);
  await startRecording(aman.page, adda);
  const snap = await table.act(2);
  expect(snap.history.filter((e) => e.type === "capture").length).toBe(1);
  // The capture plays for 1.24 s from when the board showed it: give it that and a slow frame or two.
  await aman.page.waitForTimeout(3000);
  // Every frame drawn while it is on its way from the capture cell to its base slot shows it caught (dismay, then
  // sent back). A software renderer may draw a frame only every second or so, so how many such frames there are
  // varies; there must be no other state among them.
  const capRec = await stopRecording(aman.page);
  const drawnFrames = capRec.frames.filter((f, i, a) => i > 0 && f.boardFrames !== a[i - 1]!.boardFrames && f.wx !== null);
  const caughtAt = drawnFrames.find((f) => f.step === "base" && f.state !== "idle" && f.state !== "interacting");
  const slotAt = drawnFrames.at(-1)!;
  const onTheWay = drawnFrames.filter((f) => f.step === "base" && (f.wx !== slotAt.wx || f.wz !== slotAt.wz) && caughtAt && f.t >= caughtAt.t);
  console.log(`caught: ${onTheWay.length} frames drawn on the way back: ${onTheWay.map((f) => f.state).join(", ")}`);
  for (const f of onTheWay) expect(["captured", "returningToBase"], "caught, on its way back").toContain(f.state);
  await expect.poll(async () => (await characters(aman.page)).find((c) => c.key === adda)!.step).toBe("base");
  // In the Crimson base corner (top left), not on the track.
  const cells = await boardCells(aman.page);
  const at = (row: number, col: number) => cells.find((c) => c.row === row && c.col === col && c.kind !== "star")!;
  const t = (await boardTokens(aman.page)).find((x) => x.key === adda)!;
  expect(t.x, "left of the track's column").toBeLessThan(at(6, 5).x);
  expect(t.y, "above the track's row").toBeLessThan(at(5, 6).y);
  await table.expectInSync();
  noErrors([aman, ben]);
  await close([aman, ben]);
});

async function queueAndRoll(table: Awaited<ReturnType<typeof seatTable>>, value: number) {
  // Roll without waiting for the move to finish playing (the refresh happens mid-walk).
  await table.roll(value);
}

test("focus follows the walking character; mouse in 2.5D and touch in 3D pick characters; quality changes, the 2D fallback and GPU objects", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  // The Crimson host plays on a phone in 3D (touch), the guest on a wide screen.
  const { aman: phone, ben: wide, table } = await kolkata({ name: "Pia", device: "phone", board: "3d" }, { name: "Ravi", device: "wide", board: "2.5d" }, browser);
  await expectBoard3d(phone.page, "3d");
  await allReady(phone.page);
  const tea = `${phone.id}:1`;
  // Touch: the first tap selects (and previews), the second plays.
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(phone.page)).filter((t) => t.state === "movable").length).toBe(4);
  await pickToken3d(phone, tea);
  await expect.poll(async () => (await characters(phone.page)).find((c) => c.key === tea)!.state, { message: "selected on the first tap" }).toBe("selected");
  expect(phone.sent.move).toBe(0);
  const v = (await table.state()).game!.stateVersion;
  await pickToken3d(phone, tea);
  await expect.poll(async () => (await table.state()).game!.stateVersion).toBeGreaterThan(v);
  table.moves++;
  await table.expectInSync();
  // Focus: follow the token; while she walks the camera keeps her near the middle of the view.
  await visible(phone.page.getByRole("button", { name: "Follow token" })).click();
  await expect(phone.page.getByTestId("game-board")).toHaveAttribute("data-camera", "follow");
  await watchStates(phone.page);
  await table.roll(5);
  const canvas = (await phone.page.locator("canvas[data-board-gl]").boundingBox())!;
  let checked = 0;
  // Until the walk is over (the die tumbles and shows first).
  for (let i = 0; i < 40; i++) {
    await phone.page.waitForTimeout(300);
    const me = (await characters(phone.page)).find((c) => c.key === tea)!;
    if (me.state === "walking") {
      const t = (await boardTokens(phone.page)).find((x) => x.key === tea)!;
      expect(Math.abs(t.x - (canvas.x + canvas.width / 2)), "kept in view while walking").toBeLessThan(canvas.width * 0.35);
      checked++;
    } else if (checked > 0 || (await states(phone.page)).some((s) => s.key === tea && s.state === "walking")) break;
  }
  expect((await states(phone.page)).some((s) => s.key === tea && s.state === "walking"), "she walked").toBe(true);
  table.moves++;
  await table.expectInSync();
  await visible(phone.page.getByRole("button", { name: "Overview" })).click();
  await table.act(1); // Ravi passes

  // Quality changes reload the characters at each level; picks still work afterwards; one canvas; GPU objects bounded.
  const counts: Record<string, number> = {};
  for (const level of ["High", "Low", "Medium"] as const) {
    await visible(phone.page.getByRole("radio", { name: level })).click();
    await expect(phone.page.getByTestId("game-board")).toHaveAttribute("data-quality", level.toLowerCase());
    await expectBoard3d(phone.page, "3d");
    await expect.poll(async () => (await characters(phone.page)).filter((c) => c.ready && c.level === level.toLowerCase()).length, { timeout: 90_000 }).toBe(8);
    await expect(phone.page.locator("canvas")).toHaveCount(1);
    counts[level] = Number(await phone.page.getByTestId("game-board").getAttribute("data-gl-geometries"));
  }
  console.log("GPU geometries by level", counts);
  for (const n of Object.values(counts)) expect(n).toBeLessThan(140);
  await table.roll(6);
  await expect.poll(async () => (await boardTokens(phone.page)).filter((t) => t.state === "movable").length).toBeGreaterThan(1);
  const adda = `${phone.id}:0`;
  await phone.page.evaluate(() => window.scrollTo(0, 0)); // the quality radios scrolled the phone's page
  await pickToken3d(phone, adda);
  await expect.poll(async () => (await characters(phone.page)).find((c) => c.key === adda)!.state, { message: "selected after the quality changes" }).toBe("selected");
  await pickToken3d(phone, adda);
  await expect.poll(async () => (await table.state()).game!.players.find((p) => p.id === phone.id)!.tokens[0]!.step).toBe(0);
  table.moves++;
  await table.expectInSync();

  // The guest (2.5D, mouse) sees the same characters; losing WebGL falls back to the 2D board with pawns, and play goes on.
  await expectBoard3d(wide.page);
  await allReady(wide.page);
  await wide.page.evaluate(() => {
    const c = document.querySelector("canvas[data-board-gl]") as HTMLCanvasElement;
    (c.getContext("webgl2")!.getExtension("WEBGL_lose_context") as { loseContext: () => void }).loseContext();
  });
  await expect(wide.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await expect(wide.page.getByTestId("characters-prototype")).toHaveCount(0);
  await table.act(1, (legal) => legal[0]!.tokenId);
  await table.expectInSync();
  noErrors([phone, wide]);
  await close([phone, wide]);
});
