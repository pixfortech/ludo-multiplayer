// Where each token is drawn, including stacks. Pure and renderer-agnostic:
// positions come from the layout (geometry.ts); stacking follows the token
// spec (docs/design/token-design.md): one token at 0.82 × cell, two offset
// ±18% diagonally at 0.72, three or four in a 2 × 2 cluster at 0.6, more in
// a 3 × 3 grid with a count badge. Mixed colours are ordered by seat.

import { CLASSIC_FINISH_STEP, cellKey } from "@ludo/board-layouts";
import { CELL, baseSlotPoint, cellCentre, stepCell, type Point } from "./geometry";

export interface BoardTokenInput {
  playerId: string;
  seat: number;
  tokenId: number;
  /** null = in base; 0–50 track; 51–55 home lane; 56 finished. */
  step: number | null;
}

export interface TokenPlacement extends BoardTokenInput, Point {
  key: string;
  /** Drawn diameter in SVG units. */
  size: number;
  /** Tokens sharing this cell (1 when alone or in base). */
  stackSize: number;
  /** Position within the stack, in draw order. */
  stackIndex: number;
  finished: boolean;
}

export const TOKEN_SCALE = 0.82;
const FINISHED_SCALE = 0.72;

export const tokenKey = (playerId: string, tokenId: number): string => `${playerId}:${tokenId}`;

function stackOffsets(n: number): { offsets: Point[]; scale: number } {
  if (n <= 1) return { offsets: [{ x: 0, y: 0 }], scale: 1 };
  if (n === 2) {
    const d = CELL * 0.18;
    return { offsets: [{ x: -d, y: -d }, { x: d, y: d }], scale: 0.72 / TOKEN_SCALE };
  }
  if (n <= 4) {
    const d = CELL * 0.22;
    return { offsets: [{ x: -d, y: -d }, { x: d, y: -d }, { x: -d, y: d }, { x: d, y: d }], scale: 0.6 / TOKEN_SCALE };
  }
  const d = CELL * 0.29;
  const grid = [-d, 0, d].flatMap((y) => [-d, 0, d].map((x) => ({ x, y })));
  return { offsets: grid, scale: 0.42 / TOKEN_SCALE };
}

export function placeTokens(tokens: readonly BoardTokenInput[]): TokenPlacement[] {
  const base = CELL * TOKEN_SCALE;
  const placed: TokenPlacement[] = [];
  const groups = new Map<string, BoardTokenInput[]>();
  for (const token of tokens) {
    const cell = stepCell(token.seat, token.step);
    if (!cell) {
      const at = baseSlotPoint(token.seat, token.tokenId);
      placed.push({ ...token, ...at, key: tokenKey(token.playerId, token.tokenId), size: base, stackSize: 1, stackIndex: 0, finished: false });
      continue;
    }
    const key = cellKey(cell);
    groups.set(key, [...(groups.get(key) ?? []), token]);
  }
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.seat - b.seat || a.tokenId - b.tokenId);
    const centre = cellCentre(stepCell(ordered[0]!.seat, ordered[0]!.step)!);
    const { offsets, scale } = stackOffsets(ordered.length);
    ordered.forEach((token, i) => {
      const finished = token.step === CLASSIC_FINISH_STEP;
      const o = offsets[i % offsets.length]!;
      placed.push({
        ...token,
        x: centre.x + o.x,
        y: centre.y + o.y,
        key: tokenKey(token.playerId, token.tokenId),
        size: base * scale * (finished && ordered.length === 1 ? FINISHED_SCALE : 1),
        stackSize: ordered.length,
        stackIndex: i,
        finished,
      });
    });
  }
  return placed;
}
