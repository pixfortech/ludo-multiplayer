// Procedural 2D die — reference implementation of docs/design/dice-design.md.
// 100×100 box; ivory resin body, recessed ink pips, gold rings on the six.

import { BOARD_SURFACES, INK } from "./palette.js";

export const DIE = { ivory: "#F6F1E7", ivoryLight: "#FFFFFF", gold: "#E3B341" } as const;

const PIP_LAYOUT: Record<number, readonly (readonly [number, number])[]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]],
};

export function die2dSvg(value: number, idPrefix = "die"): string {
  const pips = PIP_LAYOUT[value];
  if (!pips) throw new RangeError(`Die value must be 1–6, got ${value}`);
  const id = `${idPrefix}-${value}`;
  const pipR = 8.5;
  return [
    `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${DIE.ivoryLight}"/><stop offset="1" stop-color="${DIE.ivory}"/></linearGradient></defs>`,
    `<ellipse cx="50" cy="95" rx="40" ry="4" fill="${BOARD_SURFACES.line}"/>`,
    `<rect x="4" y="4" width="92" height="88" rx="21" fill="url(#${id}-g)" stroke="${BOARD_SURFACES.line}" stroke-width="1.5"/>`,
    ...pips.map(([x, y]) =>
      value === 6
        ? `<circle cx="${x}" cy="${y - 2}" r="${pipR + 2.5}" fill="none" stroke="${DIE.gold}" stroke-width="1.6"/><circle cx="${x}" cy="${y - 2}" r="${pipR}" fill="${INK.dark}"/>`
        : `<circle cx="${x}" cy="${y - 2}" r="${pipR}" fill="${INK.dark}"/>`,
    ),
  ].join("");
}
