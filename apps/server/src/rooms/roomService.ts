// Room lifecycle and player management on top of the persistent GameStore.
//
// Transport-agnostic: Socket.IO handlers (2C) call these methods and relay
// the results or RoomError codes. All state lives in the store; the service
// keeps nothing between calls except rate-limit counters.
//
// Concurrency: every change is written with the room version it was computed
// from (optimistic concurrency). The store locks the room row and refuses a
// stale version, so two racing joins can never take the same seat, colour or
// last place. The loser re-reads and either succeeds against the new state or
// gets the precise reason (room-full, colour-taken, …). When a caller passes
// expectedRoomVersion, a stale version is reported instead of retried.

import { randomUUID } from "node:crypto";
import { createGame, drawIndex, type GameState } from "@ludo/game-engine";
import { MIN_PLAYERS, type PlayerSessionCredential, type RoomPlayerView, type RoomPreview, type RoomView } from "@ludo/shared-types";
import { hashCredential, issueCredential, verifyCredential } from "../auth-lite/credentials.js";
import { StoreError, type GameStore, type PlayerRecord, type RoomPatch, type RoomRecord, type StoreErrorCode } from "../persistence/types.js";
import { RoomError } from "./errors.js";
import { assertTransition, joinBlockError, joinBlockReason } from "./lifecycle.js";
import { CodeLookupGuard, DEFAULT_ROOM_CREATION_POLICY, SlidingWindowLimiter } from "./rateLimiter.js";
import { generateRoomCode, normalizeRoomCode } from "./roomCode.js";
import { assignSeat } from "./seating.js";
import {
  SETTINGS_FIELDS,
  applySettingsPatch,
  asRecord,
  assertKnownKeys,
  displayNameKey,
  normaliseDisplayName,
  normaliseRoomName,
  parseColourChoice,
  parseExpectedVersion,
  parsePlayerId,
  parseRequestId,
  parseNewRoomSettings,
} from "./validation.js";
import { toPlayerView, toRoomPreview, toRoomView } from "./views.js";

/** Who is calling. Only RoomService.authenticate creates these. */
export interface AuthenticatedPlayer {
  readonly playerId: string;
  readonly roomId: string;
}

export interface RequestContext {
  /** Rate-limit key from the transport: client IP or connection id. */
  clientKey: string;
}

export interface MembershipResult {
  room: RoomView;
  player: RoomPlayerView;
  /** Shown to this client once; only its digest is stored. */
  credential: PlayerSessionCredential;
}

export interface RoomServiceOptions {
  store: GameStore;
  generateCode?: () => string;
  newId?: () => string;
  /** Picks the first player's index among `count` seated players. */
  drawFirstPlayer?: (count: number) => number;
  lookupGuard?: CodeLookupGuard;
  creationLimiter?: SlidingWindowLimiter;
  /** Attempts per operation when racing other writers (default 8). */
  maxAttempts?: number;
}

/** Store conflicts that mean "someone else changed the room first": re-read and decide again. */
const RACE_CODES = new Set<StoreErrorCode>(["version-conflict", "seat-taken", "colour-taken", "room-full", "name-taken", "game-already-started"]);

const STORE_TO_ROOM: Partial<Record<StoreErrorCode, [RoomError["code"], string]>> = {
  "version-conflict": ["version-conflict", "The room changed in the meantime; reload it and try again"],
  "room-full": ["room-full", "The room is full"],
  "seat-taken": ["colour-taken", "That colour was just taken"],
  "colour-taken": ["colour-taken", "That colour was just taken"],
  "name-taken": ["name-taken", "That name is already used in this room"],
  "game-already-started": ["game-already-started", "The game has already started"],
  "invalid-transition": ["invalid-transition", "The room cannot change to that state"],
  "capacity-conflict": ["capacity-below-members", "More players have joined than that size allows"],
  "room-code-exhausted": ["room-code-exhausted", "Could not allocate a room code; please try again"],
  "not-found": ["room-not-found", "Room not found"],
};

const UNAVAILABLE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "57P01", "57P02", "57P03", "53300"]);

function isStorageUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && (UNAVAILABLE_CODES.has(code) || code.startsWith("08"))) return true;
  const message = (error as Error)?.message ?? "";
  return /Connection terminated|timeout exceeded when trying to connect|Cannot use a pool after calling end/i.test(message);
}

