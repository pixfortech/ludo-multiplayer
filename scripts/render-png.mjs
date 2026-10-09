// Renders the committed review SVGs to PNG previews with headless Chromium.
// Usage: npm run design:png   (set CHROMIUM_PATH to override the browser)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const outDir = join(root, "docs/design/generated/png");
const SOURCES = [
  "classic-board-overview",
  "classic-path-seat1-crimson",
  "classic-path-seat2-royal-blue",
  "classic-path-seat3-emerald",
  "classic-path-seat4-golden",
  "classic-board-concept",
  "token-sizes",
];
const chromium =
  process.env.CHROMIUM_PATH ??
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);
if (!chromium) throw new Error("No Chromium found; set CHROMIUM_PATH");

mkdirSync(outDir, { recursive: true });
for (const name of SOURCES) {
  const svg = join(root, "docs/design/generated", `${name}.svg`);
  const head = readFileSync(svg, "utf8").slice(0, 400);
  const width = Number(/width="(\d+(?:\.\d+)?)"/.exec(head)?.[1]);
  const height = Number(/height="(\d+(?:\.\d+)?)"/.exec(head)?.[1]);
  if (!width || !height) throw new Error(`${name}.svg has no width/height`);
  const png = join(outDir, `${name}.png`);
  execFileSync(chromium, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1.5", // Headless Chrome's viewport is ~90 px shorter than the window; pad so nothing is clipped.
    `--window-size=${Math.ceil(width)},${Math.ceil(height) + 100}`,
    `--screenshot=${png}`, `file://${svg}`,
  ], { stdio: "ignore" });
  console.log(`wrote docs/design/generated/png/${basename(png)}`);
}
