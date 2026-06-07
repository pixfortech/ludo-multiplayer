import { useState } from "react";
import Home from "./pages/Home";
import GameRoom from "./pages/GameRoom";
import { Background } from "./components/ui";
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
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <Background />
      <div className="relative z-10 min-h-screen">
        {view === "home" && <Home onRoomJoined={handleRoomJoined} />}
        {view === "game" && (
          <GameRoom
            roomId={roomId}
            myColor={myColor}
            onLeave={() => setView("home")}
          />
        )}
      </div>
    </div>
  );
}
