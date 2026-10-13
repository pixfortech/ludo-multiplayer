// What this device can render, and which board view the player prefers.
// Kept tiny and free of three.js: it ships in the main bundle, while the 3D
// renderer itself is a lazily loaded chunk.

import { useCallback, useEffect, useRef, useState } from "react";
import { browserStorage, type KeyValueStorage } from "../../lib/session";

/** The board views. "2.5d" is the default; "3d" is the immersive camera preview; "2d" is the lightweight SVG board. */
export type BoardViewMode = "2.5d" | "3d" | "2d";
export type QualityLevel = "low" | "medium" | "high";
export type DeviceClass = "phone" | "tablet" | "desktop";

let webgl: boolean | null = null;

/** WebGL 2 is available (checked once). Software renderers count: performance is watched separately. */
export function hasWebGL2(): boolean {
  if (webgl !== null) return webgl;
  // jsdom (unit tests) has no canvas: the 2D board is used there.
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return (webgl = false);
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    webgl = Boolean(gl);
    (gl?.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null)?.loseContext?.();
  } catch {
    webgl = false;
  }
  return webgl;
}

export function deviceClass(width = globalThis.innerWidth ?? 1280, height = globalThis.innerHeight ?? 800): DeviceClass {
  const short = Math.min(width, height);
  if (short < 600) return "phone";
  if (Math.max(width, height) < 1280 || short < 720) return "tablet";
  return "desktop";
}

/** The automatic quality for a device class: phones low, everything else medium (it drops further if frames are slow). */
export function autoQuality(device: DeviceClass): QualityLevel {
  return device === "phone" ? "low" : "medium";
}

export interface ViewPreference {
  /** Null until the player picks: the board then follows the default (2.5D where WebGL works). */
  mode: BoardViewMode | null;
  /** Null = automatic. */
  quality: QualityLevel | null;
}

// A board view is one player's own presentation choice: it never leaves this tab (no shared room setting,
// no Socket.IO message) and never follows another tab. Two places keep it:
//  - this tab (sessionStorage), so a refresh keeps it, and two players in two tabs of one browser each keep
//    their own;
//  - this seat (localStorage, keyed by room and player), so the player who resumes their seat in a new tab
//    or after closing the browser gets their own choice back, and nobody else's.
// Nothing listens for other tabs' changes.
export const TAB_VIEW_KEY = "ludo.view.tab.v2";
export const SEAT_VIEWS_KEY = "ludo.view.seats.v2";
const SEAT_VIEWS_KEPT = 20;
const MODES: readonly BoardViewMode[] = ["2.5d", "3d", "2d"];
const QUALITIES: readonly QualityLevel[] = ["low", "medium", "high"];
const NONE: ViewPreference = { mode: null, quality: null };

function parsePreference(raw: unknown): ViewPreference | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof ViewPreference, unknown>>;
  return {
    mode: MODES.includes(r.mode as BoardViewMode) ? (r.mode as BoardViewMode) : null,
    quality: QUALITIES.includes(r.quality as QualityLevel) ? (r.quality as QualityLevel) : null,
  };
}

function readJson(storage: KeyValueStorage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: KeyValueStorage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // a convenience only
  }
}

/** The seat a preference belongs to (room code and player), or null for someone without a seat. */
export function seatViewKey(roomCode: string | null | undefined, playerId: string | null | undefined): string | null {
  return roomCode && playerId ? `${roomCode}:${playerId}` : null;
}

/** This tab's board view, else the seat's remembered one, else the defaults. */
export function readViewPreference(seat: string | null, stores: { tab: KeyValueStorage | null; local: KeyValueStorage | null } = { tab: browserStorage("session"), local: browserStorage("local") }): ViewPreference {
  const tab = parsePreference(readJson(stores.tab, TAB_VIEW_KEY));
  if (tab) return tab;
  if (seat) {
    const seats = readJson(stores.local, SEAT_VIEWS_KEY);
    const own = seats && typeof seats === "object" ? parsePreference((seats as Record<string, unknown>)[seat]) : null;
    if (own) return own;
  }
  return NONE;
}

export function writeViewPreference(pref: ViewPreference, seat: string | null, stores: { tab: KeyValueStorage | null; local: KeyValueStorage | null } = { tab: browserStorage("session"), local: browserStorage("local") }, now = Date.now()): void {
  writeJson(stores.tab, TAB_VIEW_KEY, pref);
  if (!seat) return;
  const raw = readJson(stores.local, SEAT_VIEWS_KEY);
  const seats = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, { at?: number }>) } : {};
  seats[seat] = { ...pref, at: now } as unknown as { at: number };
  // Keep the most recently used seats only.
  const kept = Object.entries(seats)
    .sort(([, a], [, b]) => (Number(b?.at) || 0) - (Number(a?.at) || 0))
    .slice(0, SEAT_VIEWS_KEPT);
  writeJson(stores.local, SEAT_VIEWS_KEY, Object.fromEntries(kept));
}

/**
 * This player's board view and quality in this tab (see above). `seat` is the seat this tab plays (or null):
 * when it becomes known and this tab has not chosen yet, the seat's own remembered choice applies.
 */
export function useViewPreference(seat: string | null = null): [ViewPreference, (next: Partial<ViewPreference>) => void] {
  const [pref, setPref] = useState<ViewPreference>(() => readViewPreference(seat));
  const seatRef = useRef(seat);
  useEffect(() => {
    if (seatRef.current === seat) return;
    seatRef.current = seat;
    setPref(readViewPreference(seat));
  }, [seat]);
  const update = useCallback((next: Partial<ViewPreference>) => {
    setPref((current) => {
      const merged = { ...current, ...next };
      writeViewPreference(merged, seatRef.current);
      return merged;
    });
  }, []);
  return [pref, update];
}
