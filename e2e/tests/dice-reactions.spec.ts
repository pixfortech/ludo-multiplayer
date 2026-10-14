// C.3C.1: the 3D die and the characters' reactions to game events, in real
// browsers against the real server, in Kolkata rooms (both teams are people).
// The board reports what it shows through hidden mirrors:
//  - the die: the value its actual orientation shows on top, its state (rest,
//    lift, throw, toss), the base it is in and where it is on screen;
//  - each token's character: its presentation state and clip;
//  - the presentation log: the die thrown and landed, the characters' cues,
//    token moves and the victory screen, in the order they were shown.
// Covered here:
//  - the die shows the server's value, before anything moves; a double click
//    is one roll; a six: the team reacts, every legal character becomes
//    selectable, the chosen one waves and leaves only after the server has
//    accepted the move, the others go back to what they were doing; a single
//    legal move plays by itself; touch picks on a phone in 3D;
//  - a capture in order (arrival, the capture, the attacker's cheer, the
//    victim's dismay and walk back to its own base slot, the bonus); a home
//    entry and its counter; the victory screen only after the winning move
//    and the team's celebration;
//  - reduced motion (the die is simply there, no reactions), switching views
//    and quality with a choice open (no replayed throw), a refresh mid-move
//    (nothing replays), Low quality, GPU objects and an idle board at rest.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { boardCells, boardTokens, expectBoard3d, pickToken3d } from "../support/board3d";
import { queueDice } from "../support/control";
import { createRoom, expectNoDuplicates, expectResults, joinRoom, openPlayer, playToEnd, playUntil, seatTable, startGame, visible, type BoardView, type Device, type Player } from "../support/game";
import { readTimeline, startTimeline } from "../support/timeline";

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};
const close = async (players: Player[]) => {
  for (const p of players) await p.context.close();
};

/** The win cue's length (presentation.ts CUE_MS.win): the victory screen waits for the team's celebration. */
const WIN_MS = 3200;

async function kolkata(host: { name: string; device: Device; board: BoardView; quality?: "low"; reduced?: boolean }, guest: { name: string; device: Device; board: BoardView; reduced?: boolean }, browser: Browser) {
  const aman = await openPlayer(browser, host.name, host.device, { board: host.board, reducedMotion: host.reduced ?? false, ...(host.quality ? { quality: host.quality } : {}) });
  const ben = await openPlayer(browser, guest.name, guest.device, { board: guest.board, reducedMotion: guest.reduced ?? false });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  return { aman, ben, table };
}

interface CharacterView {
  key: string;
  state: string | null;
  clip: string | null;
  ready: boolean;
  step: string;
}

function characters(page: Page): Promise<CharacterView[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].map((el) => ({
      key: el.dataset.key!,
      state: el.dataset.characterState ?? null,
      clip: el.dataset.characterClip ?? null,
      ready: el.dataset.characterReady === "true",
      step: el.dataset.step!,
    })),
  );
}

async function allReady(page: Page, count = 8) {
  await expect.poll(async () => (await characters(page)).filter((c) => c.ready).length, { message: "the characters have loaded", timeout: 120_000 }).toBe(count);
}

/** Records the page's character states, the 3D die's states and values (every change, with a timestamp). */
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __states: { t: number; key: string; state: string; clip: string }[]; __die: { t: number; state: string; value: string; seat: string }[]; __watch?: MutationObserver };
    w.__watch?.disconnect();
    w.__states = [];
    w.__die = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (r.attributeName === "data-character-state") w.__states.push({ t: performance.now(), key: el.dataset.key!, state: el.dataset.characterState!, clip: el.dataset.characterClip ?? "" });
        if (el.dataset.testid === "die-3d") {
          const last = w.__die[w.__die.length - 1];
          const entry = { t: performance.now(), state: el.dataset.state ?? "", value: el.dataset.value ?? "", seat: el.dataset.seat ?? "" };
          if (!last || last.state !== entry.state || last.value !== entry.value || last.seat !== entry.seat) w.__die.push(entry);
        }
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-character-state", "data-state", "data-value", "data-seat"] });
    w.__watch = observer;
  });
}
const states = (page: Page) => page.evaluate(() => (window as unknown as { __states: { t: number; key: string; state: string; clip: string }[] }).__states);
const dieLog = (page: Page) => page.evaluate(() => (window as unknown as { __die: { t: number; state: string; value: string; seat: string }[] }).__die);

