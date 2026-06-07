import type { GameState, PlayerColor, Token } from "../types";
import TokenComponent from "./Token";
import { colorTokens, COLOR_LABEL } from "../theme";

/**
 * Functional board placeholder: tokens grouped per player by state, with clear
 * click targets for selection. All movement logic remains server-authoritative.
 * The full polygon Ludo board is a later UI batch — this is styled to look
 * premium inside the room layout in the meantime.
 */

interface Props {
  gameState: GameState;
  myColor: PlayerColor;
  onMoveToken: (tokenId: number) => void;
}

export default function LudoBoard({ gameState, myColor, onMoveToken }: Props) {
  const current = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = gameState.phase === "playing" && current?.color === myColor;

  function isSelectable(token: Token): boolean {
    if (!isMyTurn || !gameState.diceRolled || gameState.diceValue === null) return false;
    if (token.state === "home") return false;
    if (token.state === "base") return gameState.diceValue === 6;
    return token.position + gameState.diceValue <= 58;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Status banner */}
      <div className="mb-4 flex items-center justify-center">
        {gameState.phase === "playing" && current && (
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${colorTokens(current.color).soft} ${colorTokens(current.color).text}`}
          >
            {current.color === myColor
              ? "Your turn"
              : `${COLOR_LABEL[current.color]}'s turn`}
          </span>
        )}
        {gameState.phase === "finished" && gameState.winner && (
          <span className="rounded-full bg-amber-400/15 px-4 py-1.5 text-sm font-bold text-amber-200">
            🏆 {COLOR_LABEL[gameState.winner]} wins!
          </span>
        )}
      </div>

      {/* Per-player token groups */}
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        {gameState.players.map((player) => {
          const c = colorTokens(player.color);
          const isCurrent = player.id === current?.id;
          return (
            <div
              key={player.id}
              className={`rounded-2xl border p-3.5 transition-all ${c.soft} ${
                isCurrent ? `${c.border} ring-1 ${c.ring}` : "border-white/10"
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-3.5 w-3.5 rounded-full ${c.solid}`} />
                <span className="text-xs font-bold">
                  {COLOR_LABEL[player.color]}
                  {player.color === myColor && (
                    <span className="ml-1 font-normal text-slate-400">(you)</span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {player.tokens.map((token) => (
                  <div key={token.id} className="flex flex-col items-center gap-1">
                    <TokenComponent
                      token={token}
                      selectable={player.color === myColor && isSelectable(token)}
                      onSelect={onMoveToken}
                    />
                    <span className="text-[9px] font-medium text-slate-500">
                      {token.state === "base"
                        ? "base"
                        : token.state === "home"
                          ? "home"
                          : token.position}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {isMyTurn && gameState.diceRolled && (
        <p className="mt-4 text-center text-xs font-medium text-emerald-300">
          Tap a highlighted token to move it
        </p>
      )}
    </div>
  );
}
