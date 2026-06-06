import { useState, useEffect } from "react";
import { socket, connect } from "../socket";
import type { PlayerColor } from "../types";

interface Props {
  onRoomJoined: (roomId: string, color: PlayerColor) => void;
}

export default function Home({ onRoomJoined }: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [status, setStatus] = useState("");

  useEffect(() => {
    connect();

    socket.on("roomCreated", (roomId) => setStatus(`Room created: ${roomId}`));
    socket.on("roomJoined", ({ roomId, color }) => onRoomJoined(roomId, color));
    socket.on("error", (msg) => setStatus(`Error: ${msg}`));

    return () => {
      socket.off("roomCreated");
      socket.off("roomJoined");
      socket.off("error");
    };
  }, [onRoomJoined]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-4">
      <h1 className="text-5xl font-bold tracking-tight">Ludo Multiplayer</h1>

      <div className="flex flex-col gap-4 w-full max-w-sm bg-gray-800 p-6 rounded-xl">
        <h2 className="text-xl font-semibold">Create Room</h2>
        <label className="text-sm text-gray-300">
          Players
          <select
            className="block mt-1 w-full bg-gray-700 rounded p-2"
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>{n} players</option>
            ))}
          </select>
        </label>
        <button
          className="bg-indigo-600 hover:bg-indigo-700 rounded p-2 font-medium"
          onClick={() => socket.emit("createRoom", maxPlayers)}
        >
          Create Room
        </button>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm bg-gray-800 p-6 rounded-xl">
        <h2 className="text-xl font-semibold">Join Room</h2>
        <input
          className="bg-gray-700 rounded p-2 uppercase tracking-widest"
          placeholder="Room code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
        />
        <button
          className="bg-green-600 hover:bg-green-700 rounded p-2 font-medium"
          onClick={() => socket.emit("joinRoom", joinCode)}
        >
          Join Room
        </button>
      </div>

      {status && <p className="text-yellow-400 text-sm">{status}</p>}
    </div>
  );
}