/** Converts store and driver failures into client-safe RoomErrors; anything else is a bug and propagates. */
function translate(error: unknown): unknown {
  if (error instanceof RoomError) return error;
  if (error instanceof StoreError) {
    const mapped = STORE_TO_ROOM[error.code];
    return mapped ? new RoomError(mapped[0], mapped[1]) : error;
  }
  if (isStorageUnavailable(error)) return new RoomError("storage-unavailable", "Rooms are temporarily unavailable; please try again shortly");
  return error;
}

/** Equalises the cost of authentication failures for unknown players. */
const UNKNOWN_PLAYER_DIGEST = hashCredential("no-such-player");

const byJoinOrder = (a: PlayerRecord, b: PlayerRecord) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.seat - b.seat;

export class RoomService {
  private readonly store: GameStore;
  private readonly generateCode: () => string;
  private readonly newId: () => string;
  private readonly drawFirstPlayer: (count: number) => number;
  private readonly lookupGuard: CodeLookupGuard;
  private readonly creationLimiter: SlidingWindowLimiter;
  private readonly maxAttempts: number;
  /** Identity objects issued by authenticate(); anything else is refused. */
  private readonly actors = new WeakSet<AuthenticatedPlayer>();

  constructor(options: RoomServiceOptions) {
    this.store = options.store;
    this.generateCode = options.generateCode ?? generateRoomCode;
    this.newId = options.newId ?? randomUUID;
    this.drawFirstPlayer = options.drawFirstPlayer ?? ((count) => drawIndex(count));
    this.lookupGuard = options.lookupGuard ?? new CodeLookupGuard();
    this.creationLimiter = options.creationLimiter ?? new SlidingWindowLimiter(DEFAULT_ROOM_CREATION_POLICY);
    this.maxAttempts = options.maxAttempts ?? 8;
  }

  // ── Create, preview, join ────────────────────────────────────────────────

  async createRoom(input: unknown, context: RequestContext): Promise<MembershipResult> {
    const request = asRecord(input);
    assertKnownKeys(request, ["roomName", "hostName", "colour", ...SETTINGS_FIELDS], "invalid-request");
    this.throttle(this.creationLimiter.retryAfterMs(context.clientKey));
    const settings = parseNewRoomSettings(request);
    const displayName = normaliseDisplayName(request.hostName);
    const roomName = normaliseRoomName(request.roomName);
    const { seat, colour } = assignSeat(settings.maxPlayers, [], parseColourChoice(request.colour));
    this.creationLimiter.record(context.clientKey);

    const credential = issueCredential();
    const playerId = this.newId();
    try {
      const { room, host } = await this.store.createRoom(
        { id: this.newId(), name: roomName, maxPlayers: settings.maxPlayers, visibility: settings.visibility, settings },
        { id: playerId, displayName, seat, colour, credentialHash: credential.hash },
        this.generateCode,
      );
      return { room: toRoomView(room, [host]), player: toPlayerView(room, host), credential: { playerId, secret: credential.secret } };
    } catch (error) {
      throw translate(error);
    }
  }

  /** Read-only: never changes the room. */
  async previewRoom(code: unknown, context: RequestContext): Promise<RoomPreview> {
    const normalised = this.parseCode(code);
    this.throttle(this.lookupGuard.begin(context.clientKey));
    try {
      const room = await this.findRoom(normalised, context);
      return toRoomPreview(room, await this.store.listPlayers(room.id));
    } catch (error) {
      throw translate(error);
    }
  }

