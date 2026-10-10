// City themes, Batch B: the 2D city environments in real browsers.
//  - Every city, on every screen class (desktop, laptop, tablet landscape and
//    portrait, phone portrait and landscape): the right city is shown, the
//    scenery sits in a fixed layer behind the game (never in the board, never
//    clickable), nothing covers the board or the die, the board fits the
//    screen and the page never scrolls sideways.
//  - The city survives joining, a refresh and a network drop, and the game
//    stays in sync with the server throughout.
// Set E2E_SHOTS_DIR to save a screenshot of every city at every size.
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { createRoom, joinRoom, openPlayer, seatTable, startGame, visible, type Player } from "../support/game";

const CITIES = [
  { name: "Kolkata", id: "kolkata", hero: "howrah-bridge" },
  { name: "Delhi", id: "delhi", hero: "india-gate" },
  { name: "Chennai", id: "chennai", hero: "gopuram" },
  { name: "Mumbai", id: "mumbai", hero: "gateway" },
  { name: "Bengaluru", id: "bengaluru", hero: "vidhana-soudha" },
] as const;

const SIZES = [
  { label: "desktop", width: 1920, height: 1080, who: "host" },
  { label: "laptop", width: 1366, height: 768, who: "host" },
  { label: "tablet-landscape", width: 1024, height: 768, who: "host" },
  { label: "tablet-portrait", width: 768, height: 1024, who: "host" },
  { label: "phone-portrait", width: 390, height: 844, who: "guest" },
  { label: "phone-landscape", width: 844, height: 390, who: "guest" },
] as const;

