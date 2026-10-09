import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { MAX_PAYLOAD_BYTES, PROTOCOL_VERSION } from "@ludo/shared-types";
import { createApp } from "./app.js";
import type { ServerConfig } from "./config.js";
import type { LudoServer } from "./socket/socketEvents.js";
import { attachRealtime, type RealtimeHandle, type RealtimeOptions } from "./socket/socketServer.js";

export interface RunningServer {
  port: number;
  io: LudoServer;
  /** Present when the realtime (rooms and gameplay) layer is attached. */
  realtime: RealtimeHandle | null;
  close: () => Promise<void>;
}

export interface StartServerOptions extends Pick<ServerConfig, "port" | "clientOrigins"> {
  /** Whether dependencies (the database) are usable; drives /api/ready. */
  readiness?: () => Promise<boolean>;
  /** Rooms and gameplay over Socket.IO. Without it the server only greets connections. */
  realtime?: RealtimeOptions;
}

/**
 * Plain HTTP: production terminates TLS at a reverse proxy or load balancer
 * in front of this process (wss:// for clients), see docs/architecture/realtime.md.
 */
export async function startServer(config: StartServerOptions): Promise<RunningServer> {
  const httpServer = createServer(createApp({ readiness: config.readiness }));
  const io: LudoServer = new Server(httpServer, {
    cors: { origin: config.clientOrigins },
    // Transport-level cap; each event is also checked against MAX_PAYLOAD_BYTES.
    maxHttpBufferSize: MAX_PAYLOAD_BYTES * 4,
  });

  let realtime: RealtimeHandle | null = null;
  if (config.realtime) {
    realtime = attachRealtime(io, config.realtime);
  } else {
    io.on("connection", (socket) => {
      socket.emit("server:hello", { protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() });
    });
  }

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
    realtime,
    close: () =>
      new Promise<void>((resolve, reject) => {
        realtime?.dispose();
        // io.close() also closes the underlying HTTP server.
        void io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
