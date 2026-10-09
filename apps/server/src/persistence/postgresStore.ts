// PostgreSQL implementation of GameStore.
//
// Durability rule: a game action is reported as committed only after its
// transaction COMMITs (synchronous_commit is left at its safe default). Every
// multi-row change runs in one transaction; room rows are locked with
// SELECT … FOR UPDATE and checked against room_version; game commits use a
// conditional UPDATE on state_version, so two conflicting actions cannot both
// succeed, even across server processes.

import pg from "pg";
import type { Pool, PoolClient, PoolConfig } from "pg";
import { SCHEMA_VERSION, deserializeGameState, type GameState } from "@ludo/game-engine";
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

const MAX_CODE_ATTEMPTS = 8;
const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 500;
/** Raised by the rooms_status_transition trigger (migration 0002). */
const INVALID_TRANSITION_SQLSTATE = "LD001";

interface PgError {
  code?: string;
  constraint?: string;
}
const isUniqueViolation = (e: unknown, constraint?: string): boolean =>
  (e as PgError)?.code === "23505" && (constraint === undefined || (e as PgError).constraint === constraint);

/* eslint-disable @typescript-eslint/no-explicit-any -- pg rows are untyped; mapped explicitly below */
const toRoom = (r: any): RoomRecord => ({
  id: r.id,
  code: r.code,
  name: r.name,
  hostPlayerId: r.host_player_id,
  maxPlayers: r.max_players,
  visibility: r.visibility,
  settings: r.settings,
  status: r.status,
  roomVersion: r.room_version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastActivityAt: r.last_activity_at,
  expiresAt: r.expires_at,
  archivedAt: r.archived_at,
});

const toPlayer = (r: any): PlayerRecord => ({
  id: r.id,
  roomId: r.room_id,
  displayName: r.display_name,
  seat: r.seat,
  colour: r.colour,
  kind: r.kind,
  connectionStatus: r.connection_status,
  credentialVersion: r.credential_version,
  credentialIssuedAt: r.credential_issued_at,
  credentialRevokedAt: r.credential_revoked_at,
  joinedAt: r.joined_at,
  lastSeenAt: r.last_seen_at,
  leftAt: r.left_at,
  finishPlace: r.finish_place,
});

const toEvent = (r: any): GameEventRecord => ({
  id: String(r.id),
  roomId: r.room_id,
  seq: r.seq,
  playerId: r.player_id,
  actionType: r.action_type,
  requestId: r.request_id,
  payload: r.payload,
  resultStateVersion: r.result_state_version,
  createdAt: r.created_at,
});

