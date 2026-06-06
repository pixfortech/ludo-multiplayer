import { describe, it, expect, beforeEach } from "vitest";
import {
  createRoom,
  joinRoom,
  startRoomGame,
  removePlayerFromRoom,
  markDisconnected,
  resumePlayer,
  getPlayerRoom,
  getPlayerIdFromSocket,
  registerSocketPlayer,
  unregisterSocket,
} from "../rooms/roomManager.js";

// Each test creates rooms with unique IDs via nanoid; isolate state by using
// fresh IDs and players per test rather than sharing a module-level map.

// ── 1 & 2. Host-only start / not enough players ─────────────────────────────

describe("startRoomGame", () => {
  it("host can start when ≥2 players have joined", () => {
    const room = createRoom("host1", 2);
    joinRoom(room.id, "guest1");
    const started = startRoomGame(room.id, "host1");
    expect(started).not.toBeNull();
    expect(started!.gameState.phase).toBe("playing");
  });

  it("non-host cannot start the game", () => {
    const room = createRoom("host2", 2);
    joinRoom(room.id, "guest2");
    const started = startRoomGame(room.id, "guest2");
    expect(started).toBeNull();
  });

  it("cannot start with fewer than 2 players", () => {
    const room = createRoom("host3", 2);
    const started = startRoomGame(room.id, "host3");
    expect(started).toBeNull();
  });

  it("returns null for a room that does not exist", () => {
    expect(startRoomGame("NOPE00", "anyone")).toBeNull();
  });
});

// ── 3. Join restrictions ─────────────────────────────────────────────────────

describe("joinRoom restrictions", () => {
  it("returns null for a non-existent room", () => {
    expect(joinRoom("NOPE00", "p1")).toBeNull();
  });

  it("returns null when the room is full", () => {
    const room = createRoom("h", 2);
    joinRoom(room.id, "p2");
    expect(joinRoom(room.id, "p3")).toBeNull();
  });

  it("returns null when the game is already in progress", () => {
    const room = createRoom("hA", 2);
    joinRoom(room.id, "gA");
    startRoomGame(room.id, "hA");
    expect(joinRoom(room.id, "newcomer")).toBeNull();
  });

  it("rejects a duplicate playerId", () => {
    const room = createRoom("hB", 3);
    joinRoom(room.id, "dup");
    expect(joinRoom(room.id, "dup")).toBeNull();
  });

  it("second player receives a distinct color", () => {
    const room = createRoom("hC", 2);
    const result = joinRoom(room.id, "gC");
    expect(result).not.toBeNull();
    expect(result!.color).not.toBe(room.gameState.players[0].color);
  });
});

// ── 4. Resume flow ───────────────────────────────────────────────────────────

describe("resumePlayer", () => {
  it("marks a previously-disconnected player as connected", () => {
    const room = createRoom("hD", 2);
    joinRoom(room.id, "gD");
    markDisconnected(room.id, "gD");
    const resumed = resumePlayer(room.id, "gD", "newSocket1");
    expect(resumed).not.toBeNull();
    const player = resumed!.gameState.players.find((p) => p.id === "gD");
    expect(player?.connected).toBe(true);
  });

  it("does not create a duplicate player on resume", () => {
    const room = createRoom("hE", 2);
    joinRoom(room.id, "gE");
    const before = room.gameState.players.length;
    resumePlayer(room.id, "gE", "newSocket2");
    expect(room.gameState.players.length).toBe(before);
  });

  it("updates the socket→playerId mapping on resume", () => {
    const room = createRoom("hF", 2);
    joinRoom(room.id, "gF");
    resumePlayer(room.id, "gF", "socketXYZ");
    expect(getPlayerIdFromSocket("socketXYZ")).toBe("gF");
  });

  it("returns null for an unknown room", () => {
    expect(resumePlayer("NOPE00", "anyplayer", "s1")).toBeNull();
  });

  it("returns null for a playerId not in the room", () => {
    const room = createRoom("hG", 2);
    expect(resumePlayer(room.id, "ghost", "s2")).toBeNull();
  });
});

// ── 5. Disconnect flow ───────────────────────────────────────────────────────

describe("markDisconnected", () => {
  it("sets connected:false without removing the player", () => {
    const room = createRoom("hH", 2);
    joinRoom(room.id, "gH");
    const before = room.gameState.players.length;
    markDisconnected(room.id, "gH");
    expect(room.gameState.players.length).toBe(before);
    expect(room.gameState.players.find((p) => p.id === "gH")?.connected).toBe(false);
  });

  it("returns undefined for an unknown room", () => {
    expect(markDisconnected("NOPE00", "p")).toBeUndefined();
  });
});

describe("removePlayerFromRoom", () => {
  it("removes the player from the room", () => {
    const room = createRoom("hI", 2);
    joinRoom(room.id, "gI");
    const updated = removePlayerFromRoom(room.id, "gI");
    expect(updated!.gameState.players.some((p) => p.id === "gI")).toBe(false);
  });

  it("returns null (deletes room) when the last player leaves", () => {
    const room = createRoom("hJ", 2);
    const result = removePlayerFromRoom(room.id, "hJ");
    expect(result).toBeNull();
  });

  it("currentPlayerIndex stays within bounds after removal", () => {
    const room = createRoom("hK", 3);
    joinRoom(room.id, "gK1");
    joinRoom(room.id, "gK2");
    startRoomGame(room.id, "hK");
    const updated = removePlayerFromRoom(room.id, "gK1");
    expect(updated!.gameState.currentPlayerIndex).toBeGreaterThanOrEqual(0);
    expect(updated!.gameState.currentPlayerIndex).toBeLessThan(
      updated!.gameState.players.length
    );
  });
});

// ── 6. Socket mapping (supports requestState) ────────────────────────────────

describe("socket mapping", () => {
  it("getPlayerIdFromSocket returns the registered playerId", () => {
    registerSocketPlayer("sock1", "player-uuid-1");
    expect(getPlayerIdFromSocket("sock1")).toBe("player-uuid-1");
  });

  it("unregisterSocket removes the mapping", () => {
    registerSocketPlayer("sock2", "player-uuid-2");
    unregisterSocket("sock2");
    expect(getPlayerIdFromSocket("sock2")).toBeUndefined();
  });

  it("getPlayerIdFromSocket returns undefined for an unknown socketId", () => {
    expect(getPlayerIdFromSocket("no-such-socket")).toBeUndefined();
  });

  it("getPlayerRoom finds room by durable playerId after registration", () => {
    const room = createRoom("hL", 2);
    registerSocketPlayer("sockL", "hL");
    const found = getPlayerRoom("hL");
    expect(found?.id).toBe(room.id);
  });
});
