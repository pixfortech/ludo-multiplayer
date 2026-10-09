// Display helpers.

/** "ABC234" → "ABC·234" (codes are shown in 3+3 groups). */
export const formatRoomCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)}·${code.slice(3)}` : code);

/** Same alphabet as the server (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Keeps what a person types or pastes ("abc-234", "ABC 234", a whole invite link) down to code characters. */
export function normaliseCodeInput(input: string): string {
  const fromLink = /\/(?:join|room)\/([A-Za-z0-9]{6})/.exec(input)?.[1];
  const raw = (fromLink ?? input).toUpperCase().replace(/[\s\-·.]/g, "");
  return raw.slice(0, 6);
}

export const isCompleteCode = (code: string) => code.length === 6 && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));

/** The board corner each classic seat sits in. */
export const SEAT_CORNERS = ["Top left", "Top right", "Bottom right", "Bottom left"] as const;

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
