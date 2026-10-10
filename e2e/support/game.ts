// Playing real games through the real UI. Every roll and move is a click or
// tap in a player's browser; the server's dice source is queued (test seam)
// only so games reach their end deterministically. After every action, every
// player's board must show exactly the server's committed state.

import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { GameStateView, LegalMoveView } from "@ludo/shared-types";
import { queueDice, serverState, type ServerSnapshot } from "./control";

export type Device = "desktop" | "wide" | "tablet" | "phone";

const DEVICES: Record<Device, { viewport: { width: number; height: number }; touch: boolean }> = {
  wide: { viewport: { width: 1920, height: 1080 }, touch: false },
  desktop: { viewport: { width: 1366, height: 768 }, touch: false },
  tablet: { viewport: { width: 1024, height: 768 }, touch: true },
  phone: { viewport: { width: 390, height: 844 }, touch: true },
};

export interface Player {
  name: string;
  device: Device;
  touch: boolean;
  context: BrowserContext;
  page: Page;
  /** Set once seated (read from the tab's non-secret seat marker). */
  id: string;
  errors: string[];
  /** Gameplay requests this browser actually sent over its WebSocket. */
  sent: { roll: number; move: number };
}

export async function openPlayer(browser: Browser, name: string, device: Device, options: { reducedMotion?: boolean } = {}): Promise<Player> {
  const { viewport, touch } = DEVICES[device];
  // E2E_RECORD_DIR records each player's screen to video (for reviewing animation; off in CI).
  const record = process.env.E2E_RECORD_DIR ? { recordVideo: { dir: `${process.env.E2E_RECORD_DIR}/${name.toLowerCase()}`, size: viewport } } : {};
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: device === "phone", reducedMotion: options.reducedMotion ? "reduce" : "no-preference", ...record });
  const page = await context.newPage();
  const errors: string[] = [];
  const sent = { roll: 0, move: 0 };
  page.on("websocket", (ws) =>
    ws.on("framesent", (frame) => {
      const text = typeof frame.payload === "string" ? frame.payload : "";
      if (/^\d+\["game:roll"/.test(text)) sent.roll++;
      if (/^\d+\["game:move"/.test(text)) sent.move++;
    }),
  );
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return { name, device, touch, context, page, id: "", errors, sent };
}

export const visible = (locator: Locator) => locator.filter({ visible: true }).first();

async function seatId(page: Page): Promise<string> {
  const marker = await page.evaluate(() => sessionStorage.getItem("ludo.tab.v1"));
  if (!marker) throw new Error("no seat marker in this tab");
  return (JSON.parse(marker) as { playerId: string }).playerId;
}

export async function createRoom(host: Player, options: { players: 2 | 3 | 4; autoMove?: boolean; fullRanking?: boolean }): Promise<string> {
  const { page } = host;
  await page.goto("/create");
  await page.getByLabel("Your name").fill(host.name);
  await page.getByRole("radio", { name: String(options.players), exact: true }).click();
  if (options.autoMove === false) await page.getByRole("switch", { name: /Auto-move/ }).click();
  if (options.fullRanking) await page.getByRole("radio", { name: "Full ranking" }).click();
  await visible(page.getByRole("button", { name: "Create room" })).click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  host.id = await seatId(page);
  return page.url().split("/").pop()!;
}

export async function joinRoom(player: Player, code: string): Promise<void> {
  const { page } = player;
  await page.goto(`/join/${code}`);
  await page.getByLabel("Your name").fill(player.name);
  const join = visible(page.getByRole("button", { name: "Join game" }));
  await expect(join).toBeEnabled();
  await join.click();
  await page.waitForURL(new RegExp(`/room/${code}$`));
  player.id = await seatId(page);
}

export async function startGame(host: Player, players: Player[]): Promise<void> {
  await visible(host.page.getByRole("button", { name: `Start game · ${players.length} players` })).click();
  for (const p of players) await expect(p.page.getByTestId("game-board")).toBeVisible();
}

/** token test id → drawn step ("base" or a number), as each page renders it. */
export function readBoard(page: Page): Promise<Record<string, string>> {
  return page.$$eval('[data-testid^="token-"]', (els) => Object.fromEntries(els.map((e) => [(e as HTMLElement).dataset.testid!, (e as HTMLElement).dataset.step!])));
}

export function expectedBoard(game: GameStateView): Record<string, string> {
  return Object.fromEntries(game.players.flatMap((p) => p.tokens.map((t) => [`token-${p.id}:${t.id}`, t.step === null ? "base" : String(t.step)])));
}

export class Table {
  rolls = 0;
  moves = 0;
  /** Players whose network is deliberately down: not expected to be in sync until they return. */
  readonly offline = new Set<Player>();
  constructor(
    readonly code: string,
    readonly players: Player[],
  ) {}

  player(id: string | null): Player {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw new Error(`no browser for player ${id}`);
    return p;
  }

  state(): Promise<ServerSnapshot> {
    return serverState(this.code);
  }

  /** Every page shows the server's committed board, and only the current player can act. */
  async expectInSync(): Promise<ServerSnapshot> {
    const snap = await this.state();
    const game = snap.game!;
    const expected = expectedBoard(game);
    for (const p of this.players) {
      if (this.offline.has(p)) continue;
      await expect.poll(() => readBoard(p.page), { message: `${p.name}'s board matches the server (v${game.stateVersion})`, timeout: 20_000 }).toEqual(expected);
    }
    if (game.phase === "playing" && snap.room.status === "playing" && !this.offline.has(this.player(game.currentPlayerId))) {
      const actor = this.player(game.currentPlayerId);
      const control = game.turn.phase === "awaiting-roll" ? visible(actor.page.getByRole("button", { name: "Roll dice" })) : visible(actor.page.getByTestId("move-tray"));
      await expect(control, `${actor.name} can act`).toBeVisible({ timeout: 20_000 });
      for (const other of this.players) {
        if (other !== actor && !this.offline.has(other)) await expect(other.page.getByRole("button", { name: "Roll dice" }), `${other.name} cannot roll on ${actor.name}'s turn`).toHaveCount(0);
      }
    }
    return snap;
  }

  /** The current player rolls (clicking Roll, or tapping the die on touch); the server draws `value`. */
  async roll(value: number): Promise<ServerSnapshot> {
    const before = await this.state();
    const actor = this.player(before.game!.currentPlayerId);
    await queueDice(value);
    const button = visible(actor.page.getByRole("button", { name: "Roll dice" }));
    if (actor.touch) await button.tap();
    else await button.click();
    this.rolls++;
    await expect.poll(async () => (await this.state()).game!.stateVersion, { message: "the roll commits" }).toBeGreaterThan(before.game!.stateVersion);
    const after = await this.state();
    expect(after.queuedDice, "the server drew the queued die").toBe(0);
    expect(after.game!.lastRoll).toEqual({ playerId: actor.id, value });
    return after;
  }

  /** The current player chooses a token from the move tray (mouse: one click; touch: tap to preview, tap again). */
  async move(tokenId: number): Promise<ServerSnapshot> {
    const before = await this.state();
    const game = before.game!;
    const actor = this.player(game.currentPlayerId);
    expect(game.turn.phase).toBe("awaiting-move");
    expect(game.turn.legalMoves.map((m) => m.tokenId), "the chosen token is one the server allows").toContain(tokenId);
    const tray = visible(actor.page.getByTestId("move-tray"));
    await expect(tray).toBeVisible();
    // The tray lists exactly the server's legal moves, and never a finished token.
    await expect(tray.getByRole("option")).toHaveCount(game.turn.legalMoves.length);
    await expect(actor.page.locator('[data-state="finished"][role="button"]')).toHaveCount(0);
    const entry = tray.getByRole("button", { name: new RegExp(`^Token ${tokenId + 1}:`) });
    if (actor.touch) {
      await entry.tap();
      await expect(actor.page.getByTestId("move-destination"), "the first tap previews the move").toBeVisible();
      expect((await readBoard(actor.page))[`token-${actor.id}:${tokenId}`], "nothing moves before confirming").toBe(stepLabel(game, actor.id, tokenId));
      await tray.getByRole("button", { name: /Tap again to move/ }).tap();
    } else {
      await entry.click();
    }
    this.moves++;
    await expect.poll(async () => (await this.state()).game!.stateVersion, { message: "the move commits" }).toBeGreaterThan(game.stateVersion);
    return this.state();
  }

  /** One full action: roll `value`, then choose `token` if the server asks for a choice. Ends in sync. */
  async act(value: number, token?: (legal: LegalMoveView[], game: GameStateView) => number): Promise<ServerSnapshot> {
    const rolled = await this.roll(value);
    const game = rolled.game!;
    if (game.phase === "playing" && game.turn.phase === "awaiting-move") {
      if (!token) throw new Error(`the server asks for a choice after ${value}, but none was planned: ${JSON.stringify(game.turn.legalMoves)}`);
      await this.move(token(game.turn.legalMoves, game));
    }
    return this.expectInSync();
  }
}

const stepLabel = (game: GameStateView, playerId: string, tokenId: number) => {
  const step = game.players.find((p) => p.id === playerId)!.tokens.find((t) => t.id === tokenId)!.step;
  return step === null ? "base" : String(step);
};

export async function seatTable(code: string, players: Player[]): Promise<Table> {
  const table = new Table(code, players);
  await table.expectInSync();
  return table;
}

/**
 * Picks the next die so the game finishes quickly and deterministically:
 * the first unfinished player in `racers` moves one token at a time (6s for
 * bonus rolls, never a third six, an exact roll to finish); everyone else
 * rolls a 1 with no token out, which the server auto-passes.
 */
export function plan(game: GameStateView, racers: readonly string[]): { value: number; token?: (legal: LegalMoveView[]) => number } {
  const me = game.players.find((p) => p.id === game.currentPlayerId)!;
  const racer = racers.find((id) => !game.players.find((p) => p.id === id)!.finished);
  if (me.id !== racer) return { value: 1 };
  const sixesLeft = game.turn.consecutiveSixes < 2;
  const active = me.tokens.filter((t) => t.step !== null && t.step < 56).sort((a, b) => b.step! - a.step!)[0];
  if (!active) return sixesLeft ? { value: 6, token: (legal) => legal[0]!.tokenId } : { value: 1 };
  const remaining = 56 - active.step!;
  const value = remaining >= 6 ? (sixesLeft ? 6 : 5) : remaining;
  return { value, token: (legal) => (legal.some((m) => m.tokenId === active.id) ? active.id : legal[0]!.tokenId) };
}

/** Plays with the driver until `until` holds for the server's state (or the game ends). */
export async function playUntil(table: Table, racers: readonly string[], until: (snap: ServerSnapshot) => boolean, maxActions = 600): Promise<ServerSnapshot> {
  let snap = await table.state();
  for (let i = 0; i < maxActions && snap.game!.phase === "playing" && !until(snap); i++) {
    const next = plan(snap.game!, racers);
    snap = await table.act(next.value, next.token ? (legal) => next.token!(legal) : undefined);
  }
  return snap;
}

/** Plays until the server reports the game finished; returns the final snapshot. */
export async function playToEnd(table: Table, racers: readonly string[], maxActions = 600): Promise<ServerSnapshot> {
  let snap = await table.state();
  for (let i = 0; i < maxActions && snap.game!.phase === "playing"; i++) {
    const next = plan(snap.game!, racers);
    snap = await table.act(next.value, next.token ? (legal) => next.token!(legal) : undefined);
  }
  expect(snap.game!.phase, "the game finished").toBe("finished");
  return snap;
}

/** The server's action log matches what was clicked: one roll per Roll click, one move per chosen move. */
export function expectNoDuplicates(table: Table, snap: ServerSnapshot): void {
  const count = (type: string) => snap.events.filter((e) => e.actionType === type).length;
  expect(count("game:roll"), "one committed roll per click").toBe(table.rolls);
  expect(count("game:move"), "one committed move per choice").toBe(table.moves);
  expect(table.players.reduce((n, p) => n + p.sent.roll, 0), "one roll request sent per click").toBe(table.rolls);
  expect(table.players.reduce((n, p) => n + p.sent.move, 0), "one move request sent per choice").toBe(table.moves);
  expect(new Set(snap.events.map((e) => e.seq)).size).toBe(snap.events.length);
  const versions = snap.events.map((e) => e.resultStateVersion);
  expect(versions, "versions advance by one per action").toEqual(versions.map((_, i) => versions[0]! + i));
}

/**
 * The victory screen on every page: the winner, "Game complete", the standings
 * in the server's order (unranked players last in first-winner games), real
 * actions, and no game actions left. Its actions must sit inside the viewport.
 */
export async function expectResults(table: Table, snap: ServerSnapshot): Promise<void> {
  const game = snap.game!;
  const names = new Map(snap.players.map((p) => [p.id, p.displayName]));
  const ranking = game.ranking.length ? game.ranking : [game.winnerId!];
  for (const p of table.players) {
    const winnerText = game.winnerId === p.id ? "You win!" : `${names.get(game.winnerId!)} wins!`;
    const dialog = p.page.getByRole("dialog", { name: winnerText });
    await expect(dialog, `${p.name} sees the victory screen`).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByTestId("game-complete")).toBeVisible();
    const rows = dialog.getByTestId("victory-ranking").getByRole("listitem");
    await expect(rows).toHaveCount(game.players.length);
    for (let i = 0; i < ranking.length; i++) {
      const name = ranking[i] === p.id ? "You" : names.get(ranking[i]!)!;
      await expect(rows.nth(i)).toContainText(name);
      await expect(rows.nth(i)).toContainText(["1st", "2nd", "3rd", "4th"][i]!);
    }
    for (let i = ranking.length; i < game.players.length; i++) await expect(rows.nth(i)).toContainText("–");
    await expect(dialog.getByTestId("game-summary"), "the summary from the server's log").toBeVisible();
    for (const name of [/New game/, /Return home/]) {
      const action = dialog.getByRole("link", { name });
      await expect(action).toBeInViewport({ ratio: 1 });
    }
    await expect(dialog.getByRole("button", { name: "View board" })).toBeInViewport({ ratio: 1 });
    await expect(p.page.getByRole("button", { name: "Roll dice" })).toHaveCount(0);
    await expect(p.page.getByTestId("game-board").getByRole("button")).toHaveCount(0);
    expect(p.errors, `${p.name}: no page errors`).toEqual([]);
  }
}
