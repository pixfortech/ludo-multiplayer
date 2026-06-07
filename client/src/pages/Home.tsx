import { useState, useEffect } from "react";
import { socket, connect } from "../socket";
import { Button, Card, Toast } from "../components/ui";
import { PLAYER_PALETTE, PLAYABLE_COUNTS, MAX_VISUAL_PLAYERS } from "../theme";
import type { PlayerColor } from "../types";

interface Props {
  onRoomJoined: (roomId: string, color: PlayerColor) => void;
}

const PLAYABLE = new Set<number>(PLAYABLE_COUNTS);

export default function Home({ onRoomJoined }: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [error, setError] = useState("");

  useEffect(() => {
    connect();

    socket.on("roomJoined", ({ roomId, color }) => onRoomJoined(roomId, color));
    socket.on("error", (msg) => setError(msg));

    return () => {
      socket.off("roomCreated");
      socket.off("roomJoined");
      socket.off("error");
    };
  }, [onRoomJoined]);

  function handleCreate() {
    setError("");
    socket.emit("createRoom", maxPlayers);
  }

  function handleJoin() {
    setError("");
    if (joinCode.trim().length === 0) {
      setError("Enter a room code to join.");
      return;
    }
    socket.emit("joinRoom", joinCode.trim());
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-7 px-5 py-10 sm:max-w-lg">
      {/* Title */}
      <header className="animate-fade-in-up text-center">
        <div className="mb-3 flex justify-center gap-1.5">
          {PLAYER_PALETTE.slice(0, 4).map((hex) => (
            <span
              key={hex}
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <h1 className="bg-gradient-to-r from-rose-300 via-indigo-200 to-emerald-300 bg-clip-text font-display text-6xl font-extrabold tracking-tight text-transparent drop-shadow-sm sm:text-7xl">
          Ludo
        </h1>
        <p className="mt-2 text-sm font-medium text-slate-400">
          Roll, race, and bring every token home. Play with friends in real time.
        </p>
      </header>

      {error && (
        <Toast kind="error" onDismiss={() => setError("")}>
          {error}
        </Toast>
      )}

      {/* Create room */}
      <Card className="animate-fade-in-up p-6 [animation-delay:60ms]">
        <h2 className="mb-1 text-lg font-bold">Create a room</h2>
        <p className="mb-4 text-xs text-slate-400">
          Pick your table size and invite friends with the room code.
        </p>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Players
        </label>
        <div className="mb-5 flex flex-wrap gap-2">
          {Array.from({ length: MAX_VISUAL_PLAYERS - 1 }, (_, i) => i + 2).map(
            (n) => {
              const playable = PLAYABLE.has(n);
              const selected = playable && n === maxPlayers;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!playable}
                  onClick={() => playable && setMaxPlayers(n)}
                  title={playable ? `${n} players` : "Coming soon"}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold transition-all ${
                    selected
                      ? "scale-105 bg-indigo-500 text-white shadow-lg shadow-indigo-500/40"
                      : playable
                        ? "bg-white/10 text-white hover:bg-white/20"
                        : "cursor-not-allowed bg-white/[0.03] text-slate-600"
                  }`}
                >
                  {n}
                  {!playable && (
                    <span className="absolute -bottom-1.5 text-[7px] font-semibold uppercase tracking-wide text-slate-500">
                      soon
                    </span>
                  )}
                </button>
              );
            }
          )}
        </div>

        <Button variant="primary" fullWidth onClick={handleCreate}>
          Create room
        </Button>
      </Card>

      {/* Join room */}
      <Card className="animate-fade-in-up p-6 [animation-delay:120ms]">
        <h2 className="mb-1 text-lg font-bold">Join a room</h2>
        <p className="mb-4 text-xs text-slate-400">
          Got a code from a friend? Drop it in below.
        </p>

        <input
          className="mb-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-bold uppercase tracking-[0.4em] text-white placeholder:tracking-normal placeholder:text-slate-600 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
          placeholder="CODE"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          maxLength={6}
          inputMode="text"
          autoCapitalize="characters"
        />

        <Button variant="secondary" fullWidth onClick={handleJoin}>
          Join room
        </Button>
      </Card>

      <p className="pb-2 text-center text-[11px] text-slate-600">
        Server-authoritative · Real-time multiplayer
      </p>
    </main>
  );
}
