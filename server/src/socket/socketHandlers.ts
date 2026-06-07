import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "../game/gameTypes.js";
import {
  createRoom,
  joinRoom,
  startRoomGame,
  getPlayerRoom,
  getRoomPreview,
  removePlayerFromRoom,
  registerSocketPlayer,
  unregisterSocket,
  getPlayerIdFromSocket,
  markDisconnected,
  resumePlayer,
} from "../rooms/roomManager.js";
import { rollDice, moveToken } from "../game/gameEngine.js";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: Server, socket: AppSocket): void {
  socket.on("createRoom", (maxPlayers, opts) => {
    if (maxPlayers < 2 || maxPlayers > 4) {
      socket.emit("error", "maxPlayers must be 2-4");
      return;
    }
    const playerId = opts?.playerId ?? socket.id;
    registerSocketPlayer(socket.id, playerId);
    const room = createRoom(playerId, maxPlayers, { name: opts?.name, preferredColor: opts?.preferredColor });
    const host = room.gameState.players[0];
    socket.join(room.id);
    socket.emit("roomCreated", room.id);
    socket.emit("roomJoined", {
      roomId: room.id,
      color: host.color,
      name: host.name,
      reassigned: opts?.preferredColor !== undefined && opts.preferredColor !== host.color,
    });
    socket.emit("gameStateUpdate", room.gameState);
  });

  socket.on("joinRoom", (roomId, opts) => {
    const playerId = opts?.playerId ?? socket.id;
    registerSocketPlayer(socket.id, playerId);
    const result = joinRoom(roomId, playerId, {
      name: opts?.name,
      preferredColor: opts?.preferredColor,
      onError: (reason) => socket.emit("error", reason),
    });
    if (!result) return;
    socket.join(roomId);
    socket.emit("roomJoined", {
      roomId,
      color: result.color,
      name: result.name,
      reassigned: result.reassigned,
    });
    io.to(roomId).emit("gameStateUpdate", result.room.gameState);
    io.to(roomId).emit("playerJoined", { id: playerId, color: result.color, name: result.name });
  });

  socket.on("getRoomInfo", (roomId) => {
    const normalized = (roomId ?? "").trim().toUpperCase();
    socket.emit("roomInfo", { roomId: normalized, preview: getRoomPreview(normalized) });
  });

  socket.on("resume", (roomId, playerId) => {
    const room = resumePlayer(roomId, playerId, socket.id);
    if (!room) {
      socket.emit("error", "Room or player not found");
      return;
    }
    socket.join(roomId);
    socket.emit("gameStateUpdate", room.gameState);
    io.to(roomId).emit("gameStateUpdate", room.gameState);
  });

  socket.on("requestState", () => {
    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) return;
    const room = getPlayerRoom(playerId);
    if (!room) return;
    socket.emit("gameStateUpdate", room.gameState);
  });

  socket.on("startGame", () => {
    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) { socket.emit("error", "Not in a room"); return; }
    const room = getPlayerRoom(playerId);
    if (!room) { socket.emit("error", "Not in a room"); return; }
    if (room.gameState.phase !== "waiting") { socket.emit("error", "Game has already started"); return; }
    if (room.hostId !== playerId) { socket.emit("error", "Only the host can start the game"); return; }
    if (room.gameState.players.length < 2) { socket.emit("error", "At least 2 players are required to start"); return; }
    const updated = startRoomGame(room.id, playerId);
    if (!updated) { socket.emit("error", "Cannot start game"); return; }
    io.to(room.id).emit("gameStateUpdate", updated.gameState);
  });

  socket.on("rollDice", () => {
    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) { socket.emit("error", "Not in a room"); return; }
    const room = getPlayerRoom(playerId);
    if (!room) { socket.emit("error", "Not in a room"); return; }
    room.gameState = rollDice(room.gameState, playerId);
    io.to(room.id).emit("gameStateUpdate", room.gameState);
  });

  socket.on("moveToken", (tokenId) => {
    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) { socket.emit("error", "Not in a room"); return; }
    const room = getPlayerRoom(playerId);
    if (!room) { socket.emit("error", "Not in a room"); return; }
    room.gameState = moveToken(room.gameState, playerId, tokenId);
    io.to(room.id).emit("gameStateUpdate", room.gameState);
    if (room.gameState.winner) {
      io.to(room.id).emit("gameOver", room.gameState.winner);
    }
  });

  socket.on("leaveRoom", () => {
    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) return;
    const room = getPlayerRoom(playerId);
    if (!room) return;
    const roomId = room.id;
    socket.leave(roomId);
    unregisterSocket(socket.id);
    broadcastRemoval(io, roomId, playerId);
  });

  socket.on("disconnect", () => {
    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) return;
    const room = getPlayerRoom(playerId);
    unregisterSocket(socket.id);
    if (!room) return;
    const updated = markDisconnected(room.id, playerId);
    if (updated) {
      io.to(room.id).emit("gameStateUpdate", updated.gameState);
    }
  });
}

function broadcastRemoval(io: Server, roomId: string, playerId: string): void {
  const updated = removePlayerFromRoom(roomId, playerId);
  io.to(roomId).emit("playerLeft", playerId);
  if (updated) {
    io.to(roomId).emit("gameStateUpdate", updated.gameState);
    if (updated.gameState.winner) {
      io.to(roomId).emit("gameOver", updated.gameState.winner);
    }
  }
}
