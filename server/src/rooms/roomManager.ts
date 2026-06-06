import { nanoid } from "nanoid";
import type { Room, PlayerColor } from "../game/gameTypes.js";
import { createInitialState, assignColors, startGame, removePlayer, setConnected } from "../game/gameEngine.js";

const rooms = new Map<string, Room>();
// transient socket.id → durable playerId
const socketToPlayer = new Map<string, string>();

export function registerSocketPlayer(socketId: string, playerId: string): void {
  socketToPlayer.set(socketId, playerId);
}

export function unregisterSocket(socketId: string): void {
  socketToPlayer.delete(socketId);
}

export function getPlayerIdFromSocket(socketId: string): string | undefined {
  return socketToPlayer.get(socketId);
}

export function createRoom(hostId: string, maxPlayers: number): Room {
  const id = nanoid(6).toUpperCase();
  const color = assignColors(maxPlayers)[0];
  const state = createInitialState(id, [{ id: hostId, color }], maxPlayers);
  const room: Room = { id, hostId, maxPlayers, gameState: state };
  rooms.set(id, room);
  return room;
}

export function joinRoom(roomId: string, playerId: string): { room: Room; color: PlayerColor } | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.gameState.phase !== "waiting") return null;
  if (room.gameState.players.length >= room.maxPlayers) return null;
  if (room.gameState.players.some((p) => p.id === playerId)) return null;

  const usedColors = new Set(room.gameState.players.map((p) => p.color));
  const color = assignColors(room.maxPlayers).find((c) => !usedColors.has(c));
  if (!color) return null;

  room.gameState.players.push({
    id: playerId,
    color,
    tokens: [0, 1, 2, 3].map((id) => ({ id, color, state: "base", position: -1 })),
    connected: true,
  });

  return { room, color };
}

export function startRoomGame(roomId: string, requesterId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.hostId !== requesterId) return null;
  if (room.gameState.players.length < 2) return null;
  room.gameState = startGame(room.gameState);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
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
