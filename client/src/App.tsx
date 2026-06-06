import { useState } from "react";
import Home from "./pages/Home";
import GameRoom from "./pages/GameRoom";
import type { PlayerColor } from "./types";

type AppView = "home" | "game";

export default function App() {
  const [view, setView] = useState<AppView>("home");
  const [roomId, setRoomId] = useState<string>("");
  const [myColor, setMyColor] = useState<PlayerColor>("red");

  function handleRoomJoined(id: string, color: PlayerColor) {
    setRoomId(id);
    setMyColor(color);
    setView("game");
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {view === "home" && <Home onRoomJoined={handleRoomJoined} />}
      {view === "game" && (
        <GameRoom
          roomId={roomId}
          myColor={myColor}
          onLeave={() => setView("home")}
        />
      )}
    </div>
  );
}
