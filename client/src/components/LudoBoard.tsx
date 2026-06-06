import type { GameState, PlayerColor, Token } from "../types";
import TokenComponent from "./Token";

/**
 * Minimal functional board: shows each player's tokens grouped by state.
 * A proper SVG/canvas board with cell-by-cell positions is Phase 2.
 * This shell lets the game be played (all logic is server-side) and
 * gives clear click targets for token selection.
 */

interface Props {
  gameState: GameState;
  myColor: PlayerColor;
  onMoveToken: (tokenId: number) => void;
}

const SECTION_BG: Record<string, string> = {
  red: "bg-red-900/40",
  blue: "bg-blue-900/40",
  green: "bg-green-900/40",
  yellow: "bg-yellow-900/40",
};

export default function LudoBoard({ gameState, myColor, onMoveToken }: Props) {
  const isMyTurn =
    gameState.phase === "playing" &&
    gameState.players[gameState.currentPlayerIndex]?.color === myColor;

  const myPlayer = gameState.players.find((p) => p.color === myColor);

  function isSelectable(token: Token): boolean {
    if (!isMyTurn || !gameState.diceRolled || gameState.diceValue === null) return false;
    if (token.state === "home") return false;
    if (token.state === "base") return gameState.diceValue === 6;
    return token.position + gameState.diceValue <= 58;
  }

  return (
    <div className="flex-1 bg-gray-800 rounded-xl p-4">
      <h3 className="text-center text-sm text-gray-400 mb-4">
        {gameState.phase === "waiting" && "Waiting for players…"}
        {gameState.phase === "playing" &&
          `${gameState.players[gameState.currentPlayerIndex]?.color?.toUpperCase()}'s turn`}
        {gameState.phase === "finished" && `${gameState.winner?.toUpperCase()} wins!`}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {gameState.players.map((player) => (
          <div key={player.id} className={`${SECTION_BG[player.color]} rounded-lg p-3`}>
            <p className="text-xs font-medium capitalize mb-2">
              {player.color} {player.color === myColor ? "(you)" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {player.tokens.map((token) => (
                <div key={token.id} className="flex flex-col items-center gap-0.5">
                  <TokenComponent
                    token={token}
                    selectable={player.color === myColor && isSelectable(token)}
                    onSelect={onMoveToken}
                  />
                  <span className="text-[9px] text-gray-400">
                    {token.state === "base" ? "B" : token.state === "home" ? "H" : token.position}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isMyTurn && gameState.diceRolled && myPlayer && (
        <p className="text-center text-xs text-green-400 mt-3">
          Click a highlighted token to move it
        </p>
      )}
    </div>
  );
}
