// In-memory GameStore with the same semantics as PostgresGameStore (version
// checks, active-seat/colour uniqueness, idempotency, validated states). For
// fast unit tests of higher layers only: it is NOT durable and is never used
// when DATABASE_URL is configured. Each method completes synchronously before
// its first await, so every call is atomic.

import { deserializeGameState, type GameState } from "@ludo/game-engine";
import { canTransitionRoom, type RoomStatus } from "@ludo/shared-types";
import {
  StoreError,
  type CommitGameActionInput,
  type GameEventRecord,
  type GameSessionRecord,
  type GameStore,
  type NewGameEvent,
  type NewPlayer,
  type NewRoom,
  type PlayerCredential,
  type PlayerRecord,
  type RoomPatch,
  type RoomRecord,
} from "./types.js";

interface StoredPlayer extends PlayerRecord {
  credentialHash: Buffer;
}

const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date();
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

export class MemoryGameStore implements GameStore {
  private rooms = new Map<string, RoomRecord>();
  private players = new Map<string, StoredPlayer>();
  private sessions = new Map<string, GameSessionRecord>();
  private events = new Map<string, GameEventRecord[]>();
  private nextEventId = 1;

  private room(roomId: string, expectedRoomVersion?: number): RoomRecord {
    const room = this.rooms.get(roomId);
    if (!room) throw new StoreError("not-found", `Room ${roomId} not found`);
    if (expectedRoomVersion !== undefined && room.roomVersion !== expectedRoomVersion) {
      throw new StoreError("version-conflict", `Room is at version ${room.roomVersion}, expected ${expectedRoomVersion}`);
    }
    return room;
  }

  private bump(room: RoomRecord): RoomRecord {
    room.roomVersion += 1;
    room.updatedAt = now();
    room.lastActivityAt = now();
    return clone(room);
  }

  private active(roomId: string): StoredPlayer[] {
    return [...this.players.values()].filter((p) => p.roomId === roomId && p.leftAt === null);
  }

  private publicPlayer({ credentialHash: _hash, ...p }: StoredPlayer): PlayerRecord {
    return clone(p);
  }

  private checkSeat(roomId: string, p: NewPlayer): void {
    const active = this.active(roomId);
    if (active.some((x) => x.seat === p.seat)) throw new StoreError("seat-taken", `Seat ${p.seat} is taken`);
    if (active.some((x) => x.colour === p.colour)) throw new StoreError("colour-taken", `Colour ${p.colour} is taken`);
    // Mirrors lower(display_name) under the C collation used by the database tests.
    const key = asciiLower(p.displayName);
    if (active.some((x) => asciiLower(x.displayName) === key)) throw new StoreError("name-taken", "That name is already used in this room");
  }

  private checkTransition(from: RoomStatus, to: RoomStatus | undefined): void {
    if (to !== undefined && to !== from && !canTransitionRoom(from, to)) {
      throw new StoreError("invalid-transition", `Room status cannot change from ${from} to ${to}`);
    }
  }

  /** Validates a patch completely before anything is changed, so a failure leaves no trace. */
  private checkPatch(room: RoomRecord, patch: RoomPatch, leavingPlayerId?: string): RoomPatch {
    const active = this.active(room.id).filter((p) => p.id !== leavingPlayerId);
    if (patch.hostPlayerId !== undefined && !active.some((p) => p.id === patch.hostPlayerId)) {
      throw new StoreError("not-found", "New host is not an active member of this room");
    }
    if (patch.maxPlayers !== undefined && active.length > patch.maxPlayers) {
      throw new StoreError("capacity-conflict", `The room already has ${active.length} players`);
    }
    this.checkTransition(room.status, patch.status);
    const effective = patch.status === "archived" && patch.archivedAt === undefined ? { ...patch, archivedAt: now() } : patch;
    const status = effective.status ?? room.status;
    const archivedAt = effective.archivedAt !== undefined ? effective.archivedAt : room.archivedAt;
    const maxPlayers = effective.maxPlayers ?? room.maxPlayers;
    const settings = effective.settings ?? room.settings;
    // The same consistency rules as the database CHECK constraints (migration 0002).
    if ((status === "archived") !== (archivedAt !== null)) throw new Error("rooms_archived_consistent violated");
    if (settings.maxPlayers !== maxPlayers) throw new Error("rooms_settings_max_players violated");
    return effective;
  }

