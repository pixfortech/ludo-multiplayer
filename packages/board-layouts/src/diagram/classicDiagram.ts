// Review diagrams for the classic board, generated from the layout data:
//  • overview: every shared-track cell (absolute 0–51), the clockwise route
//    with an arrow on every step, starts, stars, home entries, lanes, home
//  • one per seat: that seat's complete numbered journey, steps 0–56
// SVG sources are committed under docs/design/generated/ (drift-tested); PNG
// previews are rendered from them with `npm run design:png`.

import { BOARD_SURFACES, INK, PLAYER_IDENTITIES, SAFE_STAR_PATH } from "@ludo/design-tokens";
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
  classicSeatPath,
} from "../classicSquareLayout.js";
import { cellKey, type Cell } from "../layoutTypes.js";
import { buildClassicConceptSvg } from "./classicConcept.js";
import { buildGeometryReport } from "../report/geometryReport.js";
import { buildClassicReference } from "../report/classicReference.js";

const S = 52; // px per cell
const PAD = 24;
const HEAD = 78;
const FOOT = 178;
const SIZE = CLASSIC_GRID * S;
export const CLASSIC_DIAGRAM_SIZE = { width: SIZE + PAD * 2, height: HEAD + SIZE + FOOT } as const;

const x = (col: number) => PAD + col * S;
const y = (row: number) => HEAD + row * S;
const cx = (c: Cell) => x(c.col) + S / 2;
const cy = (c: Cell) => y(c.row) + S / 2;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SEAT_POSITION = ["top-left", "top-right", "bottom-right", "bottom-left"];

function text(tx: number, ty: number, value: string | number, fill: string, size = 14, weight = 600, anchor = "middle"): string {
  return `<text x="${tx}" y="${ty + size * 0.35}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(String(value))}</text>`;
}

/** Number in a white pill so it stays legible on top of the route line. */
function pill(c: Cell, value: string | number, ring: string, size = 13): string {
  const w = String(value).length > 1 ? 26 : 22;
  return [
    `<rect x="${cx(c) - w / 2}" y="${cy(c) - 11}" width="${w}" height="22" rx="11" fill="#FFFFFF" stroke="${ring}" stroke-width="1.5"/>`,
    text(cx(c), cy(c), value, INK.dark, size, 700),
  ].join("");
}

function cellRect(cell: Cell, fill: string, opacity = 1): string {
  return `<rect x="${x(cell.col) + 1}" y="${y(cell.row) + 1}" width="${S - 2}" height="${S - 2}" rx="6" fill="${fill}" stroke="${BOARD_SURFACES.line}" opacity="${opacity}"/>`;
}

function star(cell: Cell, fill: string, opacity: number): string {
  const k = (S * 0.78) / 24;
  return `<path d="${SAFE_STAR_PATH}" fill="${fill}" opacity="${opacity}" transform="translate(${x(cell.col) + S * 0.11} ${y(cell.row) + S * 0.11}) scale(${k})"/>`;
}

/** Continuous route line through cell centres. */
function routeLine(cells: readonly Cell[], colour: string, width: number, opacity: number, closed = false): string {
  const points = cells.map((c) => `${cx(c)},${cy(c)}`).join(" ");
  const tag = closed ? "polygon" : "polyline";
  return `<${tag} points="${points}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" opacity="${opacity}"/>`;
}

/** Large arrowhead on the edge between two consecutive cells, pointing in the direction of travel. */
function arrow(from: Cell, to: Cell, colour: string, size = 9): string {
  const ax = (cx(from) + cx(to)) / 2;
  const ay = (cy(from) + cy(to)) / 2;
  const angle = (Math.atan2(to.row - from.row, to.col - from.col) * 180) / Math.PI;
  return `<path d="M${-size} ${-size}L${size} 0L${-size} ${size}z" fill="${colour}" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round" transform="translate(${ax} ${ay}) rotate(${angle})"/>`;
}

