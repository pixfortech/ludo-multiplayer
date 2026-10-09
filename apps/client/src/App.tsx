import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/ui/Toasts";
import { GameConnection, type ClientSocket } from "./lib/connection";
import { RouterProvider, useRouter } from "./lib/router";
import { SeatStore, TabSeat, browserStorage } from "./lib/session";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { HomePage } from "./pages/HomePage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { LobbyPage } from "./pages/LobbyPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResumePage } from "./pages/ResumePage";
import { GameProvider, type GameServices } from "./state/gameClient";

const TITLES: Record<string, string> = {
  home: "Ludo · play together online",
  create: "Create a game · Ludo",
  join: "Join a game · Ludo",
  lobby: "Lobby · Ludo",
  resume: "Resume a game · Ludo",
  "not-found": "Not found · Ludo",
};

function Routes() {
  const { route } = useRouter();
  useEffect(() => {
    document.title = TITLES[route.name] ?? "Ludo";
  }, [route]);
  switch (route.name) {
    case "home":
      return <HomePage />;
    case "create":
      return <CreateRoomPage />;
    case "join":
      return <JoinRoomPage key={route.code ?? "none"} initialCode={route.code} />;
    case "lobby":
      return <LobbyPage key={route.code} code={route.code} />;
    case "resume":
      return <ResumePage />;
    case "not-found":
      return <NotFoundPage />;
  }
}

/** One Socket.IO connection per tab (same origin; the dev server proxies to the game server). */
export function createBrowserServices(): GameServices {
  const url = (import.meta.env.VITE_SERVER_URL as string | undefined) || undefined;
  const socket: ClientSocket = url ? io(url, { transports: ["websocket"] }) : io({ transports: ["websocket"] });
  return { client: new GameConnection(socket), seats: new SeatStore(browserStorage("local")), tab: new TabSeat(browserStorage("session")) };
}

export default function App({ services, initialPath }: { services?: GameServices; initialPath?: string }) {
  const [resolved] = useState(() => services ?? createBrowserServices());
  return (
    <GameProvider services={resolved}>
      <ToastProvider>
        <RouterProvider {...(initialPath ? { initialPath } : {})}>
          <AppShell>
            <Routes />
          </AppShell>
        </RouterProvider>
      </ToastProvider>
    </GameProvider>
  );
}
