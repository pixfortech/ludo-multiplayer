// Socket protocol contract. Bump PROTOCOL_VERSION on any breaking change to
// event names or payloads so stale clients can be told to refresh.

export const PROTOCOL_VERSION = 1;

/** Sent by the server to every socket immediately after it connects. */
export interface ServerHello {
  protocolVersion: number;
  serverTime: number;
}

export interface ServerToClientEvents {
  "server:hello": (payload: ServerHello) => void;
}

// Client → server actions (create/join/resume room, roll, move, …) are added
// in Phase 2. The server validates every one; clients only request.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}
