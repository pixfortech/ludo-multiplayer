import { describe, it, expect } from "vitest";
import type { PlayerColor, Token, TokenState } from "../../types";
import {
  TRACK,
  HOME_LANES,
  START_OFFSETS,
  START_ABS,
  SAFE_ABS,
  FINISH,
  BASE_SLOTS,
  GRID,
  tokenCoord,
  type Coord,
} from "./boardLayout";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];

function tok(color: PlayerColor, state: TokenState, position: number, id = 0): Token {
  return { id, color, state, position };
}

const key = (c: Coord) => `${c.row},${c.col}`;
const manhattan = (a: Coord, b: Coord) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
const chebyshev = (a: Coord, b: Coord) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));

// The four 6×6 base corners (rows/cols inclusive) and the 3×3 centre finish.
function inBase(c: Coord): boolean {
  const tl = c.row <= 5 && c.col <= 5;
  const tr = c.row <= 5 && c.col >= 9;
  const bl = c.row >= 9 && c.col <= 5;
  const br = c.row >= 9 && c.col >= 9;
  return tl || tr || bl || br;
}
function inCentre(c: Coord): boolean {
  return c.row >= 6 && c.row <= 8 && c.col >= 6 && c.col <= 8;
}

describe("Shared track geometry", () => {
  it("has exactly 52 cells", () => {
    expect(TRACK.length).toBe(52);
  });

  it("every track coordinate is unique", () => {
    const seen = new Set(TRACK.map(key));
    expect(seen.size).toBe(52);
  });

  it("every track cell is on the 15×15 grid", () => {
    for (const c of TRACK) {
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(GRID);
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(GRID);
    }
  });

  it("no track cell sits inside a base corner or the centre finish", () => {
    for (const c of TRACK) {
      expect(inBase(c)).toBe(false);
      expect(inCentre(c)).toBe(false);
    }
  });

  it("consecutive cells (incl. the 51→0 wrap) are always adjacent", () => {
    for (let i = 0; i < 52; i++) {
      const a = TRACK[i];
      const b = TRACK[(i + 1) % 52];
      // Chebyshev 1 = orthogonally OR diagonally adjacent (never a jump).
      expect(chebyshev(a, b)).toBe(1);
    }
  });

  it("has exactly 4 diagonal corner-cuts (the inner cross corners)", () => {
    let diagonals = 0;
    for (let i = 0; i < 52; i++) {
      const a = TRACK[i];
      const b = TRACK[(i + 1) % 52];
      if (manhattan(a, b) === 2) diagonals++;
    }
    expect(diagonals).toBe(4);
  });
});

describe("Start cells", () => {
  it("START_OFFSETS index the START_ABS start squares", () => {
    for (const [absStr, color] of Object.entries(START_ABS)) {
      expect(START_OFFSETS[color]).toBe(Number(absStr));
    }
  });

  it("each colour starts on the visually-correct cell", () => {
    expect(TRACK[START_OFFSETS.red]).toEqual({ row: 6, col: 1 });
    expect(TRACK[START_OFFSETS.blue]).toEqual({ row: 1, col: 8 });
    expect(TRACK[START_OFFSETS.green]).toEqual({ row: 8, col: 13 });
    expect(TRACK[START_OFFSETS.yellow]).toEqual({ row: 13, col: 6 });
  });

  it("starts are spaced one quarter-loop (13 cells) apart", () => {
    expect(START_OFFSETS.yellow - START_OFFSETS.red).toBe(13);
    expect(START_OFFSETS.green - START_OFFSETS.yellow).toBe(13);
    expect(START_OFFSETS.blue - START_OFFSETS.green).toBe(13);
  });
});

describe("Safe / star cells", () => {
  it("there are exactly 8 safe cells", () => {
    expect(SAFE_ABS.size).toBe(8);
  });

  // This literal MUST equal the server's SAFE_CELLS (boardConfig.ts).
  it("matches the canonical safe-cell set", () => {
    expect([...SAFE_ABS].sort((a, b) => a - b)).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
  });

  it("includes all four start cells", () => {
    for (const color of COLORS) {
      expect(SAFE_ABS.has(START_OFFSETS[color])).toBe(true);
    }
  });

  it("the four star cells are exactly 8 steps after each start", () => {
    for (const color of COLORS) {
      expect(SAFE_ABS.has((START_OFFSETS[color] + 8) % 52)).toBe(true);
    }
  });
});

describe("Home lanes", () => {
  it("each colour has 6 home-lane cells", () => {
    for (const color of COLORS) expect(HOME_LANES[color]).toHaveLength(6);
  });

  it("home-lane cells are unique within each colour", () => {
    for (const color of COLORS) {
      const seen = new Set(HOME_LANES[color].map(key));
      expect(seen.size).toBe(6);
    }
  });

  it("each colour's lane runs from the arm edge inward to the centre", () => {
    // Last lane cell (local 57) must be orthogonally adjacent to the centre.
    for (const color of COLORS) {
      const last = HOME_LANES[color][5];
      const reachesCentre =
        (last.row === 7 && (last.col === 6 || last.col === 8)) ||
        (last.col === 7 && (last.row === 6 || last.row === 8));
      expect(reachesCentre).toBe(true);
    }
  });

  it("lanes sit on the expected arm middle-line", () => {
    expect(HOME_LANES.red[0]).toEqual({ row: 7, col: 1 });   // left arm
    expect(HOME_LANES.blue[0]).toEqual({ row: 1, col: 7 });  // top arm
    expect(HOME_LANES.green[0]).toEqual({ row: 7, col: 13 }); // right arm
    expect(HOME_LANES.yellow[0]).toEqual({ row: 13, col: 7 }); // bottom arm
  });
});

describe("tokenCoord mapping", () => {
  it("base tokens rest in their colour's base slots", () => {
    for (const color of COLORS) {
      for (let id = 0; id < 4; id++) {
        expect(tokenCoord(color, tok(color, "base", -1, id))).toEqual(BASE_SLOTS[color][id]);
      }
    }
  });

  it("position 0 maps to the colour's start cell", () => {
    for (const color of COLORS) {
      expect(tokenCoord(color, tok(color, "active", 0))).toEqual(TRACK[START_OFFSETS[color]]);
    }
  });

  it("position 51 maps to the last shared-track cell before the home lane", () => {
    for (const color of COLORS) {
      const expected = TRACK[(START_OFFSETS[color] + 51) % 52];
      expect(tokenCoord(color, tok(color, "active", 51))).toEqual(expected);
    }
  });

  it("position 52 maps to the first home-lane cell for every colour", () => {
    for (const color of COLORS) {
      expect(tokenCoord(color, tok(color, "active", 52))).toEqual(HOME_LANES[color][0]);
    }
  });

  it("position 57 maps to the last home-lane cell", () => {
    for (const color of COLORS) {
      expect(tokenCoord(color, tok(color, "active", 57))).toEqual(HOME_LANES[color][5]);
    }
  });

  it("position 58 / home state maps to the centre finish", () => {
    for (const color of COLORS) {
      expect(tokenCoord(color, tok(color, "home", 58))).toEqual(FINISH[color]);
    }
  });
});
