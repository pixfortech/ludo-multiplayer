// The sixteen Kolkata people, checked in real browsers through what each board
// reports for every token: which character it is, its status (waiting, loading,
// ready, failed and why), whether the person replaced the pawn, its team
// colour, its clips and what it is doing. A pawn standing in is never counted
// as a person.
//  - a four-player game: all sixteen load and stand on the board in 2.5D and
//    3D, each team in its colour, doing its base routine; a six activates the
//    right person; camera and quality changes and a refresh never leave pawns
//    in their place; the 2D board says it uses pawns;
//  - a character file that cannot load: reported with the actual error, the
//    game stays playable, the other team still loads, and a retry brings the
//    person back.
import { expect, test, type Page } from "@playwright/test";
import { expectBoard3d } from "../support/board3d";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible, type Player } from "../support/game";

const TEAMS: Record<number, string[]> = {
  0: ["adda", "tea", "newspaper", "exercise"],
  1: ["dida", "rickshaw", "student", "footballer"],
  2: ["kaku", "didi", "professor", "yoga"],
  3: ["kobi", "boudi", "dokandar", "kishore"],
};
const BASE_CLIPS = ["talk", "listen", "drink", "read", "look_around", "stretch", "exercise", "idle"];

const noErrors = (players: Player[]) => {
  for (const p of players) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
};

interface Person {
  key: string;
  character: string | null;
  status: string | null;
  error: string | null;
  ready: boolean;
  team: string | null;
  level: string | null;
  clips: number;
  clip: string | null;
  state: string | null;
  step: string;
}

function people(page: Page): Promise<Person[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].map((el) => ({
      key: el.dataset.key!,
      character: el.dataset.character ?? null,
      status: el.dataset.characterStatus ?? null,
      error: el.dataset.characterError ?? null,
      ready: el.dataset.characterReady === "true",
      team: el.dataset.characterTeam ?? null,
      level: el.dataset.characterLevel ?? null,
      clips: (el.dataset.characterClips ?? "").split(" ").filter(Boolean).length,
      clip: el.dataset.characterClip ?? null,
      state: el.dataset.characterState ?? null,
      step: el.dataset.step!,
    })),
  );
}

/** Every person on the board at this level: ready (status) and drawn in place of the pawn (mirror). */
async function allOnBoard(page: Page, count: number, level?: string) {
  await expect
    .poll(async () => (await people(page)).filter((p) => p.status === "ready" && p.ready && (!level || p.level === level)).length, { message: `${count} people on the board${level ? ` at ${level}` : ""}`, timeout: 180_000 })
    .toBe(count);
  await expect(visible(page.getByTestId("character-status"))).toHaveText(`All ${count} characters are on the board.`);
}