function outline(c: Cell, colour: string, dashed: boolean): string {
  return `<rect x="${x(c.col) + 2}" y="${y(c.row) + 2}" width="${S - 4}" height="${S - 4}" rx="7" fill="none" stroke="${colour}" stroke-width="3.5"${dashed ? ' stroke-dasharray="6 4"' : ""}/>`;
}

/** Circular clockwise badge. */
function clockwiseBadge(bx: number, by: number): string {
  const r = 16;
  return [
    `<circle cx="${bx}" cy="${by}" r="${r + 9}" fill="#FFFFFF" stroke="${BOARD_SURFACES.line}"/>`,
    `<path d="M${bx} ${by - r}A${r} ${r} 0 1 1 ${bx - r} ${by}" fill="none" stroke="${INK.dark}" stroke-width="3.5"/>`,
    `<path d="M${bx - r - 7} ${by - 2}L${bx - r} ${by + 8}L${bx - r + 7} ${by - 2}z" fill="${INK.dark}"/>`,
  ].join("");
}

function boardChrome(focus: number): string[] {
  const out: string[] = [`<rect x="${PAD - 8}" y="${HEAD - 8}" width="${SIZE + 16}" height="${SIZE + 16}" rx="20" fill="${BOARD_SURFACES.base}"/>`];
  for (let seat = 0; seat < CLASSIC_SEATS; seat++) {
    const p = PLAYER_IDENTITIES[seat]!;
    const o = CLASSIC_BASE_ORIGIN[seat]!;
    const dim = focus >= 0 && focus !== seat ? 0.35 : 1;
    out.push(`<g opacity="${dim}">`);
    out.push(`<rect x="${x(o.col) + 3}" y="${y(o.row) + 3}" width="${6 * S - 6}" height="${6 * S - 6}" rx="20" fill="${p.body}"/>`);
    out.push(`<rect x="${x(o.col) + S * 0.75}" y="${y(o.row) + S * 0.75}" width="${4.5 * S}" height="${4.5 * S}" rx="16" fill="${BOARD_SURFACES.cell}"/>`);
    for (const slot of classicBaseSlots(seat)) {
      out.push(`<circle cx="${PAD + slot.x * S}" cy="${HEAD + slot.y * S}" r="${S * 0.5}" fill="#FFFFFF" stroke="${p.body}" stroke-width="3"/>`);
    }
    out.push(text(x(o.col) + 3 * S, y(o.row) + 2.75 * S, p.name, p.rim, 15, 800));
    out.push(text(x(o.col) + 3 * S, y(o.row) + 3.25 * S, `Seat ${seat + 1} · ${SEAT_POSITION[seat]}`, "#5C6370", 11, 600));
    out.push("</g>");
  }
  const c0x = x(CLASSIC_CENTRE.col);
  const c0y = y(CLASSIC_CENTRE.row);
  const m = 3 * S;
  const mid = `${c0x + m / 2},${c0y + m / 2}`;
  [
    `${c0x},${c0y} ${c0x},${c0y + m} ${mid}`, // left → seat 1
    `${c0x},${c0y} ${c0x + m},${c0y} ${mid}`, // top → seat 2
    `${c0x + m},${c0y} ${c0x + m},${c0y + m} ${mid}`, // right → seat 3
    `${c0x},${c0y + m} ${c0x + m},${c0y + m} ${mid}`, // bottom → seat 4
  ].forEach((points, seat) => {
    const dim = focus >= 0 && focus !== seat ? 0.35 : 1;
    out.push(`<polygon points="${points}" fill="${PLAYER_IDENTITIES[seat]!.body}" opacity="${dim}"/>`);
  });
  return out;
}

/** Small gold star in the cell's top-right corner, drawn above the route so safe cells stay obvious. */
function safeBadge(c: Cell): string {
  const k = 15 / 24;
  return `<g transform="translate(${x(c.col) + S - 19} ${y(c.row) + 2}) scale(${k})"><circle cx="12" cy="12" r="12" fill="#FFFFFF"/><path d="${SAFE_STAR_PATH}" fill="#C9A227" stroke="#6B5310" stroke-width="1.2"/></g>`;
}

