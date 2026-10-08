// Procedural art-direction concept for the classic board: flat, pastel-stepped,
// minimal. Drawn entirely from the real layout data and design tokens, so it is
// also the 2D renderer's visual target (no generated imagery involved).

import { BOARD_SURFACES, PLAYER_IDENTITIES, SAFE_STAR_PATH, die2dSvg, mixLab, token2dSvg } from "@ludo/design-tokens";
import {
  CLASSIC_BASE_ORIGIN,
  CLASSIC_CENTRE,
  CLASSIC_GRID,
  CLASSIC_HOME_LANES,
  CLASSIC_SAFE_INDICES,
  CLASSIC_SEATS,
  CLASSIC_START_INDEX,
  CLASSIC_TRACK,
  classicBaseSlots,
  classicHomeEntryIndex,
  classicSeatPath,
} from "../classicSquareLayout.js";
import type { Cell } from "../layoutTypes.js";

const S = 40;
const PAD = 28;
const BOARD = CLASSIC_GRID * S;
const WHITE = "#FFFFFF";
const SEPARATOR = "#ECE7DE";

/** Tonal steps for bases (outside → in) and lanes (outer → centre). */
const BASE_TINTS = [0.08, 0.3, 0.48, 0.64, 0.8];
const LANE_TINTS = [0.8, 0.64, 0.47, 0.3, 0.12];

const px = (col: number) => PAD + col * S;
const py = (row: number) => PAD + row * S;
const tint = (hex: string, t: number) => (t === 0 ? hex : mixLab(hex, WHITE, t));

function cell(c: Cell, fill: string): string {
  return `<rect x="${px(c.col) + 0.5}" y="${py(c.row) + 0.5}" width="${S - 1}" height="${S - 1}" rx="3" fill="${fill}" stroke="${SEPARATOR}"/>`;
}

function chevron(c: Cell, toward: Cell, fill: string, size = 0.42): string {
  const angle = (Math.atan2(toward.row - c.row, toward.col - c.col) * 180) / Math.PI;
  const k = S * size;
  return `<path d="M${-k * 0.35} ${-k * 0.5}L${k * 0.35} 0L${-k * 0.35} ${k * 0.5}" fill="none" stroke="${fill}" stroke-width="${S * 0.08}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${px(c.col) + S / 2} ${py(c.row) + S / 2}) rotate(${angle})"/>`;
}

function token(seat: number, at: { x: number; y: number }, size = S * 0.82): string {
  const box = size / 0.88;
  return `<svg x="${at.x - box / 2}" y="${at.y - box / 2}" width="${box}" height="${box}" viewBox="0 0 100 100">${token2dSvg(PLAYER_IDENTITIES[seat]!, { finish: "flat", idPrefix: `cc${Math.round(at.x)}-${Math.round(at.y)}` })}</svg>`;
}

const centreOf = (c: Cell) => ({ x: px(c.col) + S / 2, y: py(c.row) + S / 2 });