/** The 3D die as its mirror reports it (null when there is no 3D board). */
function die3d(page: Page): Promise<{ value: string; state: string; seat: string; cx: number; cy: number } | null> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="die-3d"]');
    if (!el?.dataset.state) return null;
    return { value: el.dataset.value!, state: el.dataset.state, seat: el.dataset.seat!, cx: Number(el.dataset.cx), cy: Number(el.dataset.cy) };
  });
}

/** The value on the visible tray die ("rolling" while it is in the air). */
const trayDie = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="die"]')].find((d) => d.getBoundingClientRect().width > 0)?.dataset.value ?? null);

interface Logged {
  n: number;
  t: number;
  type: string;
  kind: string | undefined;
  player: string | undefined;
  value: string | undefined;
  tokens: string | undefined;
  to: string | undefined;
}

/** The page's presentation log (the latest 60 events), oldest first. */
function presentation(page: Page): Promise<Logged[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="presentation-log"] li')].map((li) => ({
      n: Number(li.dataset.n),
      t: Number(li.dataset.t),
      type: li.dataset.type!,
      kind: li.dataset.kind,
      player: li.dataset.player,
      value: li.dataset.value,
      tokens: li.dataset.tokens,
      to: li.dataset.to,
    })),
  );
}
const lastN = async (page: Page) => (await presentation(page)).at(-1)?.n ?? 0;
const since = async (page: Page, n: number) => (await presentation(page)).filter((e) => e.n > n);
const indexOf = (log: Logged[], match: (e: Logged) => boolean, what: string) => {
  const i = log.findIndex(match);
  expect(i, `${what} is in the presentation log: ${JSON.stringify(log.map((e) => [e.type, e.kind ?? e.value ?? e.to ?? ""]))}`).toBeGreaterThanOrEqual(0);
  return i;
};

/** States in which a character is reacting to an event (not what it does at rest or on its turn). */
const REACTING = new Set(["cheering", "noticing", "upset"]);

