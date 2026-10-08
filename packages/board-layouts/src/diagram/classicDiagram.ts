// Review diagrams for the classic board, generated from the layout data:
//  • overview: absolute track numbers 0–51, starts, stars, lanes, direction arrows
//  • one per seat: that seat's numbered path, steps 0–56
// Committed under docs/design/generated/ for approval; a drift test keeps them current.

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
  classicHomeEntryIndex,
  classicSeatPath,
} from "../classicSquareLayout.js";
import { cellKey, type Cell } from "../layoutTypes.js";
import { buildClassicConceptSvg } from "./classicConcept.js";
import { buildGeometryReport } from "../report/geometryReport.js";
import { buildClassicReference } from "../report/classicReference.js";

const S = 48; // px per cell
const PAD = 16;
const HEAD = 44;
const FOOT = 64;
const SIZE = CLASSIC_GRID * S;

const x = (col: number) => PAD + col * S;
const y = (row: number) => HEAD + row * S;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(cx: number, cy: number, value: string | number, fill: string, size = 14, weight = 600, opacity = 1): string {
  return `<text x="${cx}" y="${cy + size * 0.35}" font-size="${size}" font-weight="${weight}" text-anchor="middle" fill="${fill}" opacity="${opacity}">${esc(String(value))}</text>`;
}

function cellRect(cell: Cell, fill: string, opacity = 1): string {
  return `<rect x="${x(cell.col) + 1}" y="${y(cell.row) + 1}" width="${S - 2}" height="${S - 2}" rx="5" fill="${fill}" stroke="${BOARD_SURFACES.line}" opacity="${opacity}"/>`;
}

function star(cell: Cell, fill: string, opacity: number): string {
  const k = (S * 0.72) / 24;
  return `<path d="${SAFE_STAR_PATH}" fill="${fill}" opacity="${opacity}" transform="translate(${x(cell.col) + S * 0.14} ${y(cell.row) + S * 0.14}) scale(${k})"/>`;
}

function arrow(from: Cell, to: Cell): string {
  const ax = (x(from.col) + x(to.col)) / 2 + S / 2;
  const ay = (y(from.row) + y(to.row)) / 2 + S / 2;
  const angle = (Math.atan2(to.row - from.row, to.col - from.col) * 180) / Math.PI;
  return `<path d="M-5 -5L5 0L-5 5z" fill="${INK.dark}" opacity="0.7" transform="translate(${ax} ${ay}) rotate(${angle})"/>`;
}

function boardChrome(): string[] {
  const out: string[] = [
    `<rect x="${PAD - 6}" y="${HEAD - 6}" width="${SIZE + 12}" height="${SIZE + 12}" rx="18" fill="${BOARD_SURFACES.base}"/>`,
  ];
  for (let seat = 0; seat < CLASSIC_SEATS; seat++) {
    const p = PLAYER_IDENTITIES[seat]!;
    const o = CLASSIC_BASE_ORIGIN[seat]!;
    out.push(`<rect x="${x(o.col) + 2}" y="${y(o.row) + 2}" width="${6 * S - 4}" height="${6 * S - 4}" rx="18" fill="${p.body}"/>`);
    out.push(`<rect x="${x(o.col) + S * 0.8}" y="${y(o.row) + S * 0.8}" width="${4.4 * S}" height="${4.4 * S}" rx="14" fill="${BOARD_SURFACES.cell}"/>`);
    for (const slot of classicBaseSlots(seat)) {
      out.push(`<circle cx="${PAD + slot.x * S}" cy="${HEAD + slot.y * S}" r="${S * 0.55}" fill="#FFFFFF" stroke="${p.body}" stroke-width="3"/>`);
    }
    out.push(text(x(o.col) + 3 * S, y(o.row) + 3 * S, `Seat ${seat + 1}`, p.rim, 13, 700));
  }
  // Centre: one triangle per seat, pointing at its own arm.
  const cx0 = x(CLASSIC_CENTRE.col);
  const cy0 = y(CLASSIC_CENTRE.row);
  const m = (v: number) => v * S;
  const mid = `${cx0 + m(1.5)},${cy0 + m(1.5)}`;
  const tris = [
    `${cx0},${cy0} ${cx0},${cy0 + m(3)} ${mid}`, // left  → seat 1
    `${cx0},${cy0} ${cx0 + m(3)},${cy0} ${mid}`, // top   → seat 2
    `${cx0 + m(3)},${cy0} ${cx0 + m(3)},${cy0 + m(3)} ${mid}`, // right → seat 3
    `${cx0},${cy0 + m(3)} ${cx0 + m(3)},${cy0 + m(3)} ${mid}`, // bottom → seat 4
  ];
  tris.forEach((points, seat) => out.push(`<polygon points="${points}" fill="${PLAYER_IDENTITIES[seat]!.body}"/>`));
  return out;
}

function startSeatAt(index: number): number {
  return CLASSIC_START_INDEX.indexOf(index);
}

export type ClassicDiagramView = { kind: "overview" } | { kind: "seat"; seat: number };

