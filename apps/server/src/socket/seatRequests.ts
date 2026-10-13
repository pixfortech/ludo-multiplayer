// Open requests to take over an offline player's seat (see RoomService, "Seat takeover"). Held in this process
// only: a request lives as long as the asking connection and at most `ttlMs`; nothing about it is stored.
// The players in the game see each request (seat:requested) and when it closes (seat:requestClosed); the asking
// connection hears the outcome (seat:granted from the handler, or seat:declined from here).

import { randomUUID } from "node:crypto";
import type { GraceScheduler } from "./sessions.js";
import { roomChannel, type LudoServer, type LudoSocket } from "./socketEvents.js";

export interface PendingSeatRequest {
  id: string;
  roomId: string;
  /** The offline player whose seat is asked for. */
  playerId: string;
  displayName: string;
  /** The asking connection. */
  socketId: string;
  expiresAt: number;
  timer: { cancel(): void };
}

export const SEAT_REQUEST_TTL_MS = 120_000;
/** Open requests one room may have at once (beyond that, new ones are refused as rate-limited). */
export const MAX_OPEN_PER_ROOM = 8;

type Outcome = "declined" | "expired" | "withdrawn" | "unavailable";

export class SeatRequests {
  private readonly open = new Map<string, PendingSeatRequest>();

  constructor(
    private readonly io: LudoServer,
    private readonly scheduler: GraceScheduler,
    private readonly ttlMs = SEAT_REQUEST_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Opens a request (one per asking connection: an earlier one is withdrawn). Returns null if the room has too many. */
  add(input: { roomId: string; playerId: string; displayName: string; socketId: string }): PendingSeatRequest | null {
    this.withdrawFrom(input.socketId);
    if ([...this.open.values()].filter((r) => r.roomId === input.roomId).length >= MAX_OPEN_PER_ROOM) return null;
    const id = randomUUID();
    const expiresAt = this.now() + this.ttlMs;
    const timer = this.scheduler.schedule(() => this.close(id, "expired"), this.ttlMs);
    const request: PendingSeatRequest = { ...input, id, expiresAt, timer };
    this.open.set(id, request);
    this.io.to(roomChannel(input.roomId)).emit("seat:requested", { roomId: input.roomId, seatRequestId: id, playerId: input.playerId, displayName: input.displayName, expiresAt });
    return request;
  }

  get(id: string): PendingSeatRequest | null {
    return this.open.get(id) ?? null;
  }

  /** The asking connection, if it is still connected. */
  socketOf(request: PendingSeatRequest): LudoSocket | null {
    return this.io.sockets.sockets.get(request.socketId) ?? null;
  }

  /**
   * Takes a request off the list before approving it, so two approvals can never both run. The caller then
   * reports the outcome with granted() or close().
   */
  take(id: string): PendingSeatRequest | null {
    const request = this.open.get(id);
    if (!request) return null;
    this.open.delete(id);
    request.timer.cancel();
    return request;
  }

  /** The seat was given: the players hear it, and other requests for the same seat are declined. */
  granted(request: PendingSeatRequest): void {
    this.io.to(roomChannel(request.roomId)).emit("seat:requestClosed", { roomId: request.roomId, seatRequestId: request.id, outcome: "approved" });
    for (const other of [...this.open.values()]) if (other.roomId === request.roomId && other.playerId === request.playerId) this.close(other.id, "unavailable");
  }

  /** Closes a request without a seat: the asking connection and the players are told. */
  close(id: string, outcome: Outcome, request: PendingSeatRequest | null = this.take(id)): void {
    if (!request) return;
    const reason = outcome === "declined" ? "declined" : outcome === "expired" ? "expired" : "unavailable";
    if (outcome !== "withdrawn") this.io.to(request.socketId).emit("seat:declined", { seatRequestId: request.id, reason });
    this.io.to(roomChannel(request.roomId)).emit("seat:requestClosed", { roomId: request.roomId, seatRequestId: request.id, outcome: outcome === "unavailable" ? "declined" : outcome });
  }

  /** The asking connection went away (or asked again): its request is withdrawn. */
  withdrawFrom(socketId: string): void {
    for (const r of [...this.open.values()]) if (r.socketId === socketId) this.close(r.id, "withdrawn");
  }

  /** Requests still open (tests and tooling). */
  size(): number {
    return this.open.size;
  }

  dispose(): void {
    for (const r of this.open.values()) r.timer.cancel();
    this.open.clear();
  }
}