test("the 3D die shows the server's value before anything moves; one roll per double click; a six: the team reacts, every legal character becomes selectable, the chosen one leaves after the server accepts; a single legal move plays itself; touch picks in 3D", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const { aman, ben, table } = await kolkata({ name: "Aman", device: "wide", board: "2.5d" }, { name: "Ben", device: "phone", board: "3d" }, browser);
  const A = (t: number) => `${aman.id}:${t}`;
  const B = (t: number) => `${ben.id}:${t}`;
  await expectBoard3d(aman.page);
  await expectBoard3d(ben.page, "3d");
  await allReady(aman.page);
  await allReady(ben.page);
  const seats = Object.fromEntries((await table.state()).game!.players.map((p) => [p.id, String(p.seat)]));
  // Before any roll the die waits in the first player's base.
  await expect.poll(() => die3d(aman.page)).toMatchObject({ state: "rest", seat: seats[aman.id] });
  for (const p of [aman, ben]) {
    await watch(p.page);
    await startTimeline(p.page);
  }
  const mark = { aman: await lastN(aman.page), ben: await lastN(ben.page) };

  // A double click on Roll: one request, one roll (the second click lands while the first is on its way).
  await queueDice(6);
  const button = (await visible(aman.page.getByRole("button", { name: "Roll dice" })).boundingBox())!;
  await aman.page.mouse.dblclick(button.x + button.width / 2, button.y + button.height / 2);
  table.rolls++;
  await expect.poll(async () => (await table.state()).game!.lastRoll).toEqual({ playerId: aman.id, value: 6 });
  // Both boards' dice come to rest on the server's 6 (lifted into Aman's hand first on his own screen).
  for (const p of [aman, ben]) await expect.poll(() => die3d(p.page), { message: `${p.name}'s die rests on 6` }).toMatchObject({ state: "rest", value: "6", seat: seats[aman.id] });
  expect(aman.sent.roll, "one roll request for a double click").toBe(1);
  const amanDie = await dieLog(aman.page);
  // Its states are reported on drawn frames, and a software renderer draws one every quarter-second or so: the
  // short lift (while the request is on its way) may not be drawn. It moved, and a lift comes before the throw.
  const amanStates = amanDie.map((d) => d.state);
  expect(amanStates.some((st) => st === "lift" || st === "throw"), `the die moved: ${amanStates.join(" ")}`).toBe(true);
  if (amanStates.includes("lift") && amanStates.includes("throw")) expect(amanStates.indexOf("lift")).toBeLessThan(amanStates.indexOf("throw"));
  // Ben's page may draw no frame mid-air on a slow machine (the throw is time-based): his presentation log below
  // shows the throw and the landing instead.
  expect(await trayDie(aman.page), "the tray shows the value too").toBe("6");
  // The presentation: the throw, the landing on the server's value, then the six.
  for (const [p, m] of [[aman, mark.aman], [ben, mark.ben]] as const) {
    const log = await since(p.page, m);
    const thrown = indexOf(log, (e) => e.type === "die-throw" && e.player === aman.id, `${p.name}: the throw`);
    const landed = indexOf(log, (e) => e.type === "die-land" && e.value === "6", `${p.name}: the landing on 6`);
    const six = indexOf(log, (e) => e.type === "cue" && e.kind === "six" && e.player === aman.id, `${p.name}: the six`);
    expect(thrown).toBeLessThan(landed);
    expect(landed).toBeLessThan(six);
    expect(log.filter((e) => e.type === "die-throw"), "thrown once").toHaveLength(1);
    // The 3D die comes to rest on the value as it is announced. Its mirror reports on drawn frames, which a
    // software renderer with three pages draws up to a second or more apart: allow for the next frame.
    const rest = (await dieLog(p.page)).find((d) => d.state === "rest" && d.value === "6")!;
    expect(rest.t, `${p.name}: at rest on 6 by the reveal (within a frame)`).toBeLessThan(log[landed]!.t + 2000);
  }

  await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.key.startsWith(`${aman.id}:`) && t.state === "movable").length).toBe(4);
  await expect.poll(async () => (await characters(aman.page)).filter((c) => c.key.startsWith(`${aman.id}:`) && c.state === "selectable").length, { message: "all four selectable after their reaction" }).toBe(4);
  // The team reacts to the six (a cheer, a jump, a wave or a look), then every one of them can be chosen. The six's
  // cue is always presented; the reactions are reported on drawn frames, so they are required whenever the page
  // drew frames during the 1.4 s reaction (a busy software renderer may draw none).
  const six = (await since(aman.page, mark.aman)).find((e) => e.type === "cue" && e.kind === "six" && e.player === aman.id)!;
  const reacted = (await states(aman.page)).filter((s) => s.key.startsWith(`${aman.id}:`) && REACTING.has(s.state)).map((s) => s.key).filter((k, i, a) => a.indexOf(k) === i);
  const drawnDuringReaction = (await states(aman.page)).filter((s) => s.t >= six.t && s.t <= six.t + 1400).length;
  if (drawnDuringReaction > 0) expect(reacted.length, "the team reacts to the six").toBeGreaterThanOrEqual(1);
  else console.log("no frame drawn during the six's reaction");
  // Reacting changed nothing: the server is where the roll left it, nothing was sent, the tray offers the server's four moves.
  const rolled = await table.state();
  expect(rolled.game!.turn.legalMoves).toHaveLength(4);
  await aman.page.waitForTimeout(800);
  expect((await table.state()).game!.stateVersion, "no state change from the reactions").toBe(rolled.game!.stateVersion);
  expect(aman.sent.move).toBe(0);
  await expect(visible(aman.page.getByTestId("move-tray")).getByRole("option")).toHaveCount(4);

  // Aman picks the tea-seller (mouse, 2.5D): she reacts (a wave while the move is on its way, if a frame is drawn
  // before the server answers; an excited start to her departure), and leaves the base only once the server has
  // the move.
  await pickToken3d(aman, A(1));
  table.moves++;
  await expect.poll(async () => (await table.state()).game!.players.find((p) => p.id === aman.id)!.tokens[1]!.step).toBe(0);
  await expect.poll(async () => (await characters(aman.page)).find((c) => c.key === A(1))!.step).toBe("0");
  const teaStates = (await states(aman.page)).filter((s) => s.key === A(1));
  // The move is presented only from the server's state (the token-move event); her departure as drawn
  // (excited, then walking out) follows it. A slow renderer may draw no frame during the 1.5 s departure, so
  // the drawn states are checked when there are any.
  const moved = (await since(aman.page, mark.aman)).find((e) => e.type === "token-move" && e.tokens === A(1));
  expect(moved, "the move came from the server").toMatchObject({ to: "0" });
  const leftAt = teaStates.find((s) => ["excited", "leavingBase", "walking"].includes(s.state))?.t;
  const selectedAt = teaStates.find((s) => s.state === "selected")?.t;
  if (leftAt !== undefined) {
    expect(leftAt, "leaves only after the server's move is shown").toBeGreaterThanOrEqual(moved!.t);
    if (selectedAt !== undefined) expect(selectedAt, "a wave when picked comes before she leaves").toBeLessThan(leftAt);
  } else console.log(`no frame drawn during the departure (states: ${teaStates.map((s) => s.state).join(" ")})`);
  // The others go back to what they were doing.
  await expect
    .poll(async () => (await characters(aman.page)).filter((c) => [A(0), A(2), A(3)].includes(c.key) && ["selectable", "selected", ...REACTING].includes(c.state ?? "")).length, { message: "the others back to their routine" })
    .toBe(0);
  await table.expectInSync();

  // The bonus roll: a 3 with one token out is the only legal move, so it plays by itself, after the die shows it.
  const markAuto = await lastN(aman.page);
  await startTimeline(aman.page);
  await table.roll(3);
  await expect.poll(async () => (await table.state()).game!.players.find((p) => p.id === aman.id)!.tokens[1]!.step, { message: "auto-moved" }).toBe(3);
  expect(aman.sent.move, "nothing was chosen").toBe(1);
  await table.expectInSync();
  const auto = await since(aman.page, markAuto);
  expect(indexOf(auto, (e) => e.type === "die-land" && e.value === "3", "the landing on 3")).toBeLessThan(indexOf(auto, (e) => e.type === "token-move" && e.tokens === A(1) && e.to === "3", "the auto-move"));
  const timeline = await readTimeline(aman.page);
  const shown = timeline.find((e) => e.target === "die" && e.value === "3")!;
  const firstHop = timeline.find((e) => e.target === A(1))!;
  expect(shown.t, "the value shows before the token moves").toBeLessThan(firstHop.t);
  const rest3 = (await dieLog(aman.page)).find((d) => d.state === "rest" && d.value === "3" && d.t > (auto[0]?.t ?? 0));
  expect(rest3, "the 3D die rests on 3").toBeDefined();
  expect(rest3!.t, "before the token moves").toBeLessThan(firstHop.t);
  // The turn has passed: the die is tossed to Ben's base on both screens.
  for (const p of [aman, ben]) await expect.poll(() => die3d(p.page), { message: `${p.name}: the die goes to Ben` }).toMatchObject({ state: "rest", seat: seats[ben.id], value: "3" });

  // Ben on his phone in 3D (touch): a tap on the die rolls; a tap selects his character, a second tap plays.
  await table.roll(6);
  await expect.poll(() => die3d(ben.page)).toMatchObject({ state: "rest", value: "6", seat: seats[ben.id] });
  await expect.poll(async () => (await boardTokens(ben.page)).filter((t) => t.key.startsWith(`${ben.id}:`) && t.state === "movable").length).toBe(4);
  await pickToken3d(ben, B(2));
  await expect.poll(async () => (await characters(ben.page)).find((c) => c.key === B(2))!.state, { message: "selected on the first tap" }).toBe("selected");
  expect(ben.sent.move).toBe(0);
  await pickToken3d(ben, B(2));
  table.moves++;
  await expect.poll(async () => (await table.state()).game!.players.find((p) => p.id === ben.id)!.tokens[2]!.step).toBe(0);
  const snap = await table.expectInSync();
  expectNoDuplicates(table, snap);
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("a capture plays in order and sends the victim to its own base; a home entry moves the counter when the character arrives; the victory screen comes after the winning move and the team's celebration", async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  // Aman watches in 2.5D (Low); Ben races on the 2D board on his phone.
  const { aman, ben, table } = await kolkata({ name: "Aman", device: "wide", board: "2.5d", quality: "low" }, { name: "Ben", device: "phone", board: "2d" }, browser);
  const A = (t: number) => `${aman.id}:${t}`;
  const B = (t: number) => `${ben.id}:${t}`;
  await expectBoard3d(aman.page);
  await allReady(aman.page);
  // The storyteller walks to step 28 (6, 6, 5 then 6, 6, 5): Ben's start is two cells behind.
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  await table.act(5);
  await table.act(1); // Ben: nothing out, the turn passes
  await table.act(6, () => 0);
  await table.act(6, () => 0);
  await table.act(5);
  await table.act(6, () => 0); // Ben opens on his start
  await watch(aman.page);
  const mark = await lastN(aman.page);

  // Ben rolls 2 and lands on the storyteller.
  const captured = await table.act(2);
  expect(captured.history.filter((e) => e.type === "capture")).toHaveLength(1);
  await expect.poll(async () => (await characters(aman.page)).find((c) => c.key === A(0))!.step, { timeout: 20_000 }).toBe("base");
  // The bonus cue is the last of the sequence (it can come a little after the victim is home on a busy page).
  await expect
    .poll(async () => (await since(aman.page, mark)).some((e) => e.type === "cue" && e.kind === "bonus" && e.player === ben.id), { message: "the bonus cue", timeout: 15_000 })
    .toBe(true);
  const log = await since(aman.page, mark);
  const landed = indexOf(log, (e) => e.type === "die-land" && e.player === ben.id && e.value === "2", "Ben's 2");
  const arrive = indexOf(log, (e) => e.type === "token-move" && e.tokens === B(0) && e.to === "2", "Ben's move");
  const capture = indexOf(log, (e) => e.type === "cue" && e.kind === "capture" && e.player === ben.id, "the capture");
  const bonus = indexOf(log, (e) => e.type === "cue" && e.kind === "bonus" && e.player === ben.id, "the bonus");
  expect(landed).toBeLessThan(arrive);
  expect(arrive).toBeLessThan(capture);
  expect(capture).toBeLessThan(bonus);
  expect(log[capture]!.tokens!.split(" "), "the attacker is named").toContain(B(0));
  // The attacker cheers; the victim is dismayed and walks back; then everyone resumes.
  const after = (await states(aman.page)).filter((s) => s.t >= log[capture]!.t - 50);
  expect(after.filter((s) => s.key === B(0)).map((s) => s.state), "the attacker reacts positively").toContain("cheering");
  expect(after.filter((s) => s.key === B(0) && s.state === "cheering").map((s) => s.clip)).toEqual(expect.arrayContaining([expect.stringMatching(/cheer|excited|wave/)]));
  const victim = (await states(aman.page)).filter((s) => s.key === A(0)).map((s) => s.state);
  expect(victim, "the victim: dismay, then back to base").toEqual(expect.arrayContaining(["captured", "returningToBase"]));
  // Its own base slot: in the Crimson corner (top left), not on the track and not in Ben's base.
  const cells = await boardCells(aman.page);
  const at = (row: number, col: number) => cells.find((c) => c.row === row && c.col === col && c.kind !== "star")!;
  const t = (await boardTokens(aman.page)).find((x) => x.key === A(0))!;
  expect(t.x, "left of the track's column").toBeLessThan(at(6, 5).x);
  expect(t.y, "above the track's row").toBeLessThan(at(5, 6).y);
  await expect
    .poll(async () => (await characters(aman.page)).filter((c) => ["cheering", "upset", "captured", "returningToBase"].includes(c.state ?? "")).length, { message: "everyone resumes", timeout: 15_000 })
    .toBe(0);
  await table.expectInSync();

  // Ben's runner home: the counter moves only once his character has arrived on the home cell.
  await startTimeline(aman.page);
  const markHome = await lastN(aman.page);
  const home = await playUntil(table, [ben.id], (s) => s.game!.players.find((p) => p.id === ben.id)!.tokens.some((x) => x.step === 56));
  const runner = home.game!.players.find((p) => p.id === ben.id)!.tokens.find((x) => x.step === 56)!;
  await expect.poll(async () => (await readTimeline(aman.page)).some((e) => e.target === `home:${ben.id}` && e.value === "1"), { message: "the home counter" }).toBe(true);
  const timeline = await readTimeline(aman.page);
  const arrived = timeline.find((e) => e.target === B(runner.id) && e.value === "56")!;
  const counted = timeline.find((e) => e.target === `home:${ben.id}` && e.value === "1")!;
  expect(arrived, "the runner reached the home cell").toBeDefined();
  expect(counted.t, "counted when he arrives, not before").toBeGreaterThanOrEqual(arrived.t);
  const homeLog = await since(aman.page, markHome);
  expect(indexOf(homeLog, (e) => e.type === "token-move" && e.tokens === B(runner.id) && e.to === "56", "the move home")).toBeLessThan(indexOf(homeLog, (e) => e.type === "cue" && e.kind === "home" && e.player === ben.id, "the home cue"));

  // To the end. The winning move is shown, the team celebrates, and only then does the victory screen open.
  // The log keeps the latest 60 events: mark it for the last token's run only.
  const fin = await playUntil(table, [ben.id], (s) => s.game!.players.find((p) => p.id === ben.id)!.tokens.filter((x) => x.step === 56).length === 3);
  expect(fin.game!.phase).toBe("playing");
  const markWin = await lastN(aman.page);
  await watch(aman.page);
  const end = await playToEnd(table, [ben.id]);
  await expectResults(table, end);
  const winLog = await since(aman.page, markWin);
  const lastMove = indexOf(winLog, (e) => e.type === "token-move" && e.player === ben.id && e.to === "56", "the winning move");
  const win = indexOf(winLog, (e) => e.type === "cue" && e.kind === "win" && e.player === ben.id, "the win");
  const screen = indexOf(winLog, (e) => e.type === "victory-screen", "the victory screen");
  expect(lastMove).toBeLessThan(win);
  expect(win).toBeLessThan(screen);
  expect(winLog[screen]!.t - winLog[win]!.t, "the celebration plays before the victory screen").toBeGreaterThanOrEqual(WIN_MS - 150);
  // Ben's team celebrated, and Aman's team joined in (a wave).
  const celebrated = (await states(aman.page)).filter((s) => s.t >= winLog[win]!.t - 50 && s.state === "cheering");
  expect(celebrated.some((s) => s.key.startsWith(`${ben.id}:`)), "the winning team celebrates").toBe(true);
  expect(celebrated.some((s) => s.key.startsWith(`${aman.id}:`)), "the others join in").toBe(true);
  expectNoDuplicates(table, end);
  noErrors([aman, ben]);
  await close([aman, ben]);
});