const safeBadges: string[] = [];

function cells(focus: number): string[] {
  const out: string[] = [];
  safeBadges.length = 0;
  const pathKeys = focus >= 0 ? new Set(classicSeatPath(focus).track.map(cellKey)) : null;
  CLASSIC_HOME_LANES.forEach((lane, seat) => {
    for (const cell of lane) out.push(cellRect(cell, PLAYER_IDENTITIES[seat]!.lane, focus >= 0 && seat !== focus ? 0.3 : 1));
  });
  CLASSIC_TRACK.forEach((cell, index) => {
    const startSeat = CLASSIC_START_INDEX.indexOf(index);
    const fill = startSeat >= 0 ? PLAYER_IDENTITIES[startSeat]!.body : BOARD_SURFACES.cell;
    out.push(cellRect(cell, fill, pathKeys && !pathKeys.has(cellKey(cell)) ? 0.3 : 1));
    if (CLASSIC_SAFE_INDICES.includes(index)) {
      out.push(star(cell, startSeat >= 0 ? "#FFFFFF" : BOARD_SURFACES.safeMark, startSeat >= 0 ? 0.5 : 0.45));
      safeBadges.push(safeBadge(cell));
    }
  });
  return out;
}

const describeSeat = (seat: number) => {
  const { track, lane } = classicSeatPath(seat);
  return `start ${cellKey(track[0]!)} → entry ${cellKey(track[50]!)} → lane ${cellKey(lane[0]!)}–${cellKey(lane[4]!)} → home`;
};

export type ClassicDiagramView = { kind: "overview" } | { kind: "seat"; seat: number };

