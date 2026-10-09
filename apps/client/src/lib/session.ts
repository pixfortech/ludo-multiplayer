// Where a browser keeps the seats it may resume (docs/architecture/sessions.md).
//
//  • localStorage "ludo.seats.v1": every seat this browser holds, so a game can
//    be resumed after the browser was closed. One entry per (room, player), so
//    two players sharing a browser keep separate seats.
//  • sessionStorage "ludo.tab.v1": which seat THIS tab controls. A refreshed tab
//    finds its marker and resumes quietly; a new tab has none, so it must ask
//    before taking over a seat that another tab is using.
//
// Secrets are only ever written here and sent in room:resume. They never go in
// URLs, logs or analytics.

export interface StoredSeat {
  roomCode: string;
  playerId: string;
  secret: string;
  displayName: string;
  roomName: string | null;
  /** ISO time the seat was saved or last resumed. */
  savedAt: string;
}

/** The subset of the Web Storage API used here (injectable for tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SEATS_KEY = "ludo.seats.v1";
const TAB_KEY = "ludo.tab.v1";

function isSeat(value: unknown): value is StoredSeat {
  const v = value as Record<string, unknown>;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.roomCode === "string" &&
    typeof v.playerId === "string" &&
    typeof v.secret === "string" &&
    typeof v.displayName === "string" &&
    typeof v.savedAt === "string"
  );
}

/** Storage can be unavailable (private mode, blocked site data): every access is guarded. */
function safeRead(storage: KeyValueStorage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWrite(storage: KeyValueStorage | null, key: string, value: unknown): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just cannot be resumed after closing.
  }
}

export class SeatStore {
  constructor(private readonly storage: KeyValueStorage | null) {}

  list(): StoredSeat[] {
    const value = safeRead(this.storage, SEATS_KEY);
    return Array.isArray(value) ? value.filter(isSeat).sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
  }

  forRoom(roomCode: string): StoredSeat[] {
    return this.list().filter((s) => s.roomCode === roomCode);
  }

  get(roomCode: string, playerId: string): StoredSeat | null {
    return this.list().find((s) => s.roomCode === roomCode && s.playerId === playerId) ?? null;
  }

  save(seat: Omit<StoredSeat, "savedAt">, now = new Date()): StoredSeat {
    const stored: StoredSeat = { ...seat, savedAt: now.toISOString() };
    const others = this.list().filter((s) => !(s.roomCode === seat.roomCode && s.playerId === seat.playerId));
    safeWrite(this.storage, SEATS_KEY, [stored, ...others].slice(0, 20));
    return stored;
  }

  remove(roomCode: string, playerId: string): void {
    safeWrite(
      this.storage,
      SEATS_KEY,
      this.list().filter((s) => !(s.roomCode === roomCode && s.playerId === playerId)),
    );
  }
}

export interface TabSeatMarker {
  roomCode: string;
  playerId: string;
}

export class TabSeat {
  constructor(private readonly storage: KeyValueStorage | null) {}

  get(): TabSeatMarker | null {
    const v = safeRead(this.storage, TAB_KEY) as TabSeatMarker | null;
    return v && typeof v.roomCode === "string" && typeof v.playerId === "string" ? { roomCode: v.roomCode, playerId: v.playerId } : null;
  }

  set(marker: TabSeatMarker): void {
    safeWrite(this.storage, TAB_KEY, marker);
  }

  clear(): void {
    safeWrite(this.storage, TAB_KEY, null);
  }
}

export function browserStorage(kind: "local" | "session"): KeyValueStorage | null {
  try {
    return kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}
