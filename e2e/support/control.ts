// Client for the test server's control port (127.0.0.1 only, per-run token).
// Test-only: production clients have no way to reach it.
import type { GameStateView } from "@ludo/shared-types";

export interface ServerSnapshot {
  room: { id: string; code: string; status: string; hostPlayerId: string; settings: { autoMove: boolean; rankingMode: string; cityTheme?: string } };
  players: { id: string; displayName: string; seat: number; colour: string; connectionStatus: string; finishPlace: number | null }[];
  game: GameStateView | null;
  /** The full authoritative history (the wire state carries only the last 20 entries). */
  history: GameStateView["recentHistory"];
  /** The committed action log, one row per accepted request. */
  events: { seq: number; actionType: string; playerId: string | null; requestId: string | null; resultStateVersion: number }[];
  queuedDice: number;
}

export async function control(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${process.env.E2E_CONTROL_PORT}${path}`, {
    method,
    headers: { "x-e2e-token": process.env.E2E_CONTROL_TOKEN ?? "", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`control ${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Queues die values at the server's dice source (drawn before any random die). */
export const queueDice = (...values: number[]) => control("POST", "/dice", { values });

export const serverState = async (code: string) => (await control("GET", `/state?code=${encodeURIComponent(code)}`)) as ServerSnapshot;
