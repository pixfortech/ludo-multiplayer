import { useEffect, useState } from "react";
import type { GameState, PlayerColor, Token } from "../../types";
import { PLAYER_COLORS } from "../../theme";
import BoardCell from "./BoardCell";
import BoardToken from "./BoardToken";
import SafeCellIcon from "./SafeCellIcon";
import {
  TRACK,
  HOME_LANES,
  BASE_SLOTS,
  BASE_CORNER,
  FINISH,
  SAFE_ABS,
  START_ABS,
  GRID,
  tokenCoord,
  cellKey,
  type Coord,
} from "./boardLayout";

interface Props {
  gameState: GameState;
  myColor: PlayerColor;
  onMoveToken: (tokenId: number) => void;
}

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];
const TOKEN_SIZE = 4.7; // diameter, % of board
const CELL = 100 / GRID;

// Small offsets so multiple tokens on one cell stay visible.
function stackOffset(index: number, total: number): { dx: number; dy: number } {
  if (total <= 1) return { dx: 0, dy: 0 };
  const r = CELL * 0.22;
  const angle = (index / total) * Math.PI * 2;
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

function pct(coord: Coord): { top: number; left: number } {
  return {
    top: (coord.row + 0.5) * CELL,
    left: (coord.col + 0.5) * CELL,
  };
}

export default function ClassicLudoBoard({ gameState, myColor, onMoveToken }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Selection is transient — clear it whenever fresh state arrives.
  useEffect(() => {
    setSelectedId(null);
  }, [gameState]);

  const current = gameState.players[gameState.currentPlayerIndex];
  const currentColor = current?.color ?? null;
  const isMyTurn = gameState.phase === "playing" && currentColor === myColor;

  function isSelectable(color: PlayerColor, token: Token): boolean {
    if (color !== myColor || !isMyTurn) return false;
    if (!gameState.diceRolled || gameState.diceValue === null) return false;
    if (token.state === "home") return false;
    if (token.state === "base") return gameState.diceValue === 6;
    return token.position + gameState.diceValue <= 58;
  }

  function handleClick(tokenId: number) {
    setSelectedId(tokenId);
    onMoveToken(tokenId);
  }

  // Build token render list, grouped per cell for stacking.
  const rendered = gameState.players.flatMap((p) =>
    p.tokens.map((t) => ({ player: p, token: t, coord: tokenCoord(p.color, t) }))
  );
  const groups = new Map<string, number>();
  const groupIndex = new Map<string, number>();
  for (const r of rendered) {
    const k = cellKey(r.coord);
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div className="relative aspect-square w-full rounded-2xl bg-slate-300 p-2 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        {/* Cell grid */}
        <div
          className="grid h-full w-full gap-[1.5px]"
          style={{
            gridTemplateColumns: `repeat(${GRID}, 1fr)`,
            gridTemplateRows: `repeat(${GRID}, 1fr)`,
          }}
        >
          {/* Bases */}
          {COLORS.map((color) => {
            const corner = BASE_CORNER[color];
            const isCurrent = color === currentColor;
            return (
              <BoardCell key={`base-${color}`} row={corner.row} col={corner.col} span={6}>
                <div
                  className={`flex h-full w-full items-center justify-center rounded-2xl transition-all ${
                    isCurrent ? "ring-4 ring-white/80" : ""
                  }`}
                  style={{ backgroundColor: PLAYER_COLORS[color].hex }}
                >
                  <div className="h-[62%] w-[62%] rounded-xl bg-white/85" />
                </div>
              </BoardCell>
            );
          })}

          {/* Centre finish — four triangles meeting at the middle */}
          <BoardCell row={6} col={6} span={3}>
            <svg viewBox="0 0 100 100" className="h-full w-full rounded-md">
              <polygon points="0,0 100,0 50,50" fill={PLAYER_COLORS.blue.hex} />
              <polygon points="100,0 100,100 50,50" fill={PLAYER_COLORS.green.hex} />
              <polygon points="100,100 0,100 50,50" fill={PLAYER_COLORS.yellow.hex} />
              <polygon points="0,100 0,0 50,50" fill={PLAYER_COLORS.red.hex} />
            </svg>
          </BoardCell>

          {/* Shared track */}
          {TRACK.map((coord, abs) => {
            const startColor = START_ABS[abs];
            const safe = SAFE_ABS.has(abs);
            return (
              <BoardCell
                key={`track-${abs}`}
                row={coord.row}
                col={coord.col}
                className={`rounded-[3px] ${startColor ? "" : "bg-white"}`}
              >
                {startColor ? (
                  <div
                    className="h-full w-full rounded-[3px]"
                    style={{ backgroundColor: PLAYER_COLORS[startColor].hex }}
                  />
                ) : safe ? (
                  <SafeCellIcon />
                ) : null}
              </BoardCell>
            );
          })}

          {/* Home lanes (rendered after centre so the inner cell paints on top) */}
          {COLORS.map((color) =>
            HOME_LANES[color].map((coord, i) => (
              <BoardCell key={`lane-${color}-${i}`} row={coord.row} col={coord.col} className="z-10 rounded-[3px]">
                <div
                  className="h-full w-full rounded-[3px]"
                  style={{ backgroundColor: PLAYER_COLORS[color].hex }}
                />
              </BoardCell>
            ))
          )}
        </div>

        {/* Token + base-slot overlay */}
        <div className="pointer-events-none absolute inset-2">
          {/* Faint resting slots inside each base */}
          {gameState.players.flatMap((p) =>
            BASE_SLOTS[p.color].map((slot, i) => {
              const { top, left } = pct(slot);
              return (
                <div
                  key={`slot-${p.color}-${i}`}
                  className="absolute rounded-full border-2 border-white/60"
                  style={{
                    top: `${top}%`,
                    left: `${left}%`,
                    width: `${TOKEN_SIZE + 0.6}%`,
                    height: `${TOKEN_SIZE + 0.6}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              );
            })
          )}

          {/* Tokens */}
          <div className="pointer-events-auto">
            {rendered.map(({ player, token, coord }) => {
              const k = cellKey(coord);
              const total = groups.get(k) ?? 1;
              const idx = groupIndex.get(k) ?? 0;
              groupIndex.set(k, idx + 1);
              const { dx, dy } = stackOffset(idx, total);
              const { top, left } = pct(coord);
              const selectable = isSelectable(player.color, token);
              return (
                <BoardToken
                  key={`${player.color}-${token.id}`}
                  color={player.color}
                  label={token.id + 1}
                  topPct={top + dy}
                  leftPct={left + dx}
                  sizePct={TOKEN_SIZE}
                  selectable={selectable}
                  selected={selectedId === token.id && player.color === myColor}
                  dim={gameState.phase === "playing" && player.color !== currentColor}
                  onClick={() => handleClick(token.id)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