  async joinRoom(input: unknown, context: RequestContext): Promise<MembershipResult> {
    const request = asRecord(input);
    assertKnownKeys(request, ["code", "displayName", "colour", "credential"], "invalid-request");
    const code = this.parseCode(request.code);
    const displayName = normaliseDisplayName(request.displayName);
    const choice = parseColourChoice(request.colour);
    this.throttle(this.lookupGuard.begin(context.clientKey));

    try {
      let room = await this.findRoom(code, context);
      for (let attempt = 1; ; attempt++) {
        const players = await this.store.listPlayers(room.id);
        if (request.credential !== undefined && (await this.isActiveMember(room.id, request.credential, players))) {
          throw new RoomError("already-member", "You are already in this room; rejoin it instead of joining again");
        }
        const blocked = joinBlockReason(room.status, players.length, room.maxPlayers);
        if (blocked) throw joinBlockError(blocked);
        const key = displayNameKey(displayName);
        if (players.some((p) => displayNameKey(p.displayName) === key)) {
          throw new RoomError("name-taken", "That name is already used in this room");
        }
        const { seat, colour } = assignSeat(room.maxPlayers, players, choice);
        const credential = issueCredential();
        const playerId = this.newId();
        try {
          const added = await this.store.addPlayer(room.id, room.roomVersion, { id: playerId, displayName, seat, colour, credentialHash: credential.hash });
          return {
            room: toRoomView(added.room, [...players, added.player]),
            player: toPlayerView(added.room, added.player),
            credential: { playerId, secret: credential.secret },
          };
        } catch (error) {
          if (!(error instanceof StoreError && RACE_CODES.has(error.code) && attempt < this.maxAttempts)) throw error;
          const fresh = await this.store.getRoom(room.id);
          if (!fresh || fresh.status === "archived") throw new RoomError("room-not-found", "Room not found");
          room = fresh;
        }
      }
    } catch (error) {
      throw translate(error);
    }
  }

  // ── Identity ─────────────────────────────────────────────────────────────

  /**
   * Verifies a player credential ({ playerId, secret }) and returns the
   * identity used for every member operation. Every failure looks the same.
   */
  async authenticate(input: unknown): Promise<AuthenticatedPlayer> {
    const fail = () => new RoomError("unauthenticated", "Not signed in to this room");
    if (typeof input !== "object" || input === null) throw fail();
    const { playerId: rawId, secret } = input as Record<string, unknown>;
    const playerId = parsePlayerId(rawId, "unauthenticated");
    try {
      const [credential, player] = await Promise.all([this.store.getCredential(playerId), this.store.getPlayer(playerId)]);
      const matches = verifyCredential(secret, credential?.hash ?? UNKNOWN_PLAYER_DIGEST);
      if (!matches || !credential || credential.revokedAt !== null || !player || player.leftAt !== null) throw fail();
      const actor: AuthenticatedPlayer = Object.freeze({ playerId, roomId: player.roomId });
      this.actors.add(actor);
      return actor;
    } catch (error) {
      throw translate(error);
    }
  }

  // ── Member and host operations ───────────────────────────────────────────

  async getRoomView(actor: AuthenticatedPlayer): Promise<RoomView> {
    return this.attempt(true, async () => {
      const { room, players } = await this.loadMember(actor);
      return toRoomView(room, players);
    });
  }

  /** Host only, lobby only. Accepts any subset of the settings plus the room name. */
  async updateSettings(actor: AuthenticatedPlayer, input: unknown): Promise<RoomView> {
    const request = asRecord(input);
    assertKnownKeys(request, ["expectedRoomVersion", "name", ...SETTINGS_FIELDS], "invalid-request");
    const expected = parseExpectedVersion(request.expectedRoomVersion);
    return this.attempt(expected !== undefined, async () => {
      const { room, players } = await this.loadHost(actor, expected);
      if (room.status !== "lobby") throw new RoomError("settings-locked", "Settings can only change before the game starts");
      const settings = applySettingsPatch(room.settings, request);
      if (settings.maxPlayers < players.length) {
        throw new RoomError("capacity-below-members", `${players.length} players have already joined`, { joinedCount: players.length });
      }
      const patch: RoomPatch = { settings, maxPlayers: settings.maxPlayers };
      if (request.name !== undefined) patch.name = normaliseRoomName(request.name);
      return toRoomView(await this.store.updateRoom(room.id, room.roomVersion, patch), players);
    });
  }

  /** Host only: hand the host role to another active member. */
  async transferHost(actor: AuthenticatedPlayer, input: unknown): Promise<RoomView> {
    const request = asRecord(input);
    assertKnownKeys(request, ["expectedRoomVersion", "playerId"], "invalid-request");
    const expected = parseExpectedVersion(request.expectedRoomVersion);
    const target = parsePlayerId(request.playerId);
    return this.attempt(expected !== undefined, async () => {
      const { room, players } = await this.loadHost(actor, expected);
      if (room.status === "archived") throw new RoomError("room-closed", "This room has been archived");
      if (target === actor.playerId || !players.some((p) => p.id === target)) {
        throw new RoomError("invalid-target", "The new host must be another member of this room");
      }
      return toRoomView(await this.store.updateRoom(room.id, room.roomVersion, { hostPlayerId: target }), players);
    });
  }