export function buildClassicDiagramSvg(view: ClassicDiagramView): string {
  const focus = view.kind === "seat" ? view.seat : -1;
  const parts = [...boardChrome(focus), ...cells(focus)];
  const { width, height } = CLASSIC_DIAGRAM_SIZE;
  let title: string;
  let subtitle: string;
  const legend: string[] = [];

  if (focus < 0) {
    // Shared route: one closed clockwise loop with an arrow on every step.
    parts.push(routeLine(CLASSIC_TRACK, INK.dark, 6, 0.22, true));
    CLASSIC_TRACK.forEach((cell, index) => parts.push(arrow(cell, CLASSIC_TRACK[(index + 1) % CLASSIC_TRACK.length]!, "#3A404D", 8)));
    // Each seat's private finish: entry → lane → home, in its colour.
    for (let seat = 0; seat < CLASSIC_SEATS; seat++) {
      const p = PLAYER_IDENTITIES[seat]!;
      const { track, lane, finish } = classicSeatPath(seat);
      const entry = track[50]!;
      const tail = [entry, ...lane, finish];
      parts.push(routeLine(tail, p.rim, 5, 0.55));
      for (let i = 0; i + 1 < tail.length; i++) parts.push(arrow(tail[i]!, tail[i + 1]!, p.rim, 7));
      parts.push(outline(entry, p.rim, true));
      parts.push(outline(track[0]!, INK.dark, false));
      lane.forEach((c, i) => parts.push(pill(c, 51 + i, p.rim, 12)));
      parts.push(`<circle cx="${cx(finish)}" cy="${cy(finish)}" r="16" fill="#FFFFFF" stroke="${p.rim}" stroke-width="2.5"/>`, text(cx(finish), cy(finish), 56, INK.dark, 12, 800));
    }
    CLASSIC_TRACK.forEach((cell, index) => parts.push(pill(cell, index, BOARD_SURFACES.line, 12)));
    parts.push(clockwiseBadge(x(14) + S / 2 - 6, y(14) + S / 2 - 6));
    title = "Classic 4-player board — reference (clockwise)";
    subtitle = "Every shared-track cell is numbered with its absolute index 0–51. Lanes show seat steps 51–55; ● 56 is home.";
    legend.push(
      "↻ Clockwise route with one arrow per step. Solid outline = start (step 0, safe).",
      "Gold ★ badge = safe cell (4 starts + 4 stars). Dashed outline = home entry (step 50).",
      ...Array.from({ length: CLASSIC_SEATS }, (_, s) => `${PLAYER_IDENTITIES[s]!.name}: ${describeSeat(s)}`),
    );
  } else {
    const p = PLAYER_IDENTITIES[focus]!;
    const { track, lane, finish } = classicSeatPath(focus);
    const journey = [...track, ...lane, finish];
    parts.push(routeLine(journey, p.body, 12, 0.45));
    for (let i = 0; i + 1 < journey.length; i++) parts.push(arrow(journey[i]!, journey[i + 1]!, p.rim, 9));
    parts.push(outline(track[0]!, INK.dark, false), outline(track[50]!, p.rim, true));
    journey.slice(0, -1).forEach((c, step) => parts.push(pill(c, step, step === 0 || step === 50 ? INK.dark : p.rim, 12)));
    parts.push(`<circle cx="${cx(finish)}" cy="${cy(finish)}" r="20" fill="#FFFFFF" stroke="${p.rim}" stroke-width="3"/>`, text(cx(finish), cy(finish), 56, INK.dark, 14, 800));
    const label = (c: Cell, value: string, dx: number, dy: number) =>
      `<text x="${cx(c) + dx}" y="${cy(c) + dy}" font-size="10" font-weight="800" text-anchor="middle" fill="${INK.dark}" paint-order="stroke" stroke="#FFFFFF" stroke-width="3">${value}</text>`;
    parts.push(label(track[0]!, "START", 0, 21), label(track[50]!, "ENTRY", 0, -15), label(finish, "HOME", 0, -24));
    parts.push(clockwiseBadge(x(14) + S / 2 - 6, y(14) + S / 2 - 6));
    title = `${p.name} — complete journey (seat ${focus + 1}, ${SEAT_POSITION[focus]})`;
    subtitle = "Opening with a 6 places the token on START (step 0). Every later step is one arrow. Home needs an exact roll.";
    legend.push(
      `Start ${cellKey(track[0]!)} · first moves ${track.slice(1, 6).map(cellKey).join(", ")}`,
      `Last track cells ${track.slice(46, 51).map(cellKey).join(", ")} · home entry ${cellKey(track[50]!)} (step 50)`,
      `Home lane ${lane.map(cellKey).join(", ")} (steps 51–55) · home = centre ${cellKey(finish)} (step 56)`,
      "Distance after opening: 50 track moves + 5 lane moves + 1 move into home = 56 dice steps.",
      "Identical for every colour. The cell behind the start is never visited (faded).",
    );
  }

  parts.push(...safeBadges);
  const legendY = HEAD + SIZE + 30;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif">`,
    `<rect width="100%" height="100%" fill="#FFFFFF"/>`,
    text(width / 2, 26, title, INK.dark, 19, 800),
    text(width / 2, 52, subtitle, "#5C6370", 12.5, 500),
    ...parts,
    ...legend.map((line, i) => text(PAD, legendY + i * 19, line, i === 0 ? INK.dark : "#3A404D", 12, i === 0 ? 700 : 500, "start")),
    text(width - PAD, height - 14, "REFERENCE v1 — awaiting approval", "#C8102E", 11, 800, "end"),
    "</svg>",
  ].join("\n");
}

export const CLASSIC_DIAGRAMS: readonly { path: string; build: () => string }[] = [
  { path: "docs/design/generated/classic-board-concept.svg", build: buildClassicConceptSvg },
  { path: "docs/design/generated/geometry-report.md", build: buildGeometryReport },
  { path: "docs/design/generated/classic-reference.md", build: buildClassicReference },
  { path: "docs/design/generated/classic-board-overview.svg", build: () => buildClassicDiagramSvg({ kind: "overview" }) },
  ...Array.from({ length: CLASSIC_SEATS }, (_, seat) => ({
    path: `docs/design/generated/classic-path-seat${seat + 1}-${PLAYER_IDENTITIES[seat]!.id}.svg`,
    build: () => buildClassicDiagramSvg({ kind: "seat", seat }),
  })),
];
