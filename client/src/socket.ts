import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../../shared/types";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

// Fully typed socket: emit/on calls are checked against the shared event contract.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
});

export function connect(): void {
  if (!socket.connected) socket.connect();
}

export function disconnect(): void {
  socket.disconnect();
}