  /** Host only, lobby only: remove another member, freeing their seat and colour. */
  async removePlayer(actor: AuthenticatedPlayer, input: unknown): Promise<RoomView> {
    const request = asRecord(input);
    assertKnownKeys(request, ["expectedRoomVersion", "playerId"], "invalid-request");
    const expected = parseExpectedVersion(request.expectedRoomVersion);
    const target = parsePlayerId(request.playerId);
    return this.attempt(expected !== undefined, async () => {
      const { room, players } = await this.loadHost(actor, expected);
      this.assertLobbyForMembership(room);
      if (target === actor.playerId || !players.some((p) => p.id === target)) {
        throw new RoomError("invalid-target", "That player is not another member of this room");
      }
      const updated = await this.store.markPlayerLeft(room.id, room.roomVersion, target);
      return toRoomView(updated, players.filter((p) => p.id !== target));
    });
  }

  /**
   * Leave the room. A departing host hands over to the longest-standing
   * remaining member in the same transaction; the last member to leave a
   * lobby abandons it. Leaving a game in progress is not a lobby action:
   * disconnects and forfeits mid-game are handled by Batch 2D.
   */
  async leaveRoom(actor: AuthenticatedPlayer, input: unknown = {}): Promise<RoomView> {
    const request = asRecord(input);
    assertKnownKeys(request, ["expectedRoomVersion"], "invalid-request");
    const expected = parseExpectedVersion(request.expectedRoomVersion);
    return this.attempt(expected !== undefined, async () => {
      const { room, players } = await this.loadMember(actor, expected);
      this.assertLobbyForMembership(room, ["finished", "abandoned"]);
      const remaining = players.filter((p) => p.id !== actor.playerId);
      const patch: RoomPatch = {};
      if (room.hostPlayerId === actor.playerId && remaining.length > 0) patch.hostPlayerId = [...remaining].sort(byJoinOrder)[0]!.id;
      if (remaining.length === 0 && room.status === "lobby") patch.status = "abandoned";
      const updated = await this.store.markPlayerLeft(room.id, room.roomVersion, actor.playerId, patch);
      return toRoomView(updated, remaining);
    });
  }

  /**
   * Host only: start the game with everyone currently in the room (at least
   * two). Creates the engine game, the session and its first event, and moves
   * the room to "playing", atomically. Broadcasting is the transport's job (2C).
   */
  async startGame(actor: AuthenticatedPlayer, input: unknown = {}): Promise<{ room: RoomView; state: GameState }> {
    const request = asRecord(input);
    assertKnownKeys(request, ["expectedRoomVersion", "requestId"], "invalid-request");
    const expected = parseExpectedVersion(request.expectedRoomVersion);
    const requestId = parseRequestId(request.requestId);
    return this.attempt(expected !== undefined, async () => {
      const { room, players } = await this.loadHost(actor, expected);
      if (room.status === "playing" || room.status === "paused") throw new RoomError("game-already-started", "The game has already started");
      if (room.status !== "lobby") throw new RoomError("room-closed", "This room has closed");
      if (players.length < MIN_PLAYERS) {
        throw new RoomError("not-enough-players", `At least ${MIN_PLAYERS} players are needed to start`, { joinedCount: players.length });
      }
      const seated = [...players].sort((a, b) => a.seat - b.seat);
      const firstPlayerIndex = this.drawFirstPlayer(seated.length);
      const state = createGame({
        players: seated.map((p) => ({ id: p.id, seat: p.seat })),
        settings: { autoMove: room.settings.autoMove, rankingMode: room.settings.rankingMode },
        firstPlayerIndex,
      });
      const started = await this.store.startGame(room.id, room.roomVersion, state, {
        playerId: actor.playerId,
        actionType: "game:start",
        requestId,
        payload: { seats: seated.map((p) => p.seat), firstPlayerIndex },
      });
      return { room: toRoomView(started.room, players), state: started.session.state };
    });
  }

