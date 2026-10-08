// Procedural 2D token — the reference implementation of the 2D token spec
// (docs/design/token-design.md). Produces a standalone SVG fragment in a
// 100×100 box; renderers scale it to the cell size.
//
// Layers, outside in: contact shadow → halo (light ring) → rim (dark ring)
// → body (radial resin gradient) → gloss → symbol.

import { BOARD_SURFACES, INK, TOKEN_HALO, type PlayerIdentity } from "./palette.js";
import { SYMBOL_PATHS } from "./symbols.js";

export type TokenState =
  | "idle"
  | "movable" // your turn, this token has a legal move
  | "selected" // chosen, move pending
  | "unmovable" // your turn, but this token cannot move
  | "protected" // shielded (power), reserved for expanded modes
  | "captured" // transient: being sent home
  | "finished"; // reached the centre

export const TOKEN_STATES: readonly TokenState[] = [
  "idle",
  "movable",
  "selected",
  "unmovable",
  "protected",
  "captured",
  "finished",
];

/** Geometry in the 100-unit token box. */
export const TOKEN_2D = {
  halo: 44,
  rim: 41,
  body: 36,
  stateRing: 48,
  symbolSize: 46,
  finishedScale: 0.72,
} as const;

/**
 * "resin": radial gradient + gloss (tactile, Luxury Tabletop).
 * "flat": solid body with a faint top-light band (Contemporary Playful, flat print look).
 * Both keep the halo, rim and symbol that the accessibility contract depends on.
 */
export type TokenFinish = "resin" | "flat";

export interface Token2dOptions {
  state?: TokenState;
  finish?: TokenFinish;
  /** Unique prefix for gradient ids when several tokens share one SVG document. */
  idPrefix?: string;
  /** Colour transform applied to every colour (used for colour-blindness previews). */
  transform?: (hex: string) => string;
}

export function token2dSvg(identity: PlayerIdentity, options: Token2dOptions = {}): string {
  const state = options.state ?? "idle";
  const t = options.transform ?? ((hex: string) => hex);
  const finish = options.finish ?? "resin";
  const id = `${options.idPrefix ?? "tk"}-${identity.id}-${state}-${finish}`;
  const s = TOKEN_2D;
  const scale = state === "finished" ? s.finishedScale : 1;
  const opacity = state === "unmovable" ? 0.6 : state === "captured" ? 0.35 : 1;
  const symbolScale = s.symbolSize / 24;
  const symbolOffset = 50 - s.symbolSize / 2;

  const ring = (() => {
    switch (state) {
      case "movable":
        return `<circle cx="50" cy="50" r="${s.stateRing}" fill="none" stroke="${t(identity.body)}" stroke-width="3.5" opacity="0.9"/>`;
      case "selected":
        return `<circle cx="50" cy="50" r="${s.stateRing}" fill="none" stroke="${t(INK.dark)}" stroke-width="4"/><circle cx="50" cy="50" r="${s.stateRing - 3}" fill="none" stroke="${t(TOKEN_HALO)}" stroke-width="2"/>`;
      case "protected":
        return `<circle cx="50" cy="50" r="${s.stateRing}" fill="none" stroke="${t(identity.rim)}" stroke-width="3" stroke-dasharray="6 4"/>`;
      default:
        return "";
    }
  })();

  const badge =
    state === "finished"
      ? `<g transform="translate(66 14)"><circle r="13" fill="${t(INK.dark)}"/><path d="M-6 0l4 4 8-8" fill="none" stroke="${t("#E3B341")}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>`
      : "";

  const bodyLayers =
    finish === "resin"
      ? `<circle cx="50" cy="50" r="${s.body}" fill="url(#${id}-g)"/><ellipse cx="41" cy="33" rx="17" ry="9" fill="#FFFFFF" opacity="0.28"/>`
      : `<circle cx="50" cy="50" r="${s.body}" fill="${t(identity.body)}"/><path d="M${50 - s.body} 50a${s.body} ${s.body} 0 0 1 ${2 * s.body} 0a${s.body} ${s.body * 0.62} 0 0 0 ${-2 * s.body} 0z" fill="#FFFFFF" opacity="0.14"/>`;

  return [
    finish === "resin"
      ? `<defs><radialGradient id="${id}-g" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${t(identity.highlight)}"/><stop offset="0.55" stop-color="${t(identity.body)}"/><stop offset="1" stop-color="${t(identity.rim)}"/></radialGradient></defs>`
      : "",
    `<g opacity="${opacity}">`,
    ring,
    `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">`,
    `<ellipse cx="50" cy="91" rx="30" ry="5.5" fill="${t(BOARD_SURFACES.line)}" opacity="0.9"/>`,
    `<circle cx="50" cy="50" r="${s.halo}" fill="${t(TOKEN_HALO)}"/>`,
    `<circle cx="50" cy="50" r="${s.rim}" fill="${t(identity.rim)}"/>`,
    bodyLayers,
    `<path d="${SYMBOL_PATHS[identity.symbol]}" fill="${t(identity.ink)}" transform="translate(${symbolOffset} ${symbolOffset}) scale(${symbolScale})"/>`,
    `</g>`,
    badge,
    `</g>`,
  ].join("");
}