export function buildClassicConceptSvg(): string {
  const size = BOARD + PAD * 2;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size + 36}" width="${size}" height="${size + 36}" font-family="Inter, system-ui, sans-serif">`,
    `<rect width="100%" height="100%" fill="#F3F0EA"/>`,
    `<rect x="${PAD - 10}" y="${PAD - 4}" width="${BOARD + 20}" height="${BOARD + 20}" rx="30" fill="#141821" opacity="0.06"/>`,
    `<rect x="${PAD - 10}" y="${PAD - 10}" width="${BOARD + 20}" height="${BOARD + 20}" rx="30" fill="${WHITE}"/>`,
  ];

  // Bases: stepped tonal squares, as in a printed premium board.
  for (let seat = 0; seat < CLASSIC_SEATS; seat++) {
    const body = PLAYER_IDENTITIES[seat]!.body;
    const o = CLASSIC_BASE_ORIGIN[seat]!;
    BASE_TINTS.forEach((t, k) => {
      const inset = 4 + k * S * 0.5;
      const side = 6 * S - inset * 2;
      out.push(`<rect x="${px(o.col) + inset}" y="${py(o.row) + inset}" width="${side}" height="${side}" rx="${Math.max(6, 44 - k * 8)}" fill="${tint(body, t)}"/>`);
    });
    for (const slot of classicBaseSlots(seat)) {
      out.push(`<circle cx="${PAD + slot.x * S}" cy="${PAD + slot.y * S}" r="${S * 0.44}" fill="${WHITE}" opacity="0.55"/>`);
    }
  }

  // Track: crisp white cells; starts in seat colour with a clockwise chevron; quiet stars.
  CLASSIC_TRACK.forEach((c, index) => {
    const startSeat = CLASSIC_START_INDEX.indexOf(index);
    out.push(cell(c, startSeat >= 0 ? PLAYER_IDENTITIES[startSeat]!.body : BOARD_SURFACES.cell));
    if (startSeat >= 0) {
      out.push(chevron(c, CLASSIC_TRACK[(index + 1) % CLASSIC_TRACK.length]!, WHITE));
    } else if (CLASSIC_SAFE_INDICES.includes(index)) {
      const k = (S * 0.5) / 24;
      out.push(`<path d="${SAFE_STAR_PATH}" fill="${BOARD_SURFACES.safeMark}" opacity="0.45" transform="translate(${px(c.col) + S * 0.25} ${py(c.row) + S * 0.25}) scale(${k})"/>`);
    }
  });

  // Home lanes: pastel → saturated toward the centre; a small chevron marks each turn-in.
  CLASSIC_HOME_LANES.forEach((lane, seat) => {
    const body = PLAYER_IDENTITIES[seat]!.body;
    lane.forEach((c, i) => out.push(cell(c, tint(body, LANE_TINTS[i]!))));
    const entry = CLASSIC_TRACK[classicHomeEntryIndex(seat)]!;
    out.push(chevron(entry, lane[0]!, tint(body, 0.2), 0.34));
  });

  // Centre: four flat triangles.
  const cx = px(CLASSIC_CENTRE.col);
  const cy = py(CLASSIC_CENTRE.row);
  const m = 3 * S;
  const mid = `${cx + m / 2},${cy + m / 2}`;
  [
    `${cx},${cy} ${cx},${cy + m} ${mid}`,
    `${cx},${cy} ${cx + m},${cy} ${mid}`,
    `${cx + m},${cy} ${cx + m},${cy + m} ${mid}`,
    `${cx},${cy + m} ${cx + m},${cy + m} ${mid}`,
  ].forEach((points, seat) => out.push(`<polygon points="${points}" fill="${PLAYER_IDENTITIES[seat]!.body}"/>`));

  // A mid-game moment, placed from real seat paths.
  const at = (seat: number, step: number) => {
    const path = classicSeatPath(seat);
    return centreOf(step <= 50 ? path.track[step]! : path.lane[step - 51]!);
  };
  out.push(token(0, at(0, 9)), token(0, at(0, 23)), token(1, at(1, 4)), token(2, at(2, 53)), token(3, at(3, 33)));
  const baseTokens: [number, number][] = [[0, 2], [0, 3], [1, 1], [1, 2], [1, 3], [2, 0], [2, 2], [2, 3], [3, 0], [3, 1], [3, 2]];
  for (const [seat, slot] of baseTokens) {
    const s = classicBaseSlots(seat)[slot]!;
    out.push(token(seat, { x: PAD + s.x * S, y: PAD + s.y * S }));
  }
  const dieSize = S * 0.95;
  out.push(`<svg x="${cx + m / 2 - dieSize / 2}" y="${cy + m / 2 - dieSize / 2}" width="${dieSize}" height="${dieSize}" viewBox="0 0 100 100">${die2dSvg(6, "concept")}</svg>`);

  out.push(`<text x="${size / 2}" y="${size + 18}" font-size="12" text-anchor="middle" fill="#5C6370">Procedural concept from the real layout data · flat finish · clockwise chevrons on start cells</text>`);
  out.push("</svg>");
  return out.join("\n");
}
