// The client's only path to the server: a typed wrapper around one Socket.IO
// connection. It sends requests with request ids, turns acknowledgements into
// results or ProtocolRequestErrors, and keeps the authoritative room and game
// state exactly as the server reports it (newer versions only). It holds no
// rules: everything shown comes from the server.
//
// Deliberately free of DOM and React so it can be exercised against a real
// server in integration tests.

import type {
  Ack,
  ActionData,
  GameActionView,
  ClientToServerEvents,
  ErrorDetails,
  GameStateView,
  MembershipData,
  PlayerSessionCredential,
  ProtocolErrorCode,
  ResumeData,
  RoomPreview,
  RoomStateData,
  RoomView,
  ServerToClientEvents,
  SessionEndReason,
} from "@ludo/shared-types";
import type { Socket } from "socket.io-client";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type LinkStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface BoundSeat {
  roomId: string;
  roomCode: string;
  playerId: string;
}

export interface ConnectionState {
  link: LinkStatus;
  /** The seat this connection controls, if any. */
  seat: BoundSeat | null;
  room: RoomView | null;
  game: GameStateView | null;
  /** Set when the server detached this connection from its seat. */
  ended: SessionEndReason | null;
}

/** Lobby-worthy changes, derived from authoritative updates (for toasts and announcements). */
export type Notice =
  | { kind: "player-joined"; name: string }
  | { kind: "player-left"; name: string }
  | { kind: "player-connected"; name: string }
  | { kind: "player-disconnected"; name: string }
  | { kind: "host-changed"; name: string; isYou: boolean }
  | { kind: "game-started" }
  | { kind: "room-closed" }
  | { kind: "game-paused"; reason: "connection-lost" | "host" }
  | { kind: "game-resumed" }
  | { kind: "session-ended"; reason: SessionEndReason }
  | { kind: "seat-restored" };

export class ProtocolRequestError extends Error {
  override name = "ProtocolRequestError";
  constructor(
    readonly code: ProtocolErrorCode | "timeout" | "offline",
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
  }
}

type EventName = keyof ClientToServerEvents;
type RequestOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[0];
type DataOf<E extends EventName> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0] extends Ack<infer T> ? T : never;

export interface CreateRoomInput {
  hostName: string;
  maxPlayers: number;
  roomName?: string | null;
  colour?: string;
  autoMove?: boolean;
  rankingMode?: "winner-only" | "full-ranking";
}

export interface JoinRoomInput {
  code: string;
  displayName: string;
  colour?: string;
}

