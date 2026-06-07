import { useState, useEffect, useRef } from "react";
import { socket } from "../socket";
import type { GameState, PlayerColor, Player } from "../types";
import ClassicLudoBoard from "../components/board/ClassicLudoBoard";
import PlayerPanel from "../components/PlayerPanel";
import Dice from "../components/Dice";
import { Button, Card, Badge, StatusDot, Toast, FullscreenToggle } from "../components/ui";
import { colorTokens, COLOR_LABEL } from "../theme";
import { getPlayerId } from "../identity";

// Keep the roll animation visible for at least this long, then clear it as soon
// as the authoritative state arrives. A hard cap stops it ever sticking.
const MIN_ROLL_MS = 450;
const ROLL_SAFETY_MS = 2500;

interface Props {
  roomId: string;
  myColor: PlayerColor;
  notice?: string;   // one-off info shown on entry (e.g. colour reassignment)
  onLeave: () => void;
}

export default function GameRoom({ roomId, myColor, notice = "", onLeave }: Props) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [message, setMessage] = useState("");      // errors / game-over
  const [turnMsg, setTurnMsg] = useState(notice);  // turn-transition / entry info
  const [copied, setCopied] = useState(false);
  const [rolling, setRolling] = useState(false);  // local animation while awaiting server
  const [newTurnColor, setNewTurnColor] = useState<PlayerColor | null>(null);

  // Track previous currentPlayerIndex to detect turn advances.
  const prevIndexRef = useRef<number | null>(null);
  // Keep onLeave reachable from listeners registered once on mount.
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  // Mirror of gameState for use inside mount-only listeners.
  const gameStateRef = useRef<GameState | null>(null);
  // A roll we've sent and are waiting on; cleared by the next authoritative state.
  const pendingRollRef = useRef(false);
  const rollStartRef = useRef(0);
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopRollingSoon() {
    const elapsed = Date.now() - rollStartRef.current;
    const wait = Math.max(0, MIN_ROLL_MS - elapsed);
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => setRolling(false), wait);
  }

  function stopRollingNow() {
    pendingRollRef.current = false;
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    setRolling(false);
  }

  useEffect(() => {
    const playerId = getPlayerId();

    // Re-attach this (possibly new) socket to our durable player on every
    // connect. This is what lets the turn keep flowing after a reconnect: the
    // server re-maps socket.id → playerId, so our rolls/moves stop being
    // silently rejected as "not the current player".
    const reattach = () => {
      socket.emit("resume", roomId, playerId);
      socket.emit("requestState");
    };

    socket.on("gameStateUpdate", setGameState);
    socket.on("connect", reattach);
    // A rejected roll must never leave the dice stuck spinning.
    socket.on("error", (msg) => {
      stopRollingNow();
      setMessage(msg);
      // A resume that can't find the room/player means the session is gone
      // (e.g. server restarted) — return home cleanly instead of a dead board.
      if (/not found/i.test(msg) && !gameStateRef.current) onLeaveRef.current();
    });
    socket.on("gameOver", (winner) => setMessage(`${COLOR_LABEL[winner]} wins! 🎉`));

    reattach();

    return () => {
      socket.off("gameStateUpdate");
      socket.off("connect", reattach);
      socket.off("error");
      socket.off("gameOver");
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to incoming game state: stop rolling animation, detect turn change.
  useEffect(() => {
    gameStateRef.current = gameState;
    if (!gameState) return;

    // The server resolved our roll the moment any fresh state arrives — whether
    // it produced a move, a 6, an auto-pass (diceValue reset to null), or a
    // three-six forfeit. Clear the local animation regardless of diceValue.
    if (pendingRollRef.current) {
      pendingRollRef.current = false;
      stopRollingSoon();
    }

    const prev = prevIndexRef.current;
    const curr = gameState.currentPlayerIndex;

    if (prev !== null && prev !== curr && gameState.phase === "playing") {
      const newPlayer = gameState.players[curr];
      if (newPlayer) {
        // Flash the new player's card.
        setNewTurnColor(newPlayer.color);
        setTimeout(() => setNewTurnColor(null), 900);

        // Spell out *why* the turn moved when the server auto-advanced.
        const action = gameState.lastAction ?? "";
        const nextName = COLOR_LABEL[newPlayer.color];
        if (action.includes("no legal moves")) {
          setTurnMsg(`No legal moves — ${nextName}'s turn`);
        } else if (action.includes("forfeited")) {
          setTurnMsg(`Three 6s forfeited — ${nextName}'s turn`);
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

  // Dice display: show the actionable dice when a move is pending, otherwise the
  // last rolled number (kept by the server across turn-advance) so the die never
  // goes blank right after a roll. Blank only before the first roll of the game.
  const currentColor = gameState?.players[gameState.currentPlayerIndex]?.color ?? null;
  const currentName = currentColor ? COLOR_LABEL[currentColor] : "";
  const displayValue = gameState ? gameState.diceValue ?? gameState.lastRollValue : null;
  const movePending = gameState !== null && gameState.diceRolled && gameState.diceValue !== null;

  function handleRollDice() {
    if (!isMyTurn || gameState?.diceRolled || rolling) return;
    pendingRollRef.current = true;
    rollStartRef.current = Date.now();
    setRolling(true);
    socket.emit("rollDice");
    // Last-resort safety: never let the animation hang if no state/error returns.
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(stopRollingNow, ROLL_SAFETY_MS);
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
  const playing = gameState !== null && !isWaiting;

  // Playing view is pinned to the viewport on desktop (board fits with no page
  // scroll); the lobby keeps natural flow and a narrower column.
  const shell = playing
    ? "max-w-[88rem] min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden"
    : "max-w-3xl min-h-[100dvh]";

  return (
    <div className={`mx-auto flex w-full flex-col gap-3 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3 ${shell}`}>
      {/* Header */}
      <Card className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="font-display text-lg font-extrabold tracking-tight sm:text-xl">Ludo</span>
          <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 sm:px-3">
            <span className="hidden text-[11px] uppercase tracking-wide text-slate-400 sm:inline">Room</span>
            <span className="font-mono text-xs font-bold tracking-widest sm:text-sm">{roomId}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
            {joined}/{maxP}
          </span>
          {myPlayer && <StatusDot connected={myPlayer.connected} />}
          <FullscreenToggle />
          <Button variant="ghost" className="px-2.5 py-2 text-rose-300 sm:px-3" onClick={handleLeave}>
            Leave
          </Button>
        </div>
      </Card>

      {/* Floating toast stack — overlays content instead of shifting it. */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-3">
        {message && (
          <div className="pointer-events-auto">
            <Toast
              kind={message.includes("wins") ? "success" : "error"}
              onDismiss={() => setMessage("")}
            >
              {message}
            </Toast>
          </div>
        )}
        {turnMsg && (
          <div className="pointer-events-auto">
            <Toast kind="info" onDismiss={() => setTurnMsg("")}>
              {turnMsg}
            </Toast>
          </div>
        )}
      </div>

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

      {/* Active / finished game.
          Mobile: single column (board → dice → players), page scrolls if needed.
          Desktop (lg+): board column + sidebar fill the remaining viewport height,
          with the square board capped by available height so it never overflows. */}
      {playing && gameState && (
        <div className="flex min-h-0 flex-1 animate-fade-in-up flex-col gap-3 sm:gap-4 lg:grid lg:h-full lg:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_clamp(280px,24vw,340px)]">
          {/* Board area — square, bounded by viewport height (not just width). */}
          <div className="flex min-h-0 min-w-0 justify-center lg:items-center">
            <div className="aspect-square w-full max-w-[68dvh] lg:max-w-[calc(100dvh-7rem)]">
              <Card className="flex h-full w-full items-center justify-center p-2 sm:p-3">
                <ClassicLudoBoard
                  gameState={gameState}
                  myColor={myColor}
                  onMoveToken={handleMoveToken}
                />
              </Card>
            </div>
          </div>

          {/* Controls — dice + player panels. Scrolls internally only if it can't fit. */}
          <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-0.5">
            <Dice
              displayValue={displayValue}
              pending={movePending}
              canRoll={isMyTurn && !gameState.diceRolled}
              isMyTurn={isMyTurn}
              rolling={rolling}
              isSix={isSix}
              currentName={currentName}
              lastAction={gameState.lastAction}
              onRoll={handleRollDice}
            />
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
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
          <span className="truncate font-bold">{player.name}</span>
          {isMe && <span className="text-xs text-slate-400">(you)</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
          <StatusDot connected={player.connected} />
          <span className={c.text}>{COLOR_LABEL[player.color]}</span>
          <span className="text-slate-600">·</span>
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