function toSession(r: any): GameSessionRecord {
  let state: GameState;
  try {
    state = deserializeGameState(r.state);
  } catch (error) {
    throw new StoreError("invalid-state", `Stored game for room ${r.room_id} failed validation: ${(error as Error).message}`);
  }
  if (state.stateVersion !== r.state_version) {
    throw new StoreError("invalid-state", `Stored game for room ${r.room_id} has mismatched state versions`);
  }
  return { roomId: r.room_id, state, stateVersion: r.state_version, createdAt: r.created_at, updatedAt: r.updated_at };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Validates a state before it is ever written. */
function validated(state: GameState): GameState {
  try {
    return deserializeGameState(JSON.parse(JSON.stringify(state)));
  } catch (error) {
    throw new StoreError("invalid-state", `Refusing to store an invalid game state: ${(error as Error).message}`);
  }
}

function sessionColumns(state: GameState) {
  const current = state.phase === "playing" ? state.players[state.currentPlayerIndex]!.id : null;
  return {
    state: JSON.stringify(state),
    stateVersion: state.stateVersion,
    phase: state.phase,
    currentPlayerId: current,
    settings: JSON.stringify(state.settings),
    winnerPlayerId: state.winnerId,
    ranking: JSON.stringify(state.ranking),
  };
}

export class PostgresGameStore implements GameStore {
  constructor(private readonly pool: Pool) {}

  static connect(connectionString: string, config: Omit<PoolConfig, "connectionString"> = {}): PostgresGameStore {
    return new PostgresGameStore(new pg.Pool({ connectionString, max: 10, ...config }));
  }

  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as PgError)?.code === INVALID_TRANSITION_SQLSTATE) {
        throw new StoreError("invalid-transition", (error as Error).message);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Locks the room row and checks its version. */
  private async lockRoom(client: PoolClient, roomId: string, expectedRoomVersion: number): Promise<RoomRecord> {
    const { rows } = await client.query("SELECT * FROM rooms WHERE id = $1 FOR UPDATE", [roomId]);
    if (rows.length === 0) throw new StoreError("not-found", `Room ${roomId} not found`);
    const room = toRoom(rows[0]);
    if (room.roomVersion !== expectedRoomVersion) {
      throw new StoreError("version-conflict", `Room is at version ${room.roomVersion}, expected ${expectedRoomVersion}`);
    }
    return room;
  }

  private async bumpRoom(client: PoolClient, roomId: string, set = "", params: unknown[] = []): Promise<RoomRecord> {
    const { rows } = await client.query(
      `UPDATE rooms SET ${set}${set ? ", " : ""}room_version = room_version + 1, updated_at = now(), last_activity_at = now()
       WHERE id = $1 RETURNING *`,
      [roomId, ...params],
    );
    return toRoom(rows[0]);
  }

  private async insertPlayer(client: PoolClient, roomId: string, p: NewPlayer): Promise<PlayerRecord> {
    try {
      const { rows } = await client.query(
        `INSERT INTO players (id, room_id, display_name, seat, colour, kind, credential_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [p.id, roomId, p.displayName, p.seat, p.colour, p.kind ?? "remote", p.credentialHash],
      );
      return toPlayer(rows[0]);
    } catch (error) {
      if (isUniqueViolation(error, "players_active_seat_idx")) throw new StoreError("seat-taken", `Seat ${p.seat} is taken`);
      if (isUniqueViolation(error, "players_active_colour_idx")) throw new StoreError("colour-taken", `Colour ${p.colour} is taken`);
      if (isUniqueViolation(error, "players_active_name_idx")) throw new StoreError("name-taken", "That name is already used in this room");
      throw error;
    }
  }

  private async insertEvent(client: PoolClient, roomId: string, event: NewGameEvent, resultStateVersion: number): Promise<GameEventRecord> {
    try {
      const { rows } = await client.query(
        `INSERT INTO game_events (room_id, seq, player_id, action_type, request_id, payload, result_state_version)
         VALUES ($1, (SELECT COALESCE(MAX(seq), 0) + 1 FROM game_events WHERE room_id = $1), $2, $3, $4, $5, $6)
         RETURNING *`,
        [roomId, event.playerId, event.actionType, event.requestId, JSON.stringify(event.payload ?? null), resultStateVersion],
      );
      return toEvent(rows[0]);
    } catch (error) {
      if (isUniqueViolation(error, "game_events_request_idx")) throw new StoreError("duplicate-request", "This request was already committed");
      throw error;
    }
  }

  async createRoom(room: NewRoom, host: NewPlayer, generateCode: () => string) {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateCode();
      try {
        return await this.tx(async (client) => {
          const { rows } = await client.query(
            `INSERT INTO rooms (id, code, name, host_player_id, max_players, visibility, settings, status, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'lobby', $8) RETURNING *`,
            [room.id, code, room.name, host.id, room.maxPlayers, room.visibility, JSON.stringify(room.settings), room.expiresAt ?? null],
          );
          const hostRecord = await this.insertPlayer(client, room.id, host);
          return { room: toRoom(rows[0]), host: hostRecord };
        });
      } catch (error) {
        if (isUniqueViolation(error, "rooms_code_key")) continue; // astronomically rare: draw another code
        throw error;
      }
    }
    throw new StoreError("room-code-exhausted", "Could not allocate a unique room code");
  }

  async getRoom(roomId: string) {
    const { rows } = await this.pool.query("SELECT * FROM rooms WHERE id = $1", [roomId]);
    return rows[0] ? toRoom(rows[0]) : null;
  }

  async getRoomByCode(code: string) {
    const { rows } = await this.pool.query("SELECT * FROM rooms WHERE code = $1", [code]);
    return rows[0] ? toRoom(rows[0]) : null;
  }

  /** Validates and applies a patch to a locked room, bumping its version. */
  private async applyPatch(client: PoolClient, roomId: string, patch: RoomPatch): Promise<RoomRecord> {
    if (patch.hostPlayerId !== undefined) {
      const { rows } = await client.query("SELECT 1 FROM players WHERE id = $1 AND room_id = $2 AND left_at IS NULL", [patch.hostPlayerId, roomId]);
      if (rows.length === 0) throw new StoreError("not-found", "New host is not an active member of this room");
    }
    if (patch.maxPlayers !== undefined) {
      const { rows } = await client.query("SELECT count(*)::int AS n FROM players WHERE room_id = $1 AND left_at IS NULL", [roomId]);
      if (rows[0].n > patch.maxPlayers) throw new StoreError("capacity-conflict", `The room already has ${rows[0].n} players`);
    }
    const effective: RoomPatch = patch.status === "archived" && patch.archivedAt === undefined ? { ...patch, archivedAt: new Date() } : patch;
    const columns: Record<keyof RoomPatch, string> = {
      name: "name",
      status: "status",
      settings: "settings",
      hostPlayerId: "host_player_id",
      maxPlayers: "max_players",
      expiresAt: "expires_at",
      archivedAt: "archived_at",
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(columns) as [keyof RoomPatch, string][]) {
      if (effective[key] === undefined) continue;
      params.push(key === "settings" ? JSON.stringify(effective[key]) : effective[key]);
      sets.push(`${column} = $${params.length + 1}`);
    }
    return this.bumpRoom(client, roomId, sets.join(", "), params);
  }

  async updateRoom(roomId: string, expectedRoomVersion: number, patch: RoomPatch) {
    return this.tx(async (client) => {
      await this.lockRoom(client, roomId, expectedRoomVersion);
      return this.applyPatch(client, roomId, patch);
    });
  }

  async addPlayer(roomId: string, expectedRoomVersion: number, player: NewPlayer) {
    return this.tx(async (client) => {
      const room = await this.lockRoom(client, roomId, expectedRoomVersion);
      if (room.status !== "lobby") throw new StoreError("game-already-started", "Players can only join a room in the lobby");
      const { rows } = await client.query("SELECT count(*)::int AS n FROM players WHERE room_id = $1 AND left_at IS NULL", [roomId]);
      if (rows[0].n >= room.maxPlayers) throw new StoreError("room-full", "The room is full");
      const record = await this.insertPlayer(client, roomId, player);
      return { room: await this.bumpRoom(client, roomId), player: record };
    });
  }

  async getPlayer(playerId: string) {
    const { rows } = await this.pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
    return rows[0] ? toPlayer(rows[0]) : null;
  }

  async listPlayers(roomId: string, options: { includeLeft?: boolean } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM players WHERE room_id = $1 ${options.includeLeft ? "" : "AND left_at IS NULL"} ORDER BY seat, joined_at`,
      [roomId],
    );
    return rows.map(toPlayer);
  }

  async setConnectionStatus(playerId: string, status: "connected" | "disconnected", at = new Date()) {
    await this.pool.query("UPDATE players SET connection_status = $2, last_seen_at = $3 WHERE id = $1 AND left_at IS NULL", [playerId, status, at]);
  }

  async markPlayerLeft(roomId: string, expectedRoomVersion: number, playerId: string, patch: RoomPatch = {}) {
    return this.tx(async (client) => {
      await this.lockRoom(client, roomId, expectedRoomVersion);
      const { rowCount } = await client.query(
        "UPDATE players SET left_at = now(), connection_status = 'left' WHERE id = $1 AND room_id = $2 AND left_at IS NULL",
        [playerId, roomId],
      );
      if (rowCount === 0) throw new StoreError("not-found", "Player is not an active member of this room");
      return this.applyPatch(client, roomId, patch); // a new host must still be active after this player left
    });
  }

  async setFinishPlace(playerId: string, place: number | null) {
    await this.pool.query("UPDATE players SET finish_place = $2 WHERE id = $1", [playerId, place]);
  }

  async getCredential(playerId: string): Promise<PlayerCredential | null> {
    const { rows } = await this.pool.query("SELECT id, credential_hash, credential_version, credential_revoked_at FROM players WHERE id = $1", [playerId]);
    const r = rows[0];
    return r ? { playerId: r.id, hash: r.credential_hash, version: r.credential_version, revokedAt: r.credential_revoked_at } : null;
  }

  async rotateCredential(playerId: string, newHash: Buffer) {
    const { rows } = await this.pool.query(
      `UPDATE players SET credential_hash = $2, credential_version = credential_version + 1,
         credential_issued_at = now(), credential_revoked_at = NULL
       WHERE id = $1 RETURNING credential_version`,
      [playerId, newHash],
    );
    if (rows.length === 0) throw new StoreError("not-found", `Player ${playerId} not found`);
    return rows[0].credential_version as number;
  }

  async revokeCredential(playerId: string) {
    const { rowCount } = await this.pool.query("UPDATE players SET credential_revoked_at = now() WHERE id = $1", [playerId]);
    if (rowCount === 0) throw new StoreError("not-found", `Player ${playerId} not found`);
  }

  async startGame(roomId: string, expectedRoomVersion: number, initialState: GameState, event: NewGameEvent) {
    const state = validated(initialState);
    return this.tx(async (client) => {
      const locked = await this.lockRoom(client, roomId, expectedRoomVersion);
      if (locked.status !== "lobby") throw new StoreError("game-already-started", "The game has already started");
      const c = sessionColumns(state);
      let sessionRow;
      try {
        ({ rows: [sessionRow] } = await client.query(
          `INSERT INTO game_sessions (room_id, state, state_version, engine_schema_version, phase, current_player_id, settings, winner_player_id, ranking)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [roomId, c.state, c.stateVersion, SCHEMA_VERSION, c.phase, c.currentPlayerId, c.settings, c.winnerPlayerId, c.ranking],
        ));
      } catch (error) {
        if (isUniqueViolation(error)) throw new StoreError("game-already-started", "The game has already started");
        throw error;
      }
      const eventRecord = await this.insertEvent(client, roomId, event, state.stateVersion);
      const room = await this.bumpRoom(client, roomId, "status = 'playing'");
      return { room, session: toSession(sessionRow), event: eventRecord };
    });
  }

  async getGameSession(roomId: string) {
    const { rows } = await this.pool.query("SELECT * FROM game_sessions WHERE room_id = $1", [roomId]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async commitGameAction(input: CommitGameActionInput) {
    const state = validated(input.state);
    if (state.stateVersion <= input.expectedStateVersion) {
      throw new StoreError("invalid-state", "The new state must have a higher version than the expected one");
    }
    return this.tx(async (client) => {
      const { event, roomId } = input;
      if (event.requestId !== null && event.playerId !== null) {
        const existing = await client.query("SELECT 1 FROM game_events WHERE room_id = $1 AND player_id = $2 AND request_id = $3", [
          roomId,
          event.playerId,
          event.requestId,
        ]);
        if (existing.rows.length > 0) throw new StoreError("duplicate-request", "This request was already committed");
      }
      const c = sessionColumns(state);
      const { rows } = await client.query(
        `UPDATE game_sessions SET state = $3, state_version = $4, phase = $5, current_player_id = $6,
           settings = $7, winner_player_id = $8, ranking = $9, updated_at = now()
         WHERE room_id = $1 AND state_version = $2 RETURNING *`,
        [roomId, input.expectedStateVersion, c.state, c.stateVersion, c.phase, c.currentPlayerId, c.settings, c.winnerPlayerId, c.ranking],
      );
      if (rows.length === 0) {
        const current = await client.query("SELECT state_version FROM game_sessions WHERE room_id = $1", [roomId]);
        if (current.rows.length === 0) throw new StoreError("not-found", `No game in room ${roomId}`);
        if (event.requestId !== null && event.playerId !== null) {
          const dup = await client.query("SELECT 1 FROM game_events WHERE room_id = $1 AND player_id = $2 AND request_id = $3", [
            roomId,
            event.playerId,
            event.requestId,
          ]);
          if (dup.rows.length > 0) throw new StoreError("duplicate-request", "This request was already committed");
        }
        throw new StoreError("version-conflict", `Game is at version ${current.rows[0].state_version}, expected ${input.expectedStateVersion}`);
      }
      const eventRecord = await this.insertEvent(client, roomId, event, state.stateVersion);
      if (input.roomStatus) await this.bumpRoom(client, roomId, "status = $2", [input.roomStatus]);
      else await client.query("UPDATE rooms SET last_activity_at = now(), updated_at = now() WHERE id = $1", [roomId]);
      return { session: toSession(rows[0]), event: eventRecord };
    });
  }

  async findEventByRequest(roomId: string, playerId: string, requestId: string) {
    const { rows } = await this.pool.query("SELECT * FROM game_events WHERE room_id = $1 AND player_id = $2 AND request_id = $3", [
      roomId,
      playerId,
      requestId,
    ]);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async listEvents(roomId: string, options: { afterSeq?: number; limit?: number } = {}) {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_EVENT_LIMIT), 1), MAX_EVENT_LIMIT);
    const { rows } = await this.pool.query("SELECT * FROM game_events WHERE room_id = $1 AND seq > $2 ORDER BY seq LIMIT $3", [
      roomId,
      options.afterSeq ?? 0,
      limit,
    ]);
    return rows.map(toEvent);
  }

  async close() {
    await this.pool.end();
  }
}