let requestCounter = 0;
const newRequestId = () => `c${Date.now().toString(36)}${(++requestCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class GameConnection {
  private state: ConnectionState;
  private readonly listeners = new Set<() => void>();
  private readonly noticeListeners = new Set<(notice: Notice) => void>();
  /** Kept in memory only, to re-attach the seat after the transport reconnects. */
  private credential: PlayerSessionCredential | null = null;
  /** The control epoch this page was given for its seat (memory only; see ResumeRequest.controlEpoch). */
  private controlEpoch: number | null = null;
  private everConnected = false;
  private reconciling: Promise<void> | null = null;
  private stateWatch: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly socket: ClientSocket,
    private readonly options: { requestTimeoutMs?: number } = {},
  ) {
    this.state = { link: socket.connected ? "connected" : "connecting", seat: null, room: null, game: null, ended: null };
    socket.on("connect", () => {
      const wasReconnect = this.everConnected;
      this.everConnected = true;
      this.patch({ link: "connected" });
      // A new transport connection is a new server-side socket: re-attach the seat this tab held.
      if (wasReconnect && this.credential && this.state.seat) void this.reattach();
    });
    socket.on("disconnect", () => this.patch({ link: this.everConnected ? "reconnecting" : "offline" }));
    socket.on("connect_error", () => this.patch({ link: this.everConnected ? "reconnecting" : "offline" }));
    socket.on("room:updated", ({ room }) => this.applyRoom(room));
    socket.on("game:state", ({ roomId, game }) => {
      if (this.state.room?.roomId === roomId) this.applyGame(game);
    });
    // Each committed action is announced, then its snapshot follows. A gap in
    // versions means something was missed: fetch the authoritative state.
    socket.on("game:event", ({ roomId, action }) => {
      if (this.state.room?.roomId !== roomId) return;
      const held = this.state.game?.stateVersion ?? -1;
      if (action.stateVersion > held + 1) this.reconcile();
      else this.expectState(action.stateVersion);
    });
    socket.on("player:connected", ({ roomId, playerId }) => this.applyPresence(roomId, playerId, "connected"));
    socket.on("player:disconnected", ({ roomId, playerId }) => this.applyPresence(roomId, playerId, "disconnected"));
    socket.on("game:paused", ({ roomId, pause }) => {
      if (this.state.room?.roomId === roomId) this.emit({ kind: "game-paused", reason: pause.reason });
    });
    socket.on("game:resumed", ({ roomId }) => {
      if (this.state.room?.roomId === roomId) this.emit({ kind: "game-resumed" });
    });
    socket.on("session:ended", ({ reason }) => {
      this.credential = null;
      this.controlEpoch = null;
      this.patch({ seat: null, ended: reason });
      this.emit({ kind: "session-ended", reason });
    });
  }

  // ── State ────────────────────────────────────────────────────────────────

  getState = (): ConnectionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onNotice(listener: (notice: Notice) => void): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  // ── Requests ─────────────────────────────────────────────────────────────

  /** Sends one request with a fresh request id and resolves with the acknowledged data. */
  async request<E extends EventName>(event: E, payload: Omit<RequestOf<E>, "requestId">): Promise<DataOf<E>> {
    if (!this.socket.connected && this.state.link === "offline") {
      // Socket.IO buffers until connected; fail fast only when the server was never reachable.
      this.socket.connect();
    }
    const timeout = this.options.requestTimeoutMs ?? 10_000;
    let ack: Ack<DataOf<E>>;
    try {
      ack = await (this.socket.timeout(timeout) as unknown as { emitWithAck(e: string, p: unknown): Promise<Ack<DataOf<E>>> }).emitWithAck(event, {
        ...payload,
        requestId: newRequestId(),
      });
    } catch {
      throw new ProtocolRequestError("timeout", "The server did not answer in time");
    }
    if (!ack.ok) throw new ProtocolRequestError(ack.error.code, ack.error.message, ack.error.details);
    return ack.data;
  }

  async createRoom(input: CreateRoomInput): Promise<MembershipData> {
    const data = await this.request("room:create", input as RequestOf<"room:create">);
    this.bind(data.room, data.player.playerId, data.credential, data.controlEpoch);
    return data;
  }

  previewRoom(code: string): Promise<RoomPreview> {
    return this.request("room:preview", { code }).then((d) => d.preview);
  }

  async joinRoom(input: JoinRoomInput): Promise<MembershipData> {
    const data = await this.request("room:join", input);
    this.bind(data.room, data.player.playerId, data.credential, data.controlEpoch);
    return data;
  }

  /** Re-attaches a stored seat. `takeover` moves control from another tab or device (it is told). */
  resume(credential: PlayerSessionCredential, options: { takeover?: boolean } = {}): Promise<ResumeData> {
    return this.resumeSeat(credential, options.takeover ? { takeover: true } : {});
  }

  private async resumeSeat(credential: PlayerSessionCredential, extra: { takeover?: true; controlEpoch?: number }): Promise<ResumeData> {
    const data = await this.request("room:resume", {
      credential,
      ...extra,
      ...(this.state.game && this.state.room?.roomId === this.state.seat?.roomId ? { knownStateVersion: this.state.game.stateVersion } : {}),
    });
    this.bind(data.room, data.player.playerId, credential, data.controlEpoch);
    if (data.game) this.applyGame(data.game);
    return data;
  }

  async startGame(): Promise<RoomStateData> {
    const data = await this.request("game:start", this.state.room ? { expectedRoomVersion: this.state.room.roomVersion } : {});
    this.applyRoom(data.room);
    if (data.game) this.applyGame(data.game);
    return data;
  }

  /** Asks the server to roll for this seat; the result arrives as authoritative state. */
  rollDice(): Promise<ActionData> {
    return this.act("game:roll", {});
  }

  /** Asks the server to move one of this seat's tokens (one the server listed as legal). */
  moveToken(tokenId: number): Promise<ActionData> {
    return this.act("game:move", { tokenId });
  }

  /** The room's complete action log, oldest first (authoritative; used for the end-of-game summary). */
  async fullHistory(maxPages = 50): Promise<GameActionView[]> {
    const actions: GameActionView[] = [];
    let afterSeq = 0;
    for (let page = 0; page < maxPages; page++) {
      const data = await this.request("game:getHistory", { afterSeq, limit: 100 });
      actions.push(...data.actions);
      if (!data.hasMore) return actions;
      afterSeq = data.nextAfterSeq;
    }
    return actions;
  }

  /** Host only: resumes a game the host paused. */
  async resumeGame(): Promise<void> {
    const data = await this.request("game:resume", this.state.room ? { expectedRoomVersion: this.state.room.roomVersion } : {});
    this.applyRoom(data.room);
  }

  async leaveRoom(): Promise<void> {
    await this.request("room:leave", {});
    this.credential = null;
    this.controlEpoch = null;
    this.patch({ seat: null, room: null, game: null, ended: null });
  }

  async refresh(): Promise<RoomStateData> {
    const data = await this.request("room:getState", {});
    this.applyRoom(data.room);
    if (data.game) this.applyGame(data.game);
    return data;
  }

  dispose(): void {
    if (this.stateWatch) clearTimeout(this.stateWatch);
    this.listeners.clear();
    this.noticeListeners.clear();
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async act(event: "game:roll" | "game:move", payload: { tokenId?: number }): Promise<ActionData> {
    const game = this.state.game;
    if (!game) throw new ProtocolRequestError("game-not-started", "The game has not started");
    const expectedStateVersion = game.stateVersion;
    try {
      const data =
        event === "game:roll"
          ? await this.request("game:roll", { expectedStateVersion })
          : await this.request("game:move", { expectedStateVersion, tokenId: payload.tokenId! });
      this.applyGame(data.game);
      return data;
    } catch (error) {
      // The board was behind, or the answer was lost: show what the server holds.
      const code = (error as ProtocolRequestError).code;
      if (code === "stale-state" || code === "timeout" || code === "not-your-turn" || code === "not-awaiting-roll" || code === "not-awaiting-move") this.reconcile();
      throw error;
    }
  }

  /** Fetches the authoritative room and game state once (concurrent calls share it). */
  private reconcile(): void {
    if (this.reconciling || !this.state.seat) return;
    this.reconciling = this.refresh()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.reconciling = null;
      });
  }

  /** An action was announced: its snapshot should follow; if it doesn't arrive, reconcile. */
  private expectState(version: number): void {
    if (this.stateWatch) clearTimeout(this.stateWatch);
    this.stateWatch = setTimeout(() => {
      this.stateWatch = null;
      if ((this.state.game?.stateVersion ?? -1) < version) this.reconcile();
    }, 2000);
  }

  private async reattach(): Promise<void> {
    try {
      // This page held the seat until its connection dropped. The server may not have noticed the
      // drop yet; the control epoch proves nobody else has claimed the seat since (see ResumeRequest).
      await this.resumeSeat(this.credential!, this.controlEpoch === null ? {} : { controlEpoch: this.controlEpoch });
      this.emit({ kind: "seat-restored" });
    } catch (error) {
      const code = (error as ProtocolRequestError).code;
      if (code === "session-in-use" || code === "session-expired" || code === "unauthenticated") {
        this.credential = null;
        this.controlEpoch = null;
        this.patch({ seat: null, ended: code === "session-in-use" ? "replaced" : "left" });
      }
    }
  }

  private bind(room: RoomView, playerId: string, credential: PlayerSessionCredential, controlEpoch: number): void {
    this.credential = credential;
    this.controlEpoch = controlEpoch;
    const sameRoom = this.state.room?.roomId === room.roomId;
    this.patch({
      seat: { roomId: room.roomId, roomCode: room.code, playerId },
      room,
      game: sameRoom ? this.state.game : null,
      ended: null,
    });
  }

  private applyRoom(room: RoomView): void {
    const previous = this.state.room;
    if (previous && previous.roomId === room.roomId && room.roomVersion < previous.roomVersion) return; // older than what we hold
    this.patch({ room });
    if (previous && previous.roomId === room.roomId) this.announceRoomChanges(previous, room);
  }

  private applyGame(game: GameStateView): void {
    const current = this.state.game;
    if (current && game.stateVersion < current.stateVersion) return;
    this.patch({ game });
  }

  private applyPresence(roomId: string, playerId: string, status: "connected" | "disconnected"): void {
    const room = this.state.room;
    if (!room || room.roomId !== roomId) return;
    const player = room.players.find((p) => p.playerId === playerId);
    if (!player || player.connectionStatus === status) return;
    this.patch({ room: { ...room, players: room.players.map((p) => (p.playerId === playerId ? { ...p, connectionStatus: status } : p)) } });
    this.emit({ kind: status === "connected" ? "player-connected" : "player-disconnected", name: player.displayName });
  }

  private announceRoomChanges(before: RoomView, after: RoomView): void {
    const was = new Map(before.players.map((p) => [p.playerId, p]));
    const now = new Map(after.players.map((p) => [p.playerId, p]));
    for (const p of after.players) if (!was.has(p.playerId)) this.emit({ kind: "player-joined", name: p.displayName });
    for (const p of before.players) if (!now.has(p.playerId)) this.emit({ kind: "player-left", name: p.displayName });
    if (before.hostPlayerId !== after.hostPlayerId) {
      const host = now.get(after.hostPlayerId);
      if (host) this.emit({ kind: "host-changed", name: host.displayName, isYou: host.playerId === this.state.seat?.playerId });
    }
    if (before.status === "lobby" && after.status === "playing") this.emit({ kind: "game-started" });
    if (before.status !== "abandoned" && after.status === "abandoned") this.emit({ kind: "room-closed" });
  }

  private patch(next: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  private emit(notice: Notice): void {
    for (const listener of [...this.noticeListeners]) listener(notice);
  }
}
