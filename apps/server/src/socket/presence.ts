// Which connection controls which seat, in this process. Exactly one
// connection controls a seat at a time; a second one must take over
// explicitly (room:resume with takeover), and the database session epoch
// makes the hand-over binding in every process. This is presence only:
// seats, turns and tokens live in PostgreSQL and are never touched here.
// A multi-instance deployment needs shared presence (Batch 2E).

export class ConnectionRegistry {
  private readonly controller = new Map<string, string>();

  controllerOf(playerId: string): string | null {
    return this.controller.get(playerId) ?? null;
  }

  isControlled(playerId: string): boolean {
    return this.controller.has(playerId);
  }

  set(playerId: string, socketId: string): void {
    this.controller.set(playerId, socketId);
  }

  /** Returns true if `socketId` was the player's controlling connection (and now is not). */
  release(playerId: string, socketId: string): boolean {
    if (this.controller.get(playerId) !== socketId) return false;
    this.controller.delete(playerId);
    return true;
  }
}