test("reduced motion, switching views and quality with a choice open, a refresh mid-move: the die never replays a throw, nothing reacts twice, GPU objects stay bounded and the board rests", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  // Aman: 2.5D at Low with full motion. Ben: a phone in 3D with reduced motion.
  const { aman, ben, table } = await kolkata({ name: "Aman", device: "wide", board: "2.5d", quality: "low" }, { name: "Ben", device: "phone", board: "3d", reduced: true }, browser);
  const A = (t: number) => `${aman.id}:${t}`;
  await expectBoard3d(aman.page);
  await expectBoard3d(ben.page, "3d");
  await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-quality", "low");
  await allReady(aman.page);
  await allReady(ben.page);
  await watch(ben.page);
  const markBen = await lastN(ben.page);

  // Aman rolls a six and switches to 3D at once, while his die is in the air: the new board's die carries the
  // throw on and lands on the server's 6. Ben (reduced motion): his die is simply on the value; no throw, no reactions.
  await table.roll(6);
  await visible(aman.page.getByRole("radio", { name: "3D board (preview)" })).click();
  await expectBoard3d(aman.page, "3d");
  await expect.poll(() => die3d(aman.page), { message: "remounted mid-throw, the die still lands on 6" }).toMatchObject({ state: "rest", value: "6" });
  await visible(aman.page.getByRole("radio", { name: "2.5D board" })).click();
  await expectBoard3d(aman.page);
  await expect.poll(() => die3d(ben.page)).toMatchObject({ state: "rest", value: "6" });
  await expect.poll(async () => (await boardTokens(aman.page)).filter((t) => t.state === "movable").length).toBe(4);

  // With the choice open: 2D, 3D, back to 2.5D, then Medium and back to Low. The die is on its 6 in each
  // view, never thrown again; nothing is sent, the choice survives, one canvas at a time.
  await watch(aman.page);
  const mark = await lastN(aman.page);
  const sent = { ...aman.sent };
  const view = (label: string) => visible(aman.page.getByRole("radio", { name: label }));
  const geometries: Record<string, number> = {};
  const gl = async (label: string) => {
    await aman.page.waitForTimeout(1500);
    geometries[label] = Number(await aman.page.getByTestId("game-board").getAttribute("data-gl-geometries"));
  };
  await gl("2.5D Low");
  await view("2D board (lightweight)").click();
  await expect(aman.page.locator('svg[data-testid="game-board"]')).toBeVisible();
  await expect(aman.page.getByTestId("die-3d")).toHaveCount(0);
  expect(await trayDie(aman.page), "the 2D die shows the 6").toBe("6");
  await view("3D board (preview)").click();
  await expectBoard3d(aman.page, "3d");
  await expect.poll(() => die3d(aman.page)).toMatchObject({ state: "rest", value: "6" });
  await view("2.5D board").click();
  await expectBoard3d(aman.page);
  await expect.poll(() => die3d(aman.page)).toMatchObject({ state: "rest", value: "6" });
  for (const level of ["Medium", "Low"] as const) {
    await view(level).click();
    await expect(aman.page.getByTestId("game-board")).toHaveAttribute("data-quality", level.toLowerCase());
    await expectBoard3d(aman.page);
    await expect(aman.page.locator("canvas")).toHaveCount(1);
    await expect
      .poll(() => aman.page.evaluate((l) => document.querySelectorAll(`[data-testid="board-mirror"] li[data-character-ready="true"][data-character-level="${l}"]`).length, level.toLowerCase()), { timeout: 120_000 })
      .toBe(8);
    await expect.poll(() => die3d(aman.page)).toMatchObject({ state: "rest", value: "6" });
    await gl(`2.5D ${level}`);
  }
  console.log("GPU geometries", geometries);
  for (const [label, n] of Object.entries(geometries)) expect(n, `${label}: GPU geometries bounded`).toBeLessThan(140);
  expect(geometries["2.5D Low"]! - 0, "back at Low: nothing carried over").toBeLessThanOrEqual(geometries["2.5D Medium"]! + 2);
  expect((await dieLog(aman.page)).map((d) => d.state), "never thrown again").not.toContain("throw");
  expect((await since(aman.page, mark)).filter((e) => e.type !== "token-move"), "no event replayed by a remount").toEqual([]);
  expect(aman.sent).toEqual(sent);
  await expect(visible(aman.page.getByTestId("move-tray")).getByRole("option")).toHaveCount(4);
  await pickToken3d(aman, A(0));
  table.moves++;
  await expect.poll(async () => (await table.state()).game!.players.find((p) => p.id === aman.id)!.tokens[0]!.step).toBe(0);
  await table.expectInSync();

  // A refresh while he walks his bonus 5: back on his cell, the die on its 5 in Ben's base, nothing replayed.
  await table.roll(5);
  await aman.page.waitForTimeout(700);
  await aman.page.reload();
  await expectBoard3d(aman.page);
  await allReady(aman.page);
  await watch(aman.page);
  await aman.page.waitForTimeout(2500);
  expect(await presentation(aman.page), "a refresh presents nothing").toEqual([]);
  expect((await dieLog(aman.page)).map((d) => d.state)).not.toContain("throw");
  expect((await states(aman.page)).map((s) => s.state), "no character replays a walk or a reaction").not.toEqual(expect.arrayContaining(["walking"]));
  for (const s of await states(aman.page)) expect(REACTING.has(s.state), `${s.key}: ${s.state} after a refresh`).toBe(false);
  const seats = Object.fromEntries((await table.state()).game!.players.map((p) => [p.id, String(p.seat)]));
  await expect.poll(() => die3d(aman.page)).toMatchObject({ state: "rest", value: "5", seat: seats[ben.id] });
  await table.expectInSync();

  // Ben plays with reduced motion (the tray, by touch): his die never moves and nothing reacts on his screen.
  await table.act(6, () => 0);
  await table.act(4);
  expect((await dieLog(ben.page)).map((d) => d.state).filter((s) => s !== "rest"), "reduced motion: the die never moves").toEqual([]);
  expect((await since(ben.page, markBen)).filter((e) => e.type === "cue"), "reduced motion: no reactions").toEqual([]);
  for (const s of await states(ben.page)) expect(REACTING.has(s.state), `${s.key}: ${s.state} with reduced motion`).toBe(false);

  // At rest: the board draws only the characters' slow pulse and the city's capped life (no render loop).
  await table.expectInSync();
  await aman.page.waitForTimeout(3000);
  const f0 = Number(await aman.page.getByTestId("game-board").getAttribute("data-frames"));
  await aman.page.waitForTimeout(4000);
  const frames = Number(await aman.page.getByTestId("game-board").getAttribute("data-frames")) - f0;
  console.log(`board frames in 4 s at rest: ${frames}`);
  expect(frames, "frames drawn in 4 s at rest").toBeLessThan(4 * 22);
  expect((await die3d(aman.page))!.state).toBe("rest");
  const snap = await table.expectInSync();
  expectNoDuplicates(table, snap);
  noErrors([aman, ben]);
  await close([aman, ben]);
});
