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
  const send = () =>
    fetch(`http://127.0.0.1:${process.env.E2E_CONTROL_PORT}${path}`, {
      method,
      headers: { "x-e2e-token": process.env.E2E_CONTROL_TOKEN ?? "", "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let response: Response;
  try {
    response = await send();
  } catch (error) {
    // A kept-alive connection the server had just closed (seen on the Windows runner as ECONNRESET): a read is
    // safe to send again; a POST is not (it may have been applied), so it fails as before.
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (method !== "GET" || (code !== "ECONNRESET" && code !== "UND_ERR_SOCKET")) throw error;
    response = await send();
  }
  if (!response.ok) throw new Error(`control ${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Queues die values at the server's dice source (drawn before any random die). */
export const queueDice = (...values: number[]) => control("POST", "/dice", { values });

export const serverState = async (code: string) => (await control("GET", `/state?code=${encodeURIComponent(code)}`)) as ServerSnapshot;
