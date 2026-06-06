import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "../game/gameTypes.js";
import {
  createRoom,
  joinRoom,
  startRoomGame,
  getPlayerRoom,
  removePlayerFromRoom,
} from "../rooms/roomManager.js";
import { rollDice, moveToken } from "../game/gameEngine.js";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: Server, socket: AppSocket): void {
  socket.on("createRoom", (maxPlayers) => {
    if (maxPlayers < 2 || maxPlayers > 4) {
      socket.emit("error", "maxPlayers must be 2-4");
      return;
    }
    const room = createRoom(socket.id, maxPlayers);
    socket.join(room.id);
    socket.emit("roomCreated", room.id);
    socket.emit("roomJoined", { roomId: room.id, color: room.gameState.players[0].color });
    socket.emit("gameStateUpdate", room.gameState);
  });

  socket.on("joinRoom", (roomId) => {
    const result = joinRoom(roomId, socket.id);
    if (!result) {
      socket.emit("error", "Room not found or full");
      return;
    }
    socket.join(roomId);
    socket.emit("roomJoined", { roomId, color: result.color });
    io.to(roomId).emit("gameStateUpdate", result.room.gameState);
    io.to(roomId).emit("playerJoined", { id: socket.id, color: result.color });
  });

  // Explicit snapshot request — the client calls this once GameRoom has mounted
  // and attached its listeners, so it can never miss the initial broadcast.
  socket.on("requestState", () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    socket.emit("gameStateUpdate", room.gameState);
  });

  socket.on("startGame", () => {
    const room = getPlayerRoom(socket.id);
    if (!room) { socket.emit("error", "Not in a room"); return; }
    const updated = startRoomGame(room.id, socket.id);
    if (!updated) { socket.emit("error", "Cannot start game"); return; }
    io.to(room.id).emit("gameStateUpdate", updated.gameState);
  });

  socket.on("rollDice", () => {
    const room = getPlayerRoom(socket.id);
    if (!room) { socket.emit("error", "Not in a room"); return; }
    room.gameState = rollDice(room.gameState, socket.id);
    io.to(room.id).emit("gameStateUpdate", room.gameState);
  });

  socket.on("moveToken", (tokenId) => {
    const room = getPlayerRoom(socket.id);
    if (!room) { socket.emit("error", "Not in a room"); return; }
    room.gameState = moveToken(room.gameState, socket.id, tokenId);
    io.to(room.id).emit("gameStateUpdate", room.gameState);
    if (room.gameState.winner) {
      io.to(room.id).emit("gameOver", room.gameState.winner);
    }
  });

  socket.on("leaveRoom", () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    const roomId = room.id;
    socket.leave(roomId);
    broadcastRemoval(io, roomId, socket.id);
  });

  socket.on("disconnect", () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    broadcastRemoval(io, room.id, socket.id);
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
