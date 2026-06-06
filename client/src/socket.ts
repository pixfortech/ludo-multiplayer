import { io, Socket } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export const socket: Socket = io(SERVER_URL, { autoConnect: false });

export function connect(): void {
  if (!socket.connected) socket.connect();
}

export function disconnect(): void {
  socket.disconnect();
}