/** Layout facts about the game screen, measured in the page. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() : null);
    const backdrop = document.querySelector("[data-city-backdrop]");
    const style = backdrop ? getComputedStyle(backdrop) : null;
    const board = document.querySelector('[data-testid="game-board"]')!;
    const b = board.getBoundingClientRect();
    // What is on top at points across the board (cells and corners): it must be the board itself.
    const probes: string[] = [];
    for (const fx of [0.08, 0.3, 0.5, 0.7, 0.92])
      for (const fy of [0.08, 0.5, 0.92]) {
        const hit = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
        if (hit && !board.contains(hit)) probes.push(`${fx},${fy}: ${hit.tagName}.${(hit as HTMLElement).className?.toString().slice(0, 40)}`);
      }
    // The visible die (rail or thumb bar) and what is on top at its centre.
    const dice = [...document.querySelectorAll<HTMLElement>('[data-testid="die"], [data-die]')].filter((d) => d.getBoundingClientRect().width > 0);
    const die = dice[0] ?? null;
    let dieCovered: string | null = null;
    if (die) {
      const r = die.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(die.contains(hit) || hit.contains(die) || die.closest("button")?.contains(hit))) dieCovered = hit ? `${hit.tagName}.${(hit as HTMLElement).className?.toString().slice(0, 40)}` : "nothing";
    }
    const scenery = [...document.querySelectorAll("[data-landmark], [data-fixture], [data-traveller], [data-floater], [data-viaduct]")];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      city: document.querySelector('[data-testid="game-screen"]')?.getAttribute("data-city") ?? null,
      backdrop: backdrop ? { city: backdrop.getAttribute("data-city-backdrop"), position: style!.position, zIndex: style!.zIndex, pointerEvents: style!.pointerEvents, ariaHidden: backdrop.getAttribute("aria-hidden") } : null,
      sceneryOutsideBackdrop: scenery.filter((el) => !backdrop?.contains(el)).length,
      sceneryInsideBoard: scenery.filter((el) => board.contains(el)).length,
      heroes: [...document.querySelectorAll('[data-role="hero"]')].map((el) => el.getAttribute("data-landmark")),
      board: b.toJSON(),
      plinth: rect(document.querySelector('[data-testid="city-plinth"]')),
      probes,
      die: die ? die.getBoundingClientRect().toJSON() : null,
      dieCovered,
    };
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (process.env.E2E_SHOTS_DIR) await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/${name}.png` });
}

for (const city of CITIES) {
  test(`${city.name}: the city frames the board on every screen without covering play`, async ({ browser }) => {
    const host = await openPlayer(browser, "Aman", "desktop");
    const guest = await openPlayer(browser, "Ben", "phone");
    const code = await createRoom(host, { players: 2, city: city.name });
    await joinRoom(guest, code);
    await startGame(host, [host, guest]);

    for (const size of SIZES) {
      const page = (size.who === "host" ? host : guest).page;
      await page.setViewportSize({ width: size.width, height: size.height });
      // The city's artwork is its own chunk: wait until its hero landmark is in.
      await expect(page.locator(`[data-city-backdrop="${city.id}"] [data-landmark="${city.hero}"]`)).toHaveCount(1);
      await page.waitForTimeout(250);
      const m = await measure(page);
      const where = `${city.name} at ${size.label}`;
      expect(m.city, where).toBe(city.id);
      expect(m.backdrop, where).toEqual({ city: city.id, position: "fixed", zIndex: "-1", pointerEvents: "none", ariaHidden: "true" });
      expect(m.sceneryOutsideBackdrop, `${where}: scenery only in the backdrop layer`).toBe(0);
      expect(m.sceneryInsideBoard, where).toBe(0);
      expect(m.heroes, where).toEqual([city.hero]);
      expect(m.scrollWidth, `${where}: no sideways scrolling`).toBeLessThanOrEqual(m.viewport.width);
      // The whole board is on screen, inside its plinth, with nothing on top of it.
      expect(m.board.left, where).toBeGreaterThanOrEqual(0);
      expect(m.board.right, where).toBeLessThanOrEqual(m.viewport.width + 0.5);
      expect(m.board.top, where).toBeGreaterThanOrEqual(60);
      expect(m.board.bottom, where).toBeLessThanOrEqual(m.viewport.height + 0.5);
      expect(m.plinth, where).not.toBeNull();
      expect(m.board.left).toBeGreaterThanOrEqual(m.plinth!.left);
      expect(m.board.right).toBeLessThanOrEqual(m.plinth!.right + 0.5);
      expect(m.probes, `${where}: nothing covers the board`).toEqual([]);
      // The die is visible and on top (rail on wide screens, thumb bar on phones).
      expect(m.die, `${where}: a die is visible`).not.toBeNull();
      expect(m.die!.bottom, where).toBeLessThanOrEqual(m.viewport.height + 0.5);
      expect(m.dieCovered, `${where}: nothing covers the die`).toBeNull();
      await shot(page, `${city.id}-${size.label}`);
    }
    for (const p of [host, guest]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
    // Close the pages: an animated city left open would load the machine for the tests after this one.
    for (const p of [host, guest]) await p.context.close();
  });
}

test("the city survives joining, a refresh and a network drop, and play stays in sync", async ({ browser }) => {
  const host = await openPlayer(browser, "Aman", "desktop");
  const guest: Player = await openPlayer(browser, "Ben", "tablet");
  let offline = false;
  const routes = new Set<WebSocketRoute>();
  await guest.page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (offline) {
      void ws.close({ code: 1006, reason: "network down" });
      return;
    }
    ws.connectToServer();
    routes.add(ws);
  });

  const code = await createRoom(host, { players: 2, city: "Chennai" });
  await guest.page.goto(`/join/${code}`);
  await expect(guest.page.locator('[data-room-city="chennai"]')).toBeVisible();
  await joinRoom(guest, code);
  await startGame(host, [host, guest]);
  const table = await seatTable(code, [host, guest]);
  const cityOf = (p: Player) => p.page.getByTestId("game-screen").getAttribute("data-city");
  for (const p of [host, guest]) expect(await cityOf(p)).toBe("chennai");

  await table.act(6, () => 0);
  await table.act(4);

  // A refresh reloads everything from the server: same city, same board.
  await guest.page.reload();
  await expect(guest.page.locator('[data-city-backdrop="chennai"]')).toHaveCount(1);
  await table.expectInSync();

  // The network drops and returns: the seat re-attaches in the same city.
  offline = true;
  table.offline.add(guest);
  for (const ws of routes) void ws.close({ code: 1006, reason: "network down" });
  routes.clear();
  await expect(visible(guest.page.getByText(/Reconnecting|Offline/))).toBeVisible();
  offline = false;
  table.offline.delete(guest);
  await table.expectInSync();
  await expect(visible(guest.page.getByText("Reconnected: your seat is back"))).toBeVisible();
  expect(await cityOf(guest)).toBe("chennai");
  await expect(guest.page.locator('[data-city-backdrop="chennai"] [data-landmark="gopuram"]')).toHaveCount(1);

  // Play carries on, in sync, in the same city for both.
  await table.act(6, () => 0);
  await table.act(2);
  await table.act(5);
  const snap = await table.expectInSync();
  expect(snap.room.settings.cityTheme).toBe("chennai");
  for (const p of [host, guest]) expect(await cityOf(p)).toBe("chennai");
  for (const p of [host, guest]) expect(p.errors, `${p.name}: no page errors`).toEqual([]);
  for (const p of [host, guest]) await p.context.close();
});
