import { nanoid } from "nanoid";
import type { Room, PlayerColor, RoomPreview } from "../game/gameTypes.js";
import { createInitialState, assignColors, startGame, removePlayer, setConnected } from "../game/gameEngine.js";

const rooms = new Map<string, Room>();
// transient socket.id → durable playerId
const socketToPlayer = new Map<string, string>();

const MAX_NAME_LENGTH = 16;

/** Authoritative name cleanup: collapse whitespace, trim, cap length, fallback. */
export function sanitizeName(raw?: string): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return cleaned || "Player";
}

/**
 * Pick a colour for a joining player: honour the preferred colour when it's both
 * valid for the table size and still free, otherwise the next available colour.
 */
function pickColor(
  maxPlayers: number,
  used: Set<PlayerColor>,
  preferred?: PlayerColor
): PlayerColor | undefined {
  const available = assignColors(maxPlayers).filter((c) => !used.has(c));
  if (preferred && available.includes(preferred)) return preferred;
  return available[0];
}

interface JoinParams {
  name?: string;
  preferredColor?: PlayerColor;
  onError?: (reason: string) => void;
}

export function registerSocketPlayer(socketId: string, playerId: string): void {
  socketToPlayer.set(socketId, playerId);
}

export function unregisterSocket(socketId: string): void {
  socketToPlayer.delete(socketId);
}

export function getPlayerIdFromSocket(socketId: string): string | undefined {
  return socketToPlayer.get(socketId);
}

export function createRoom(
  hostId: string,
  maxPlayers: number,
  opts: { name?: string; preferredColor?: PlayerColor } = {}
): Room {
  const id = nanoid(6).toUpperCase();
  const color = pickColor(maxPlayers, new Set(), opts.preferredColor) ?? assignColors(maxPlayers)[0];
  const name = sanitizeName(opts.name);
  const state = createInitialState(id, [{ id: hostId, color, name }], maxPlayers);
  const room: Room = { id, hostId, maxPlayers, gameState: state };
  rooms.set(id, room);
  return room;
}

export function joinRoom(
  roomId: string,
  playerId: string,
  opts: JoinParams = {}
): { room: Room; color: PlayerColor; name: string; reassigned: boolean } | null {
  const { onError, preferredColor } = opts;
  const room = rooms.get(roomId);
  if (!room) { onError?.("Room not found"); return null; }
  if (room.gameState.phase !== "waiting") { onError?.("Game has already started"); return null; }
  if (room.gameState.players.length >= room.maxPlayers) { onError?.("Room is full"); return null; }
  if (room.gameState.players.some((p) => p.id === playerId)) { onError?.("Already in this room"); return null; }

  const usedColors = new Set(room.gameState.players.map((p) => p.color));
  const color = pickColor(room.maxPlayers, usedColors, preferredColor);
  if (!color) { onError?.("No colors available"); return null; }

  const name = sanitizeName(opts.name);
  const reassigned = preferredColor !== undefined && preferredColor !== color;

  room.gameState.players.push({
    id: playerId,
    name,
    color,
    tokens: [0, 1, 2, 3].map((id) => ({ id, color, state: "base", position: -1 })),
    connected: true,
  });

  return { room, color, name, reassigned };
}

export function startRoomGame(roomId: string, requesterId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.gameState.phase !== "waiting") return null;
  if (room.hostId !== requesterId) return null;
  if (room.gameState.players.length < 2) return null;
  room.gameState = startGame(room.gameState);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

/**
 * Read-only snapshot for the join form: who's already seated, which colours
 * remain, and whether the room can still be joined. Returns null if unknown.
 */
export function getRoomPreview(roomId: string): RoomPreview | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  const used = new Set(room.gameState.players.map((p) => p.color));
  return {
    roomId: room.id,
    maxPlayers: room.maxPlayers,
    phase: room.gameState.phase,
    players: room.gameState.players.map((p) => ({
      name: p.name,
      color: p.color,
      connected: p.connected,
    })),
    availableColors: assignColors(room.maxPlayers).filter((c) => !used.has(c)),
  };
}

export function markDisconnected(roomId: string, playerId: string): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;
  room.gameState = setConnected(room.gameState, playerId, false);
  return room;
}

export function resumePlayer(roomId: string, playerId: string, socketId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.gameState.players.some((p) => p.id === playerId)) return null;
  registerSocketPlayer(socketId, playerId);
  room.gameState = setConnected(room.gameState, playerId, true);
  return room;
}

/**
 * Removes a player (on explicit leave) and keeps the game state valid.
 * Returns null if the room became empty and was deleted.
 */
export function removePlayerFromRoom(roomId: string, playerId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.gameState = removePlayer(room.gameState, playerId);

  if (room.gameState.players.length === 0) {
    rooms.delete(roomId);
    return null;
  }

  if (room.hostId === playerId) {
    room.hostId = room.gameState.players[0].id;
  }

  return room;
}

export function getPlayerRoom(playerId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.gameState.players.some((p) => p.id === playerId)) return room;
  }
  return undefined;
}