  private applyPatch(room: RoomRecord, patch: RoomPatch): void {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (room as unknown as Record<string, unknown>)[key] = clone(value);
    }
  }

  private lastJoinedAt = 0;

  private makePlayer(roomId: string, p: NewPlayer): StoredPlayer {
    // Strictly increasing join times, like distinct transaction timestamps in PostgreSQL.
    this.lastJoinedAt = Math.max(Date.now(), this.lastJoinedAt + 1);
    const t = new Date(this.lastJoinedAt);
    return {
      id: p.id,
      roomId,
      displayName: p.displayName,
      seat: p.seat,
      colour: p.colour,
      kind: p.kind ?? "remote",
      connectionStatus: "disconnected",
      credentialHash: Buffer.from(p.credentialHash),
      credentialVersion: 1,
      credentialIssuedAt: t,
      credentialRevokedAt: null,
      joinedAt: t,
      lastSeenAt: t,
      leftAt: null,
      finishPlace: null,
    };
  }

  private validated(state: GameState): GameState {
    try {
      return deserializeGameState(JSON.parse(JSON.stringify(state)));
    } catch (error) {
      throw new StoreError("invalid-state", `Refusing to store an invalid game state: ${(error as Error).message}`);
    }
  }

  private appendEvent(roomId: string, event: NewGameEvent, resultStateVersion: number): GameEventRecord {
    const list = this.events.get(roomId) ?? [];
    if (event.requestId !== null && list.some((e) => e.playerId === event.playerId && e.requestId === event.requestId)) {
      throw new StoreError("duplicate-request", "This request was already committed");
    }
    const record: GameEventRecord = {
      id: String(this.nextEventId++),
      roomId,
      seq: list.length + 1,
      playerId: event.playerId,
      actionType: event.actionType,
      requestId: event.requestId,
      payload: clone(event.payload ?? null),
      resultStateVersion,
      createdAt: now(),
    };
    list.push(record);
    this.events.set(roomId, list);
    return clone(record);
  }

  async createRoom(room: NewRoom, host: NewPlayer, generateCode: () => string) {
    if (room.settings.maxPlayers !== room.maxPlayers) throw new Error("rooms_settings_max_players violated");
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateCode();
      if ([...this.rooms.values()].some((r) => r.code === code)) continue;
      const t = now();
      const record: RoomRecord = {
        id: room.id,
        code,
        name: room.name,
        hostPlayerId: host.id,
        maxPlayers: room.maxPlayers,
        visibility: room.visibility,
        settings: clone(room.settings),
        status: "lobby",
        roomVersion: 0,
        createdAt: t,
        updatedAt: t,
        lastActivityAt: t,
        expiresAt: room.expiresAt ?? null,
        archivedAt: null,
      };
      const hostRecord = this.makePlayer(room.id, host);
      this.rooms.set(room.id, record);
      this.players.set(host.id, hostRecord);
      return { room: clone(record), host: this.publicPlayer(hostRecord) };
    }
    throw new StoreError("room-code-exhausted", "Could not allocate a unique room code");
  }

  async getRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? clone(room) : null;
  }

  async getRoomByCode(code: string) {
    const room = [...this.rooms.values()].find((r) => r.code === code);
    return room ? clone(room) : null;
  }

  async updateRoom(roomId: string, expectedRoomVersion: number, patch: RoomPatch) {
    const room = this.room(roomId, expectedRoomVersion);
    this.applyPatch(room, this.checkPatch(room, patch));
    return this.bump(room);
  }

  async addPlayer(roomId: string, expectedRoomVersion: number, player: NewPlayer) {
    const room = this.room(roomId, expectedRoomVersion);
    if (room.status !== "lobby") throw new StoreError("game-already-started", "Players can only join a room in the lobby");
    if (this.active(roomId).length >= room.maxPlayers) throw new StoreError("room-full", "The room is full");
    this.checkSeat(roomId, player);
    const record = this.makePlayer(roomId, player);
    this.players.set(player.id, record);
    return { room: this.bump(room), player: this.publicPlayer(record) };
  }

  async getPlayer(playerId: string) {
    const p = this.players.get(playerId);
    return p ? this.publicPlayer(p) : null;
  }

  async listPlayers(roomId: string, options: { includeLeft?: boolean } = {}) {
    return [...this.players.values()]
      .filter((p) => p.roomId === roomId && (options.includeLeft || p.leftAt === null))
      .sort((a, b) => a.seat - b.seat || a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((p) => this.publicPlayer(p));
  }

  async setConnectionStatus(playerId: string, status: "connected" | "disconnected", at = new Date()) {
    const p = this.players.get(playerId);
    if (p && p.leftAt === null) {
      p.connectionStatus = status;
      p.lastSeenAt = at;
    }
  }

  async markPlayerLeft(roomId: string, expectedRoomVersion: number, playerId: string, patch: RoomPatch = {}) {
    const room = this.room(roomId, expectedRoomVersion);
    const p = this.players.get(playerId);
    if (!p || p.roomId !== roomId || p.leftAt !== null) throw new StoreError("not-found", "Player is not an active member of this room");
    const effective = this.checkPatch(room, patch, playerId);
    p.leftAt = now();
    p.connectionStatus = "left";
    this.applyPatch(room, effective);
    return this.bump(room);
  }

  async setFinishPlace(playerId: string, place: number | null) {
    const p = this.players.get(playerId);
    if (p) p.finishPlace = place;
  }

  async getCredential(playerId: string): Promise<PlayerCredential | null> {
    const p = this.players.get(playerId);
    return p ? { playerId, hash: Buffer.from(p.credentialHash), version: p.credentialVersion, revokedAt: p.credentialRevokedAt } : null;
  }

  async rotateCredential(playerId: string, newHash: Buffer) {
    const p = this.players.get(playerId);
    if (!p) throw new StoreError("not-found", `Player ${playerId} not found`);
    p.credentialHash = Buffer.from(newHash);
    p.credentialVersion += 1;
    p.credentialIssuedAt = now();
    p.credentialRevokedAt = null;
    return p.credentialVersion;
  }

  async revokeCredential(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) throw new StoreError("not-found", `Player ${playerId} not found`);
    p.credentialRevokedAt = now();
  }

  async startGame(roomId: string, expectedRoomVersion: number, initialState: GameState, event: NewGameEvent) {
    const state = this.validated(initialState);
    const room = this.room(roomId, expectedRoomVersion);
    if (room.status !== "lobby" || this.sessions.has(roomId)) throw new StoreError("game-already-started", "The game has already started");
    const t = now();
    const session: GameSessionRecord = { roomId, state, stateVersion: state.stateVersion, createdAt: t, updatedAt: t };
    const eventRecord = this.appendEvent(roomId, event, state.stateVersion);
    this.sessions.set(roomId, session);
    room.status = "playing";
    return { room: this.bump(room), session: clone(session), event: eventRecord };
  }

  async getGameSession(roomId: string) {
    const session = this.sessions.get(roomId);
    return session ? clone(session) : null;
  }

  async commitGameAction(input: CommitGameActionInput) {
    const state = this.validated(input.state);
    if (state.stateVersion <= input.expectedStateVersion) {
      throw new StoreError("invalid-state", "The new state must have a higher version than the expected one");
    }
    const session = this.sessions.get(input.roomId);
    if (!session) throw new StoreError("not-found", `No game in room ${input.roomId}`);
    const { event } = input;
    const duplicate = event.requestId !== null && (this.events.get(input.roomId) ?? []).some((e) => e.playerId === event.playerId && e.requestId === event.requestId);
    if (duplicate) throw new StoreError("duplicate-request", "This request was already committed");
    if (session.stateVersion !== input.expectedStateVersion) {
      throw new StoreError("version-conflict", `Game is at version ${session.stateVersion}, expected ${input.expectedStateVersion}`);
    }
    this.checkTransition(this.room(input.roomId).status, input.roomStatus);
    const eventRecord = this.appendEvent(input.roomId, event, state.stateVersion);
    session.state = state;
    session.stateVersion = state.stateVersion;
    session.updatedAt = now();
    const room = this.room(input.roomId);
    if (input.roomStatus) {
      room.status = input.roomStatus;
      this.bump(room);
    } else {
      room.lastActivityAt = now();
    }
    return { session: clone(session), event: eventRecord };
  }

  async findEventByRequest(roomId: string, playerId: string, requestId: string) {
    const e = (this.events.get(roomId) ?? []).find((x) => x.playerId === playerId && x.requestId === requestId);
    return e ? clone(e) : null;
  }

  async listEvents(roomId: string, options: { afterSeq?: number; limit?: number } = {}) {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 500);
    return (this.events.get(roomId) ?? []).filter((e) => e.seq > (options.afterSeq ?? 0)).slice(0, limit).map(clone);
  }

  async close() {}
}
