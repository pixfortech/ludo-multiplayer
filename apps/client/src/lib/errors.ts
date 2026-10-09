// Player-facing wording for every error the server can return. Messages are
// sentence case, say what happened and what to do; no codes or internals.

import type { ProtocolErrorCode } from "@ludo/shared-types";
import { ProtocolRequestError } from "./connection";

const MESSAGES: Record<ProtocolErrorCode | "timeout" | "offline", string> = {
  "invalid-request": "Something in that request wasn't right. Please try again.",
  "invalid-room-code": "Room codes are 6 letters and numbers, like ABC·234.",
  "invalid-display-name": "Choose a name of 1–24 characters.",
  "invalid-room-name": "Room names can be up to 40 characters.",
  "invalid-colour": "That colour isn't available on this board.",
  "invalid-player-count": "Choose 2, 3 or 4 players.",
  "invalid-settings": "One of the settings isn't valid. Please check and try again.",
  "unsupported-player-count": "Games for 5–15 players are still in development. Choose 2–4 players.",
  "unsupported-setting": "That option isn't available yet.",
  "unsupported-rule": "That rule variation isn't available yet.",
  "room-not-found": "We couldn't find a room with that code. Check it and try again.",
  "room-full": "This room is full.",
  "room-closed": "This room has closed.",
  "game-already-started": "This game has already started. Players who are in it can resume from their own device.",
  "game-in-progress": "You can't leave during a game.",
  "settings-locked": "Settings can't change once the game has started.",
  "not-enough-players": "At least two players are needed to start.",
  "invalid-transition": "That isn't possible right now.",
  "capacity-below-members": "More players have already joined than that allows.",
  "colour-taken": "Someone just took that colour. Pick another or choose Auto.",
  "name-taken": "Someone in this room already uses that name. Try another.",
  "already-member": "You're already in this room. Resume your seat instead.",
  unauthenticated: "This saved seat is no longer valid on this device.",
  "not-a-member": "You're no longer in this room.",
  "not-host": "Only the host can do that.",
  "invalid-target": "That player isn't in this room.",
  "version-conflict": "The room changed a moment ago. Please try again.",
  "rate-limited": "Too many attempts. Please wait a moment and try again.",
  "room-code-exhausted": "We couldn't create a room just now. Please try again.",
  "storage-unavailable": "The game server is having trouble. Please try again shortly.",
  "session-expired": "This seat is no longer available: you left the room, or it was archived.",
  "session-in-use": "This seat is open in another tab or device.",
  "session-replaced": "You continued this game in another tab or device.",
  "credential-conflict": "Your seat details changed at the same moment. Please try again.",
  "game-not-started": "The game hasn't started yet.",
  "game-paused": "The game is paused.",
  "game-finished": "The game is over.",
  "not-a-player": "You're not playing in this game.",
  "not-your-turn": "It's not your turn.",
  "not-awaiting-roll": "Choose a token to move first.",
  "not-awaiting-move": "Roll the dice first.",
  "unknown-token": "That token doesn't exist.",
  "illegal-move": "That token can't move with this roll.",
  "stale-state": "The game moved on. Showing the latest position.",
  "request-id-reused": "Something went wrong. Please try again.",
  "invalid-payload": "Something in that request wasn't right. Please try again.",
  "payload-too-large": "That was too long. Please shorten it.",
  "not-in-room": "You're not connected to a room.",
  "already-in-room": "This tab is already in a room. Leave it first, or open a new tab.",
  "internal-error": "Something went wrong on our side. Please try again.",
  timeout: "The server didn't respond. Check your connection and try again.",
  offline: "You're offline. Check your connection.",
};

export function friendlyError(error: unknown): string {
  if (error instanceof ProtocolRequestError) return MESSAGES[error.code] ?? MESSAGES["internal-error"];
  return MESSAGES["internal-error"];
}

export function errorCode(error: unknown): string | null {
  return error instanceof ProtocolRequestError ? error.code : null;
}
