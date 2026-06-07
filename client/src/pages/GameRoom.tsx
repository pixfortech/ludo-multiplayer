import { useState, useEffect, useRef } from "react";
import { socket } from "../socket";
import type { GameState, PlayerColor, Player } from "../types";
import ClassicLudoBoard from "../components/board/ClassicLudoBoard";
import PlayerPanel from "../components/PlayerPanel";
import Dice from "../components/Dice";
import { Button, Card, Badge, StatusDot, Toast } from "../components/ui";
import { colorTokens, COLOR_LABEL } from "../theme";

interface Props {
  roomId: string;
  myColor: PlayerColor;
  onLeave: () => void;
}

export default function GameRoom({ roomId, myColor, onLeave }: Props) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [message, setMessage] = useState("");      // errors / game-over
  const [turnMsg, setTurnMsg] = useState("");      // turn-transition info
  const [copied, setCopied] = useState(false);
  const [rolling, setRolling] = useState(false);  // local animation while awaiting server
  const [newTurnColor, setNewTurnColor] = useState<PlayerColor | null>(null);

  // Track previous currentPlayerIndex to detect turn advances.
  const prevIndexRef = useRef<number | null>(null);

  useEffect(() => {
    socket.on("gameStateUpdate", setGameState);
    socket.on("error", (msg) => setMessage(msg));
    socket.on("gameOver", (winner) => setMessage(`${COLOR_LABEL[winner]} wins! 🎉`));
    socket.emit("requestState");
    return () => {
      socket.off("gameStateUpdate");
      socket.off("error");
      socket.off("gameOver");
    };
  }, []);

  // React to incoming game state: stop rolling animation, detect turn change.
  useEffect(() => {
    if (!gameState) return;

    // Stop rolling animation once dice value arrives.
    if (rolling && gameState.diceValue !== null) {
      setRolling(false);
    }

    const prev = prevIndexRef.current;
    const curr = gameState.currentPlayerIndex;

    if (prev !== null && prev !== curr && gameState.phase === "playing") {
      const newPlayer = gameState.players[curr];
      if (newPlayer) {
        // Flash the new player's card.
        setNewTurnColor(newPlayer.color);
        setTimeout(() => setNewTurnColor(null), 900);

        // Show a prominent turn-pass message when the server auto-advanced.
        if (gameState.lastAction?.includes("turn passes") || gameState.lastAction?.includes("turn forfeited")) {
          const nextName = COLOR_LABEL[newPlayer.color];
          setTurnMsg(`Turn passed to ${nextName}`);
        }
      }
    }

    prevIndexRef.current = curr;
  }, [gameState]);

  // Auto-dismiss toast messages.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (!turnMsg) return;
    const t = setTimeout(() => setTurnMsg(""), 2800);
    return () => clearTimeout(t);
  }, [turnMsg]);

  const myPlayer = gameState?.players.find((p) => p.color === myColor);
  const isHost = myPlayer !== undefined && myPlayer.id === gameState?.hostId;
  const isMyTurn =
    gameState !== null &&
    gameState.phase === "playing" &&
    gameState.players[gameState.currentPlayerIndex]?.color === myColor;

  const isSix =
    gameState?.diceValue === 6 &&
    gameState.diceRolled === true &&
    gameState.phase === "playing";

  function handleRollDice() {
    if (isMyTurn && !gameState?.diceRolled && !rolling) {
      setRolling(true);
      socket.emit("rollDice");
      // Safety: cancel local animation after 2.5 s if server doesn't respond.
      setTimeout(() => setRolling(false), 2500);
    }
  }

  function handleMoveToken(tokenId: number) {
    if (isMyTurn && gameState?.diceRolled) socket.emit("moveToken", tokenId);
  }

  function handleLeave() {
    socket.emit("leaveRoom");
    onLeave();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("Couldn't copy — copy the code manually.");
    }
  }

  const joined = gameState?.players.length ?? 0;
  const maxP = gameState?.maxPlayers ?? 0;
  const isWaiting = gameState?.phase === "waiting";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-5">
      {/* Header */}
      <Card className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-xl font-extrabold tracking-tight">Ludo</span>
          <div className="hidden items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 sm:flex">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Room</span>
            <span className="font-mono text-sm font-bold tracking-widest">{roomId}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
            {joined}/{maxP}
          </span>
          {myPlayer && <StatusDot connected={myPlayer.connected} />}
          <Button variant="ghost" className="px-3 py-2 text-rose-300" onClick={handleLeave}>
            Leave
          </Button>
        </div>
      </Card>

      {/* Error / game-over toast */}
      {message && (
        <Toast
          kind={message.includes("wins") ? "success" : "error"}
          onDismiss={() => setMessage("")}
        >
          {message}
        </Toast>
      )}

      {/* Turn-pass info toast */}
      {turnMsg && (
        <Toast kind="info" onDismiss={() => setTurnMsg("")}>
          {turnMsg}
        </Toast>
      )}

      {/* Waiting / lobby */}
      {isWaiting && gameState && (
        <Lobby
          roomId={roomId}
          players={gameState.players}
          maxPlayers={maxP}
          hostId={gameState.hostId}
          myColor={myColor}
          isHost={isHost}
          copied={copied}
          onCopy={copyCode}
          onStart={() => socket.emit("startGame")}
        />
      )}

      {/* Active / finished game */}
      {gameState && !isWaiting && (
        <div className="grid animate-fade-in-up gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="p-4 sm:p-5">
            <ClassicLudoBoard
              gameState={gameState}
              myColor={myColor}
              onMoveToken={handleMoveToken}
            />
          </Card>

          <div className="flex flex-col gap-3">
            <Dice
              diceValue={gameState.diceValue}
              canRoll={isMyTurn && !gameState.diceRolled}
              isMyTurn={isMyTurn}
              rolling={rolling}
              isSix={isSix}
              lastAction={gameState.lastAction}
              onRoll={handleRollDice}
            />
            <div className="flex flex-col gap-2.5">
              {gameState.players.map((p) => (
                <PlayerPanel
                  key={p.id}
                  player={p}
                  isActive={gameState.players[gameState.currentPlayerIndex]?.id === p.id}
                  isMe={p.color === myColor}
                  isHost={p.id === gameState.hostId}
                  isNewTurn={newTurnColor === p.color}
                  isSix={isSix}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lobby (unchanged structure, no new logic) ─────────────────────────────────

interface LobbyProps {
  roomId: string;
  players: Player[];
  maxPlayers: number;
  hostId: string;
  myColor: PlayerColor;
  isHost: boolean;
  copied: boolean;
  onCopy: () => void;
  onStart: () => void;
}

function Lobby({ roomId, players, maxPlayers, hostId, myColor, isHost, copied, onCopy, onStart }: LobbyProps) {
  const emptySlots = Math.max(0, maxPlayers - players.length);
  const canStart = players.length >= 2;

  return (
    <div className="flex animate-fade-in-up flex-col gap-4">
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Share this room code
        </span>
        <div className="font-mono text-5xl font-extrabold tracking-[0.3em] text-white">{roomId}</div>
        <Button variant="secondary" onClick={onCopy} className="px-4 py-2">
          {copied ? "Copied ✓" : "Copy code"}
        </Button>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">Players</h2>
          <span className="text-xs font-semibold text-slate-400">{players.length}/{maxPlayers} joined</span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {players.map((p) => (
            <PlayerSlot key={p.id} player={p} isHost={p.id === hostId} isMe={p.color === myColor} />
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <EmptySlot key={`empty-${i}`} />
          ))}
        </div>
      </Card>

      <div className="flex flex-col items-center gap-2">
        {isHost ? (
          <Button
            variant="success"
            fullWidth
            disabled={!canStart}
            onClick={onStart}
            className="max-w-sm py-4 text-base"
          >
            {canStart ? "Start game" : "Waiting for players…"}
          </Button>
        ) : (
          <p className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-400">
            Waiting for the host to start the game…
          </p>
        )}
      </div>
    </div>
  );
}

function PlayerSlot({ player, isHost, isMe }: { player: Player; isHost: boolean; isMe: boolean }) {
  const c = colorTokens(player.color);
  return (
    <div className={`flex items-center gap-3 rounded-2xl border ${c.border} ${c.soft} px-3.5 py-3`}>
      <span className={`h-8 w-8 shrink-0 rounded-full ${c.solid} shadow-lg ${c.glow}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-bold">{COLOR_LABEL[player.color]}</span>
          {isMe && <span className="text-xs text-slate-400">(you)</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
          <StatusDot connected={player.connected} />
          {player.connected ? "Connected" : "Reconnecting…"}
        </div>
      </div>
      {isHost && <Badge className="bg-amber-400/20 text-amber-200">★ Host</Badge>}
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-3.5 py-3 text-slate-600">
      <span className="h-8 w-8 shrink-0 rounded-full border-2 border-dashed border-white/15" />
      <span className="text-sm font-medium">Waiting for player…</span>
    </div>
  );
}