  /** Host only: end the room without a result (lobby, playing or paused → abandoned). */
  async closeRoom(actor: AuthenticatedPlayer, input: unknown = {}): Promise<RoomView> {
    return this.changeStatus(actor, input, "abandoned");
  }

  /** Host only: archive a finished or abandoned room. Its code stops working. */
  async archiveRoom(actor: AuthenticatedPlayer, input: unknown = {}): Promise<RoomView> {
    return this.changeStatus(actor, input, "archived");
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async changeStatus(actor: AuthenticatedPlayer, input: unknown, to: "abandoned" | "archived"): Promise<RoomView> {
    const request = asRecord(input);
    assertKnownKeys(request, ["expectedRoomVersion"], "invalid-request");
    const expected = parseExpectedVersion(request.expectedRoomVersion);
    return this.attempt(expected !== undefined, async () => {
      const { room, players } = await this.loadHost(actor, expected);
      assertTransition(room.status, to);
      return toRoomView(await this.store.updateRoom(room.id, room.roomVersion, { status: to }), players);
    });
  }

  /** Runs a read-decide-write step, re-running it when another writer got there first (unless strict). */
  private async attempt<T>(strict: boolean, step: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await step();
      } catch (error) {
        if (!strict && error instanceof StoreError && RACE_CODES.has(error.code) && attempt < this.maxAttempts) continue;
        throw translate(error);
      }
    }
  }

  private throttle(waitMs: number): void {
    if (waitMs > 0) {
      const retryAfterSeconds = Math.ceil(waitMs / 1000);
      throw new RoomError("rate-limited", `Too many attempts; try again in ${retryAfterSeconds} s`, { retryAfterSeconds });
    }
  }

  private parseCode(input: unknown): string {
    const code = normalizeRoomCode(input);
    if (!code) throw new RoomError("invalid-room-code", "Room codes are 6 letters and digits");
    return code;
  }

  /** Unknown and archived rooms are indistinguishable to the caller, and both count as a miss. */
  private async findRoom(code: string, context: RequestContext): Promise<RoomRecord> {
    const room = await this.store.getRoomByCode(code);
    if (!room || room.status === "archived") {
      this.lookupGuard.recordMiss(context.clientKey);
      throw new RoomError("room-not-found", "Room not found");
    }
    return room;
  }

  private async isActiveMember(roomId: string, presented: unknown, players: readonly PlayerRecord[]): Promise<boolean> {
    if (typeof presented !== "object" || presented === null) return false;
    const { playerId, secret } = presented as Record<string, unknown>;
    const member = players.find((p) => p.id === playerId);
    if (!member || member.roomId !== roomId) return false;
    const credential = await this.store.getCredential(member.id);
    return credential !== null && credential.revokedAt === null && verifyCredential(secret, credential.hash);
  }

  private async loadMember(actor: AuthenticatedPlayer, expectedRoomVersion?: number) {
    if (!this.actors.has(actor)) throw new RoomError("unauthenticated", "Not signed in to this room");
    const room = await this.store.getRoom(actor.roomId);
    if (!room) throw new RoomError("room-not-found", "Room not found");
    const players = await this.store.listPlayers(room.id);
    if (!players.some((p) => p.id === actor.playerId)) throw new RoomError("not-a-member", "You are no longer a member of this room");
    if (expectedRoomVersion !== undefined && expectedRoomVersion !== room.roomVersion) {
      throw new RoomError("version-conflict", "The room changed in the meantime; reload it and try again", { roomVersion: room.roomVersion });
    }
    return { room, players };
  }

  private async loadHost(actor: AuthenticatedPlayer, expectedRoomVersion?: number) {
    const loaded = await this.loadMember(actor, expectedRoomVersion);
    if (loaded.room.hostPlayerId !== actor.playerId) throw new RoomError("not-host", "Only the host can do that");
    return loaded;
  }

  /** Membership changes happen in the lobby (and, for leaving, after the game ends). */
  private assertLobbyForMembership(room: RoomRecord, alsoAllowed: readonly RoomRecord["status"][] = []): void {
    if (room.status === "lobby" || alsoAllowed.includes(room.status)) return;
    if (room.status === "playing" || room.status === "paused") {
      throw new RoomError("game-in-progress", "Players cannot leave or be removed during a game");
    }
    throw new RoomError("room-closed", "This room has closed");
  }
}

