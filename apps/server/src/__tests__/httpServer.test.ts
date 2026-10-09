import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerHello,
  type ServerToClientEvents,
} from "@ludo/shared-types";
import { loadConfig } from "../config.js";
import { startServer, type RunningServer } from "../httpServer.js";

let server: RunningServer;
let client: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

beforeEach(async () => {
  server = await startServer({ port: 0, clientOrigins: ["http://localhost:5173"] });
});

afterEach(async () => {
  client?.disconnect();
  client = undefined;
  await server.close();
});

describe("server scaffold", () => {
  it("serves the health endpoint", async () => {
    const res = await fetch(`http://localhost:${server.port}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", protocolVersion: PROTOCOL_VERSION });
  });

  it("greets every socket with the protocol version", async () => {
    client = connect(`http://localhost:${server.port}`, { transports: ["websocket"] });
    const hello = await new Promise<ServerHello>((resolve) => client!.once("server:hello", resolve));
    expect(hello.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(typeof hello.serverTime).toBe("number");
  });
});

describe("loadConfig", () => {
  it("uses sensible defaults", () => {
    expect(loadConfig({})).toEqual({
      port: 3001,
      clientOrigins: ["http://localhost:5173"],
      databaseUrl: null,
      trustProxyHops: 0,
      reconnectGraceMs: 15_000,
      retention: { lobbyDays: 30, activeDays: 90, endedDays: 30 },
      retentionSweepMs: 3_600_000,
    });
  });

  it("parses a comma-separated origin list", () => {
    expect(loadConfig({ PORT: "4000", CLIENT_ORIGIN: "https://a.test, https://b.test" })).toMatchObject({
      port: 4000,
      clientOrigins: ["https://a.test", "https://b.test"],
      databaseUrl: null,
      trustProxyHops: 0,
    });
  });

  it("reads the trusted proxy count and rejects nonsense", () => {
    expect(loadConfig({ TRUST_PROXY_HOPS: "1" }).trustProxyHops).toBe(1);
    expect(() => loadConfig({ TRUST_PROXY_HOPS: "-1" })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => loadConfig({ TRUST_PROXY_HOPS: "yes" })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("reads the reconnect grace period and retention policy", () => {
    expect(
      loadConfig({ RECONNECT_GRACE_SECONDS: "5", ROOM_RETENTION_LOBBY_DAYS: "7", ROOM_RETENTION_ACTIVE_DAYS: "120", ROOM_RETENTION_ENDED_DAYS: "60", RETENTION_SWEEP_MINUTES: "0" }),
    ).toMatchObject({ reconnectGraceMs: 5000, retention: { lobbyDays: 7, activeDays: 120, endedDays: 60 }, retentionSweepMs: 0 });
    expect(() => loadConfig({ RECONNECT_GRACE_SECONDS: "-1" })).toThrow(/RECONNECT_GRACE_SECONDS/);
    expect(() => loadConfig({ ROOM_RETENTION_LOBBY_DAYS: "0" })).toThrow(/ROOM_RETENTION_LOBBY_DAYS/);
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT/);
  });

  it("reads DATABASE_URL and rejects non-PostgreSQL URLs without echoing them", () => {
    expect(loadConfig({ DATABASE_URL: "postgres://ludo:pw@db:5432/ludo" }).databaseUrl).toBe("postgres://ludo:pw@db:5432/ludo");
    expect(() => loadConfig({ DATABASE_URL: "mysql://u:secret@h/db" })).toThrow(/Invalid DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: "mysql://u:secret@h/db" })).not.toThrow(/secret/);
  });
});
