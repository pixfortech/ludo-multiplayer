// Durable client identity + lightweight session persistence.
//
// playerId lives in sessionStorage on purpose: it survives a refresh (so the
// server can resume the same player) yet stays distinct between browser tabs —
// so two tabs are two different players, which is what local 2-player testing
// needs. The display name is a shared preference, so it lives in localStorage.

import type { PlayerColor } from "./types";

const PID_KEY = "ludo:pid";
const NAME_KEY = "ludo:name";
const SESSION_KEY = "ludo:session";

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Stable per-tab player id; generated once and reused across reloads. */
export function getPlayerId(): string {
  try {
    let id = sessionStorage.getItem(PID_KEY);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch {
    return uuid();
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage unavailable — ignore */
  }
}

export interface SavedSession {
  roomId: string;
  color: PlayerColor;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
