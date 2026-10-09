// Runs work for the same room one at a time, in arrival order, within this
// process. Each action's commit and its broadcast happen inside one slot, so
// room members receive committed actions in commit order. Correctness across
// processes does not depend on this: PostgreSQL's conditional commit lets at
// most one action per state version succeed, and clients that see a version
// gap fetch a fresh snapshot.

export class ActionCoordinator {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** Rooms with work queued or running (for tests and diagnostics). */
  get activeKeys(): number {
    return this.tails.size;
  }
}
