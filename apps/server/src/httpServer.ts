import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@ludo/shared-types";
import { createApp } from "./app.js";
import type { ServerConfig } from "./config.js";

export interface RunningServer {
  port: number;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  close: () => Promise<void>;
}

export interface StartServerOptions extends Pick<ServerConfig, "port" | "clientOrigins"> {
  /** Whether dependencies (the database) are usable; drives /api/ready. */
  readiness?: () => Promise<boolean>;
}

export async function startServer(config: StartServerOptions): Promise<RunningServer> {
  const httpServer = createServer(createApp({ readiness: config.readiness }));
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.clientOrigins },
  });

  io.on("connection", (socket) => {
    socket.emit("server:hello", { protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  return {
    port: (httpServer.address() as AddressInfo).port,
    io,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // io.close() also closes the underlying HTTP server.
        void io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
