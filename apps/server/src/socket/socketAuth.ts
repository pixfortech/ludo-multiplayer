// Connection identity. A connection may arrive with a player credential in the
// Socket.IO handshake `auth` (never in the URL): it is verified before the
// connection is accepted, and the connection is then bound to that player and
// room. Without a credential, a connection is anonymous until it creates or
// joins a room. Anything a client claims inside an event payload is ignored.
//
// Rate-limit keys come from the connection itself: the peer address, or with
// TRUST_PROXY_HOPS set, the address reported by that many trusted proxies.

import type { IncomingHttpHeaders } from "node:http";
import { SlidingWindowLimiter } from "../rooms/rateLimiter.js";
import type { RoomService } from "../rooms/roomService.js";
import type { LudoSocket } from "./socketEvents.js";

const normaliseAddress = (address: string) => address.trim().replace(/^::ffff:/, "");

/**
 * The client address for rate limiting. X-Forwarded-For is only honoured
 * when the deployment says how many proxies in front of the server are
 * trusted; otherwise any client could pick its own key.
 */
export function clientKeyFor(handshake: { address: string; headers: IncomingHttpHeaders }, trustProxyHops: number): string {
  if (trustProxyHops > 0) {
    const header = handshake.headers["x-forwarded-for"];
    const chain = (Array.isArray(header) ? header.join(",") : (header ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
    const candidate = chain[chain.length - trustProxyHops];
    if (candidate) return `ip:${normaliseAddress(candidate)}`;
  }
  return `ip:${normaliseAddress(handshake.address || "unknown")}`;
}

export interface HandshakeAuthOptions {
  rooms: RoomService;
  trustProxyHops: number;
  /** Failed credential checks allowed per client key. */
  failedAuthLimiter?: SlidingWindowLimiter;
}

type Next = (error?: Error) => void;

function refuse(next: Next, code: "unauthenticated" | "rate-limited" | "storage-unavailable"): void {
  const error = new Error(code) as Error & { data?: { code: string } };
  error.data = { code };
  next(error);
}

export function handshakeAuth(options: HandshakeAuthOptions): (socket: LudoSocket, next: Next) => void {
  const failures = options.failedAuthLimiter ?? new SlidingWindowLimiter({ limit: 20, windowMs: 10 * 60_000 });
  return (socket, next) => {
    socket.data.clientKey = clientKeyFor(socket.handshake, options.trustProxyHops);
    socket.data.actor = null;
    const auth = socket.handshake.auth as { credential?: unknown } | undefined;
    if (auth?.credential === undefined) return next();
    if (failures.retryAfterMs(socket.data.clientKey) > 0) return refuse(next, "rate-limited");
    options.rooms.authenticate(auth.credential).then(
      (actor) => {
        socket.data.actor = actor;
        next();
      },
      (error: { code?: string }) => {
        if (error?.code === "storage-unavailable") return refuse(next, "storage-unavailable");
        failures.record(socket.data.clientKey);
        refuse(next, "unauthenticated");
      },
    );
  };
}
