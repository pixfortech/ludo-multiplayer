// Player symbols: bold, closed shapes drawn in a 24×24 box with a 3-unit
// safe margin, recognisable at a 10 px rendered size. The same path data is
// used for 2D tokens, base plates, player chips, and (extruded or decal) on 3D
// tokens.
//
// Reserved glyphs NOT available as player symbols: the 5-point star (safe
// cells), arrows (direction / start), and the crown (winner).

export const SYMBOL_PATHS = {
  heart:
    "M12 20.3l-1.3-1.2C6.2 15 3.4 12.5 3.4 9.3c0-2.6 2-4.6 4.6-4.6 1.5 0 3 .7 4 1.9 1-1.2 2.5-1.9 4-1.9 2.6 0 4.6 2 4.6 4.6 0 3.2-2.8 5.7-7.3 9.8z",
  drop: "M12 3.2c3.7 4.6 6.3 8.1 6.3 11.1a6.3 6.3 0 0 1-12.6 0c0-3 2.6-6.5 6.3-11.1z",
  leaf: "M19.8 4.2C10.6 4.2 4.2 8.8 4.2 16.2c0 1.2.2 2.4.5 3.6C12.6 19.8 19.8 14 19.8 4.2z",
  bolt: "M13.8 2.8L5 13.6h5.6L9.6 21.2l9.4-11.6h-5.6z",
  crescent: "M14.5 3.6a8.6 8.6 0 1 0 5.9 13.9A7 7 0 0 1 14.5 3.6z",
  triangle: "M12 3.8l8.6 15.4H3.4z",
  diamond: "M12 3l9 9-9 9-9-9z",
  flower:
    "M12 3.6a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 1 0 0-7.4zM12 13a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 1 0 0-7.4zM7.3 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 1 0 0-7.4zM16.7 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 1 0 0-7.4z",
  plus: "M9.4 3.6h5.2v5.8h5.8v5.2h-5.8v5.8H9.4v-5.8H3.6V9.4h5.8z",
  hexagon: "M12 3.2l7.6 4.4v8.8L12 20.8l-7.6-4.4V7.6z",
  circle: "M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 1 0 0-15.6z",
  square: "M5 5h14v14H5z",
  cross:
    "M6.6 3.6L12 9l5.4-5.4 3 3L15 12l5.4 5.4-3 3L12 15l-5.4 5.4-3-3L9 12 3.6 6.6z",
  chevron: "M12 4.2l8.8 8.8-3.4 3.4L12 11 6.6 16.4l-3.4-3.4z",
  bars: "M4.2 4.8h15.6v3.6H4.2zM4.2 10.2h15.6v3.6H4.2zM4.2 15.6h15.6v3.6H4.2z",
} as const;

export type SymbolId = keyof typeof SYMBOL_PATHS;

export const SYMBOL_IDS = Object.keys(SYMBOL_PATHS) as SymbolId[];

/** 5-point star for safe cells (reserved; never a player symbol). */
export const SAFE_STAR_PATH =
  "M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z";
