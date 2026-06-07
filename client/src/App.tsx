import { useState } from "react";
import Home from "./pages/Home";
import GameRoom from "./pages/GameRoom";
import { Background } from "./components/ui";
import type { PlayerColor } from "./types";
import { loadSession, saveSession, clearSession } from "./identity";

type AppView = "home" | "game";

export default function App() {
  // Restore an in-progress session after a refresh (same tab) so the player can
  // resume their game instead of dropping back to the home screen.
  const saved = loadSession();
  const [view, setView] = useState<AppView>(saved ? "game" : "home");
  const [roomId, setRoomId] = useState<string>(saved?.roomId ?? "");
  const [myColor, setMyColor] = useState<PlayerColor>(saved?.color ?? "red");
  const [notice, setNotice] = useState<string>("");

  function handleRoomJoined(id: string, color: PlayerColor, message = "") {
    setRoomId(id);
    setMyColor(color);
    setNotice(message);
    saveSession({ roomId: id, color });
    setView("game");
  }

  function handleLeave() {
    clearSession();
    setNotice("");
    setView("home");
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
            notice={notice}
            onLeave={handleLeave}
          />
        )}
      </div>
    </div>
  );
}