test("four Kolkata teams: all sixteen people load and stand on the board in 2.5D and 3D, in their team colours, doing their routines; sixes, cameras, quality and refreshes never leave pawns in their place", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const asha = await openPlayer(browser, "Asha", "desktop", { board: "2.5d", quality: "medium" });
  const bina = await openPlayer(browser, "Bina", "desktop", { board: "3d", quality: "low" });
  const chandan = await openPlayer(browser, "Chandan", "phone", { board: "2d" });
  const dev = await openPlayer(browser, "Dev", "phone", { board: "2d" });
  const players = [asha, bina, chandan, dev];
  const code = await createRoom(asha, { players: 4, city: "Kolkata" });
  for (const p of [bina, chandan, dev]) await joinRoom(p, code);
  await startGame(asha, players);
  // Four pages building the city and sixteen characters at once: a software renderer (the Windows runner) can take
  // longer than the default 20 s to show the first state.
  const table = await seatTable(code, players, { syncTimeout: 60_000 });
  const seatOf = Object.fromEntries((await table.state()).game!.players.map((p) => [p.id, p.seat]));
  await expectBoard3d(asha.page, "2.5d");
  await expectBoard3d(bina.page, "3d");

  for (const p of [asha, bina]) {
    await allOnBoard(p.page, 16);
    const cast = await people(p.page);
    // 1. Sixteen identities, the catalogue's four per seat, in token order.
    for (const player of players) {
      const own = cast.filter((c) => c.key.startsWith(`${player.id}:`)).sort((x, y) => x.key.localeCompare(y.key));
      expect(own.map((c) => c.character), `${p.name}: ${player.name}'s four people`).toEqual(TEAMS[seatOf[player.id]!]);
    }
    expect(new Set(cast.map((c) => c.character)).size).toBe(16);
    // 2-3. Every file loaded and drawn as a skinned person with its clips (no status but "ready", no pawn standing in).
    for (const c of cast) {
      expect(c.status, `${c.character}`).toBe("ready");
      expect(c.ready, `${c.character} drawn in place of its pawn`).toBe(true);
      expect(c.clips, `${c.character}: its clips`).toBe(15);
      expect(c.error).toBeNull();
    }
    // 4. Each team wears its own colour: one per seat, four different.
    const colours = players.map((player) => new Set(cast.filter((c) => c.key.startsWith(`${player.id}:`)).map((c) => c.team)));
    for (const s of colours) expect(s.size).toBe(1);
    expect(new Set(colours.map((s) => [...s][0])).size).toBe(4);
  }

  // 5. Their base routines: over a few seconds the people in base talk, listen, drink tea, read, stretch...
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    for (const c of await people(asha.page)) if (c.clip && c.step === "base") seen.add(c.clip);
    await asha.page.waitForTimeout(700);
  }
  expect([...seen].every((clip) => BASE_CLIPS.includes(clip)), `routine clips: ${[...seen].join(" ")}`).toBe(true);
  expect(seen.size, `several activities at once: ${[...seen].join(" ")}`).toBeGreaterThanOrEqual(3);

  // 6. A six activates the roller's people; the chosen one leaves the base (a person, not a pawn) and walks.
  const roller = table.player((await table.state()).game!.currentPlayerId);
  await table.roll(6);
  await expect
    .poll(async () => (await people(asha.page)).filter((c) => c.key.startsWith(`${roller.id}:`) && (c.state === "selectable" || c.state === "cheering" || c.state === "noticing")).length, { message: "the roller's team is active" })
    .toBe(4);
  await table.move(0);
  await expect.poll(async () => (await people(asha.page)).find((c) => c.key === `${roller.id}:0`)!.step).toBe("0");
  const mover = (await people(asha.page)).find((c) => c.key === `${roller.id}:0`)!;
  expect(mover).toMatchObject({ status: "ready", ready: true });
  await table.act(5); // the bonus roll: a walk
  await table.expectInSync();

  // 8. Cameras: Bina's overview, follow, a free orbit. The people stay people.
  for (const button of ["Follow token", "Overview"]) {
    await visible(bina.page.getByRole("button", { name: button })).click();
    await bina.page.waitForTimeout(1500);
    await allOnBoard(bina.page, 16);
  }
  // 9. Quality: Asha goes Low then High; each level loads all sixteen again; none is lost.
  for (const level of ["Low", "High"] as const) {
    await visible(asha.page.getByRole("radio", { name: level })).click();
    await expect(asha.page.getByTestId("game-board")).toHaveAttribute("data-quality", level.toLowerCase());
    await allOnBoard(asha.page, 16, level.toLowerCase());
  }
  // 10. A refresh: the people come back where the server has them.
  await asha.page.reload();
  await expectBoard3d(asha.page, "2.5d");
  await allOnBoard(asha.page, 16, "high");
  await table.expectInSync();
  // The 2D board keeps pawns, and says so.
  await expect(visible(chandan.page.getByTestId("pawn-notice"))).toContainText("The 2D board uses pawns");
  noErrors(players);
  for (const p of players) await p.context.close();
});

test("a character file that cannot load is reported with its error, the game stays playable and the other team still loads, and a retry brings the person back", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const aman = await openPlayer(browser, "Aman", "desktop", { board: "2.5d", quality: "low" });
  // The first person of the first team cannot be fetched (as a missing file or a broken network would).
  let broken = true;
  await aman.context.route(/\/characters\/adda\.\w+\.glb$/, (route) => (broken ? route.fulfill({ status: 404, body: "missing" }) : route.continue()));
  const ben = await openPlayer(browser, "Ben", "phone", { board: "2d" });
  const code = await createRoom(aman, { players: 2, city: "Kolkata" });
  await joinRoom(ben, code);
  await startGame(aman, [aman, ben]);
  const table = await seatTable(code, [aman, ben]);
  await expectBoard3d(aman.page, "2.5d");
  const adda = `${aman.id}:0`;

  await expect.poll(async () => (await people(aman.page)).find((c) => c.key === adda)!.status, { timeout: 120_000 }).toBe("failed");
  const failed = (await people(aman.page)).find((c) => c.key === adda)!;
  expect(failed.ready, "not counted as a person").toBe(false);
  expect(failed.error, "the actual error").toMatch(/404/);
  // The other seven still load (the failure does not stall the queue), and the screen says exactly what is missing.
  await expect.poll(async () => (await people(aman.page)).filter((c) => c.status === "ready" && c.ready).length, { timeout: 180_000 }).toBe(7);
  const status = visible(aman.page.getByTestId("character-status"));
  await expect(status).toHaveAttribute("data-failed", "true");
  await expect(status).toContainText("1 of 8 characters could not load (adda)");
  await expect(status).toContainText("404");
  // The game goes on with a pawn in her place.
  await table.act(6, () => 0);
  await table.act(4);
  await table.expectInSync();
  expect(aman.errors.filter((e) => !/404|Failed to load resource/.test(e)), "no other errors").toEqual([]);

  // The file is back: a retry brings her in.
  broken = false;
  await status.getByRole("button", { name: "Retry" }).click();
  await expect.poll(async () => (await people(aman.page)).find((c) => c.key === adda)!, { timeout: 120_000 }).toMatchObject({ status: "ready", ready: true, error: null });
  await allOnBoard(aman.page, 8);
  await table.expectInSync();
  for (const p of [aman, ben]) await p.context.close();
});
