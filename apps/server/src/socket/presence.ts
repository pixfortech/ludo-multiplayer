// Which connections currently act for which player, in this process. Several
// connections may belong to one player (e.g. a phone that reconnected); the
// player is "connected" while at least one is open. This is presence only:
// seats, turns and tokens live in PostgreSQL and are never touched here.
// A multi-instance deployment needs shared presence (Batch 2E).

export class ConnectionRegistry {
  private readonly byPlayer = new Map<string, Set<string>>();

  /** Returns true if this is the player's first open connection. */
  add(playerId: string, socketId: string): boolean {
    const set = this.byPlayer.get(playerId) ?? new Set<string>();
    const first = set.size === 0;
    set.add(socketId);
    this.byPlayer.set(playerId, set);
    return first;
  }

  /** Returns true if that was the player's last open connection. */
  remove(playerId: string, socketId: string): boolean {
    const set = this.byPlayer.get(playerId);
    if (!set || !set.delete(socketId)) return false;
    if (set.size > 0) return false;
    this.byPlayer.delete(playerId);
    return true;
  }

  connectionsOf(playerId: string): string[] {
    return [...(this.byPlayer.get(playerId) ?? [])];
  }
}