export function buildClassicDiagramSvg(view: ClassicDiagramView): string {
  const parts = boardChrome();
  const focus = view.kind === "seat" ? view.seat : -1;
  const path = focus >= 0 ? classicSeatPath(focus) : null;
  const stepAt = new Map<string, number>();
  path?.track.forEach((cell, step) => stepAt.set(cellKey(cell), step));
  path?.lane.forEach((cell, i) => stepAt.set(cellKey(cell), 51 + i));

  // Lanes
  CLASSIC_HOME_LANES.forEach((lane, seat) => {
    const dim = focus >= 0 && seat !== focus;
    for (const cell of lane) parts.push(cellRect(cell, PLAYER_IDENTITIES[seat]!.lane, dim ? 0.35 : 1));
  });

  // Track cells
  CLASSIC_TRACK.forEach((cell, index) => {
    const startSeat = startSeatAt(index);
    const onPath = focus < 0 || stepAt.has(cellKey(cell));
    const fill = startSeat >= 0 ? PLAYER_IDENTITIES[startSeat]!.body : BOARD_SURFACES.cell;
    parts.push(cellRect(cell, fill, onPath ? 1 : 0.4));
    if (CLASSIC_SAFE_INDICES.includes(index)) {
      parts.push(star(cell, startSeat >= 0 ? "#FFFFFF" : BOARD_SURFACES.safeMark, startSeat >= 0 ? 0.45 : 0.4));
    }
  });

  if (focus < 0) {
    // Overview: absolute numbers and a direction arrow on every edge.
    CLASSIC_TRACK.forEach((cell, index) => {
      const startSeat = startSeatAt(index);
      const ink = startSeat >= 0 ? PLAYER_IDENTITIES[startSeat]!.ink : INK.dark;
      parts.push(text(x(cell.col) + S / 2, y(cell.row) + S / 2, index, ink, 14, 700));
    });
    CLASSIC_TRACK.forEach((cell, index) => parts.push(arrow(cell, CLASSIC_TRACK[(index + 1) % 52]!)));
    // Each seat: dashed turn-in cell, lane steps 51–55 with arrows, finish 56.
    for (let seat = 0; seat < CLASSIC_SEATS; seat++) {
      const p = PLAYER_IDENTITIES[seat]!;
      const { track, lane, finish } = classicSeatPath(seat);
      const entry = track[track.length - 1]!;
      parts.push(`<rect x="${x(entry.col) + 2}" y="${y(entry.row) + 2}" width="${S - 4}" height="${S - 4}" rx="6" fill="none" stroke="${p.rim}" stroke-width="3" stroke-dasharray="5 3"/>`);
      parts.push(arrow(entry, lane[0]!));
      lane.forEach((c, i) => {
        parts.push(text(x(c.col) + S / 2, y(c.row) + S / 2, 51 + i, INK.dark, 13, 700));
        parts.push(arrow(c, i + 1 < lane.length ? lane[i + 1]! : finish));
      });
      parts.push(`<circle cx="${x(finish.col) + S / 2}" cy="${y(finish.row) + S / 2}" r="${S * 0.36}" fill="#FFFFFF" stroke="${p.rim}" stroke-width="2.5"/>`);
      parts.push(text(x(finish.col) + S / 2, y(finish.row) + S / 2, 56, INK.dark, 13, 800));
    }
  } else {
    const p = PLAYER_IDENTITIES[focus]!;
    // Highlight start and home entry.
    const start = CLASSIC_TRACK[CLASSIC_START_INDEX[focus]!]!;
    const entry = CLASSIC_TRACK[classicHomeEntryIndex(focus)]!;
    parts.push(`<rect x="${x(start.col) - 1}" y="${y(start.row) - 1}" width="${S + 2}" height="${S + 2}" rx="7" fill="none" stroke="${INK.dark}" stroke-width="3"/>`);
    parts.push(`<rect x="${x(entry.col) - 1}" y="${y(entry.row) - 1}" width="${S + 2}" height="${S + 2}" rx="7" fill="none" stroke="${p.rim}" stroke-width="3" stroke-dasharray="5 3"/>`);
    for (const [key, step] of stepAt) {
      const [row, col] = key.slice(1).split("c").map(Number) as [number, number];
      const isStart = step === 0;
      const ink = isStart || step > 50 ? (step > 50 ? INK.dark : p.ink) : INK.dark;
      parts.push(text(x(col) + S / 2, y(row) + S / 2, step, ink, 14, 700));
    }
    const full = [...path!.track, ...path!.lane];
    for (let i = 0; i + 1 < full.length; i++) parts.push(arrow(full[i]!, full[i + 1]!));
    parts.push(arrow(full[full.length - 1]!, path!.finish));
    const f = path!.finish;
    parts.push(`<circle cx="${x(f.col) + S / 2}" cy="${y(f.row) + S / 2}" r="${S * 0.38}" fill="#FFFFFF" stroke="${p.rim}" stroke-width="3"/>`);
    parts.push(text(x(f.col) + S / 2, y(f.row) + S / 2, 56, INK.dark, 14, 800));
  }

  const title =
    focus < 0
      ? "Classic board reference — clockwise"
      : `Seat ${focus + 1} · ${PLAYER_IDENTITIES[focus]!.name} — numbered path, steps 0–56`;
  const legend =
    focus < 0
      ? "Track: absolute index 0–51 · lanes 51–55 and finish 56: seat steps · dashed: turn-in (step 50) · ★ / coloured: safe"
      : "0 = start (solid outline) · 1–50 shared track · 50 = turn-in cell (dashed) · 51–55 home lane · 56 = finish (exact roll)";
  const width = SIZE + PAD * 2;
  const height = HEAD + SIZE + FOOT;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter, system-ui, sans-serif">`,
    `<rect width="100%" height="100%" fill="#FFFFFF"/>`,
    text(width / 2, 22, title, INK.dark, 16, 700),
    ...parts,
    text(width / 2, HEAD + SIZE + 28, legend, "#5C6370", 12, 500),
    text(width / 2, HEAD + SIZE + 48, "DRAFT — pending approval before the rules engine is built", "#C8102E", 12, 700),
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
