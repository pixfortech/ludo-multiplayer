// Helpers for the 3D board in real browsers. The 3D board is a WebGL canvas,
// so tests read what it drew: screen pixels (from Playwright screenshots,
// decoded here), and the renderer's hidden mirror of each token's step, state
// and projected position, and each cell's colour and projected centre.
// Clicks and taps go to those screen positions, through the real raycaster.

import { inflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";
import type { Player } from "./game";

/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG (what Playwright screenshots are). */
export function decodePng(png: Buffer): { width: number; height: number; pixel: (x: number, y: number) => [number, number, number] } {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("latin1", pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const colourType = data[9]!;
      if (data[8] !== 8 || data[12] !== 0 || (colourType !== 2 && colourType !== 6)) throw new Error("unsupported PNG");
      channels = colourType === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels]! : 0;
      let v = line[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, pixel: (x, y) => [out[y * stride + x * channels]!, out[y * stride + x * channels + 1]!, out[y * stride + x * channels + 2]!] };
}

/** CIE76 colour difference between two sRGB colours (good enough to tell seat colours and tints apart). */
export function colourDistance(a: readonly number[], b: readonly number[]): number {
  const lab = ([r, g, bl]: readonly number[]) => {
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const [R, G, B] = [lin(r!), lin(g!), lin(bl!)];
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
    const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
    const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1! - l2!, a1! - a2!, b1! - b2!);
}

export const hexRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export interface Cell3D {
  kind: string;
  row: number | null;
  col: number | null;
  index: number | null;
  seat: number | null;
  colour: string;
  /** Viewport coordinates of the cell's centre. */
  x: number;
  y: number;
}

export interface Token3D {
  key: string;
  step: string;
  state: string;
  x: number;
  y: number;
}

/** The 2.5D/3D board is on screen and has drawn (its mirrors carry projected positions). */
export async function expectBoard3d(page: Page, mode: "2.5d" | "3d" = "2.5d"): Promise<void> {
  const board = page.locator(`[data-testid="game-board"][data-renderer="${mode}"]`);
  await expect(board).toBeVisible({ timeout: 20_000 });
  await expect(board.locator("canvas")).toBeVisible();
  await expect.poll(() => board.locator('[data-testid="board-cells-mirror"] li[data-cx]').count(), { message: "the 3D board has drawn" }).toBeGreaterThan(70);
}

export async function boardCells(page: Page): Promise<Cell3D[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="game-board"] canvas')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('[data-testid="board-cells-mirror"] li')].map((el) => ({
      kind: el.dataset.kind!,
      row: el.dataset.row ? Number(el.dataset.row) : null,
      col: el.dataset.col ? Number(el.dataset.col) : null,
      index: el.dataset.index ? Number(el.dataset.index) : null,
      seat: el.dataset.seat ? Number(el.dataset.seat) : null,
      colour: el.dataset.colour!,
      x: canvas.left + Number(el.dataset.cx),
      y: canvas.top + Number(el.dataset.cy),
    }));
  });
}

export async function boardTokens(page: Page): Promise<Token3D[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="game-board"] canvas')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('[data-testid="board-mirror"] li')].map((el) => ({
      key: el.dataset.key!,
      step: el.dataset.step!,
      state: el.dataset.state!,
      x: canvas.left + Number(el.dataset.cx),
      y: canvas.top + Number(el.dataset.cy),
    }));
  });
}

/** The colour drawn at a viewport point (the average of a 3 × 3 patch). */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = decodePng(await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 }, animations: "allow" }));
  const sum = [0, 0, 0];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const p = png.pixel(i, j);
      for (let k = 0; k < 3; k++) sum[k]! += p[k]!;
    }
  return sum.map((v) => Math.round(v / 9)) as [number, number, number];
}

/** Picks a token on the 3D board the way a player does: a mouse click, or a tap on touch screens. */
export async function pickToken3d(player: Player, key: string): Promise<void> {
  const token = (await boardTokens(player.page)).find((t) => t.key === key);
  if (!token) throw new Error(`no token ${key} on the 3D board`);
  if (player.touch) await player.page.touchscreen.tap(token.x, token.y);
  else {
    // A player's pointer arrives over the token before pressing (hover previews the move).
    await player.page.mouse.move(token.x, token.y, { steps: 3 });
    await player.page.waitForTimeout(120);
    await player.page.mouse.click(token.x, token.y);
  }
}

/** What a page shows about one token and its pointer, for failure messages. */
export async function pickDiagnostics(player: Player, key: string): Promise<string> {
  const token = (await boardTokens(player.page)).find((t) => t.key === key);
  const extra = await player.page.evaluate(() => ({
    finePointer: matchMedia("(hover: hover) and (pointer: fine)").matches,
    canvas: document.querySelector('[data-testid="game-board"] canvas')?.getBoundingClientRect().toJSON(),
    status: document.querySelector('[data-testid="game-status"]')?.textContent ?? null,
    quality: (document.querySelector('[data-testid="game-board"]') as HTMLElement | null)?.dataset.quality,
    frameMs: (document.querySelector('[data-testid="game-board"]') as HTMLElement | null)?.dataset.frameMs,
  }));
  return JSON.stringify({ token, sent: player.sent, errors: player.errors, ...extra });
}
