import { useState, useEffect } from "react";
import { socket } from "../socket";
import type { GameState, PlayerColor } from "../types";
import LudoBoard from "../components/LudoBoard";
import PlayerPanel from "../components/PlayerPanel";
import Dice from "../components/Dice";

interface Props {
  roomId: string;
  myColor: PlayerColor;
  onLeave: () => void;
}

export default function GameRoom({ roomId, myColor, onLeave }: Props) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    socket.on("gameStateUpdate", setGameState);
    socket.on("error", (msg) => setMessage(msg));
    socket.on("gameOver", (winner) => setMessage(`${winner.toUpperCase()} wins!`));

    // Listeners are attached — ask the server for the authoritative snapshot
    // so we never miss the initial broadcast (fixes the mount race).
    socket.emit("requestState");

    return () => {
      socket.off("gameStateUpdate");
      socket.off("error");
      socket.off("gameOver");
    };
  }, []);

  const myPlayer = gameState?.players.find((p) => p.color === myColor);
  const isHost = myPlayer !== undefined && myPlayer.id === gameState?.hostId;
  const isMyTurn =
    gameState !== null &&
    gameState.phase === "playing" &&
    gameState.players[gameState.currentPlayerIndex]?.color === myColor;

  function handleRollDice() {
    if (isMyTurn && !gameState?.diceRolled) socket.emit("rollDice");
  }

  function handleMoveToken(tokenId: number) {
    if (isMyTurn && gameState?.diceRolled) socket.emit("moveToken", tokenId);
  }

  function handleStartGame() {
    socket.emit("startGame");
  }

  function handleLeave() {
    socket.emit("leaveRoom");
    onLeave();
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-4 gap-4">
      <div className="flex justify-between w-full max-w-4xl">
        <h2 className="text-xl font-bold">Room: {roomId}</h2>
        <button className="text-red-400 hover:text-red-300 text-sm" onClick={handleLeave}>
          Leave
        </button>
      </div>

      {message && (
        <div className="bg-yellow-600 text-black font-semibold px-4 py-2 rounded">
          {message}
        </div>
      )}

      {gameState?.phase === "waiting" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-gray-400">
            {gameState.players.length} / {gameState.maxPlayers} players joined. Waiting…
          </p>
          {isHost ? (
            <button
              className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleStartGame}
              disabled={gameState.players.length < 2}
            >
              {gameState.players.length < 2 ? "Waiting for players…" : "Start Game"}
            </button>
          ) : (
            <p className="text-gray-500 text-sm">Waiting for the host to start…</p>
          )}
        </div>
      )}

      {gameState && (
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-4xl">
          <LudoBoard gameState={gameState} myColor={myColor} onMoveToken={handleMoveToken} />
          <div className="flex flex-col gap-4">
            {gameState.players.map((p) => (
              <PlayerPanel
                key={p.id}
                player={p}
                isActive={gameState.players[gameState.currentPlayerIndex]?.id === p.id}
                isMe={p.color === myColor}
              />
            ))}
            <Dice
              value={gameState.diceValue}
              canRoll={isMyTurn && !gameState.diceRolled}
              onRoll={handleRollDice}
            />
          </div>
        </div>
      )}
    </div>
  );
}
