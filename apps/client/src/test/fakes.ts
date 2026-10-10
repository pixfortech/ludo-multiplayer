// Test doubles for UI tests. They imitate the GameClient interface only: UI
// tests prove rendering and interaction, NOT live multiplayer (that is proven
// by the real Socket.IO + PostgreSQL tests in apps/server).

import type { ActionData, GameActionView, GameStateView, MembershipData, PlayerSessionCredential, ResumeData, RoomPlayerView, RoomPreview, RoomStateData, RoomView } from "@ludo/shared-types";
import { ProtocolRequestError, type ConnectionState, type CreateRoomInput, type JoinRoomInput, type Notice } from "../lib/connection";
import { SeatStore, TabSeat, type KeyValueStorage } from "../lib/session";
import type { GameClient, GameServices } from "../state/gameClient";

export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

export function player(over: Partial<RoomPlayerView> = {}): RoomPlayerView {
  return { playerId: "p-host", displayName: "Aman", seat: 0, colour: "crimson", colourName: "Crimson", isHost: true, connectionStatus: "connected", joinedAt: "2026-01-01T00:00:00.000Z", ...over };
}

export function roomView(over: Partial<RoomView> = {}): RoomView {
  const players = over.players ?? [player()];
  return {
    roomId: "room-1",
    code: "ABC234",
    name: null,
    status: "lobby",
    lifecycle: players.length >= 2 ? "ready" : "waiting",
    hostPlayerId: "p-host",
    maxPlayers: 4,
    settings: { maxPlayers: 4, cityTheme: "classic", autoMove: true, rankingMode: "winner-only", visibility: "private", turnTimerSeconds: 0, rules: { sixWithoutMoveGrantsRoll: true, captureStackedOpponents: true, blocksEnabled: false } },
    roomVersion: 0,
    players,
    canStart: players.length >= 2,
    pause: null,
    endedReason: null,
    ...over,
  };
}

export class FakeClient implements GameClient {
  state: ConnectionState = { link: "connected", seat: null, room: null, game: null, ended: null };
  calls: { method: string; args: unknown[] }[] = [];
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: Notice) => void>();
  createResult: MembershipData | Error | null = null;
  joinResult: MembershipData | Error | null = null;
  previewResult: RoomPreview | Error = new ProtocolRequestError("room-not-found", "Room not found");
  resumeResults: (ResumeData | Error)[] = [];
  startResult: RoomStateData | Error | null = null;
  rollResults: (ActionData | Error)[] = [];
  moveResults: (ActionData | Error)[] = [];
  /** When set, roll/move requests wait until the test resolves them. */
  hold: { release: () => void } | null = null;

  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  onNotice(l: (n: Notice) => void) {
    this.noticeListeners.add(l);
    return () => this.noticeListeners.delete(l);
  }
  set(next: Partial<ConnectionState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }
  notify(n: Notice) {
    this.noticeListeners.forEach((l) => l(n));
  }
  private settle<T>(method: string, args: unknown[], result: T | Error | null | undefined): Promise<T> {
    this.calls.push({ method, args });
    if (result instanceof Error) return Promise.reject(result);
    if (result === null || result === undefined) return Promise.reject(new Error(`no result scripted for ${method}`));
    return Promise.resolve(result);
  }
  async createRoom(input: CreateRoomInput) {
    const data = await this.settle("createRoom", [input], this.createResult);
    this.set({ seat: { roomId: data.room.roomId, roomCode: data.room.code, playerId: data.player.playerId }, room: data.room });
    return data;
  }
  previewRoom(code: string) {
    return this.settle("previewRoom", [code], this.previewResult);
  }
  async joinRoom(input: JoinRoomInput) {
    const data = await this.settle("joinRoom", [input], this.joinResult);
    this.set({ seat: { roomId: data.room.roomId, roomCode: data.room.code, playerId: data.player.playerId }, room: data.room });
    return data;
  }
  async resume(credential: PlayerSessionCredential, options: { takeover?: boolean } = {}) {
    const data = await this.settle("resume", [credential, options], this.resumeResults.shift());
    this.set({ seat: { roomId: data.room.roomId, roomCode: data.room.code, playerId: data.player.playerId }, room: data.room, game: data.game, ended: null });
    return data;
  }
  async startGame() {
    const data = await this.settle("startGame", [], this.startResult);
    this.set({ room: data.room, game: data.game });
    return data;
  }
  private async gameAction(method: string, args: unknown[], result: ActionData | Error | undefined) {
    this.calls.push({ method, args });
    if (this.hold) await new Promise<void>((release) => (this.hold = { release }));
    if (result instanceof Error) throw result;
    if (!result) throw new Error(`no result scripted for ${method}`);
    this.set({ game: result.game });
    return result;
  }
  rollDice() {
    return this.gameAction("rollDice", [], this.rollResults.shift());
  }
  moveToken(tokenId: number) {
    return this.gameAction("moveToken", [tokenId], this.moveResults.shift());
  }
  async resumeGame() {
    this.calls.push({ method: "resumeGame", args: [] });
  }
  historyResult: GameActionView[] | Error = [];
  async fullHistory() {
    this.calls.push({ method: "fullHistory", args: [] });
    if (this.historyResult instanceof Error) throw this.historyResult;
    return this.historyResult;
  }
  async leaveRoom() {
    this.calls.push({ method: "leaveRoom", args: [] });
    this.set({ seat: null, room: null });
  }
}

export function services(client = new FakeClient()): GameServices & { client: FakeClient; local: MemoryStorage; session: MemoryStorage } {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  return { client, seats: new SeatStore(local), tab: new TabSeat(session), local, session };
}

export function membership(room: RoomView, playerId: string, secret = "s3cret-value"): MembershipData {
  return { room, player: room.players.find((p) => p.playerId === playerId)!, credential: { playerId, secret }, controlEpoch: 1 };
}

/** A started classic game for two players (host seat 0, guest seat 2), all tokens in base. */
export function gameView(over: Partial<GameStateView> = {}): GameStateView {
  return {
    stateVersion: 0,
    phase: "playing",
    settings: { autoMove: true, rankingMode: "winner-only" },
    players: [
      { id: "p-host", seat: 0, tokens: [0, 1, 2, 3].map((id) => ({ id, step: null })), finished: false },
      { id: "p-ben", seat: 2, tokens: [0, 1, 2, 3].map((id) => ({ id, step: null })), finished: false },
    ],
    currentPlayerIndex: 0,
    currentPlayerId: "p-host",
    turn: { phase: "awaiting-roll", dice: null, consecutiveSixes: 0, legalMoves: [] },
    lastRoll: null,
    lastAutoMove: null,
    ranking: [],
    winnerId: null,
    recentHistory: [],
    historyLength: 1,
    ...over,
  };
}

/** The acknowledgement data for a committed roll or move. */
export function actionData(game: GameStateView, type: "game:roll" | "game:move" = "game:roll"): ActionData {
  return {
    action: { seq: game.historyLength, type, playerId: game.currentPlayerId, stateVersion: game.stateVersion, at: "2026-01-01T00:00:00.000Z", dice: game.lastRoll?.value ?? null, tokenId: null, entries: [] },
    replayed: false,
    game,
  };
}
