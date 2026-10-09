// Typed Socket.IO server, socket and per-connection data. The event contract
// itself lives in @ludo/shared-types (protocol.ts) so the client shares it.

import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@ludo/shared-types";
import type { AuthenticatedPlayer } from "../rooms/roomService.js";

/** Per-connection state. The socket id is only a connection handle, never an identity. */
export interface SocketData {
  /** Rate-limit key derived by the server from the connection (never from client input). */
  clientKey: string;
  /** The verified player this connection acts as, once it has created, joined or authenticated. */
  actor: AuthenticatedPlayer | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no server-to-server events yet
export type InterServerEvents = {};

export type LudoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type LudoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** The Socket.IO room that carries one game room's broadcasts. Transport routing only, not room state. */
export const roomChannel = (roomId: string) => `room:${roomId}`;
