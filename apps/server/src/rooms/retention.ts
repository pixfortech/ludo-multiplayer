// Saved-room retention. Rooms are never deleted by the server; inactive ones
// move along the lifecycle instead:
//   lobby, inactive for `lobbyDays`            → abandoned ("expired")
//   playing or paused, inactive `activeDays`    → abandoned ("expired")
//   finished or abandoned, inactive `endedDays` → archived (credentials stop working)
// Expiring counts as activity, so an expired room is archived `endedDays` later.
// "Inactive" means no room or game change (last_activity_at). Rooms whose row
// is locked by an operation in flight are skipped and re-checked next sweep,
// and a game commit cannot land in a room that has just expired (commits
// require "playing" under the room lock).

import type { GameStore, RetentionCutoffs } from "../persistence/types.js";

export interface RetentionPolicy {
  lobbyDays: number;
  activeDays: number;
  endedDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { lobbyDays: 30, activeDays: 90, endedDays: 30 };

const DAY_MS = 86_400_000;

export function cutoffsFor(policy: RetentionPolicy, now: Date): RetentionCutoffs {
  return {
    now,
    lobbyBefore: new Date(now.getTime() - policy.lobbyDays * DAY_MS),
    activeBefore: new Date(now.getTime() - policy.activeDays * DAY_MS),
    endedBefore: new Date(now.getTime() - policy.endedDays * DAY_MS),
  };
}

export interface RetentionSweeperOptions {
  intervalMs: number;
  batchSize?: number;
  log?: (line: string) => void;
  now?: () => Date;
}

export class RetentionSweeper {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: GameStore,
    private readonly policy: RetentionPolicy,
    private readonly options: RetentionSweeperOptions,
  ) {}

  /** One pass; returns the rooms that expired or were archived. */
  async sweepOnce(): Promise<{ expired: string[]; archived: string[] }> {
    const result = await this.store.expireInactiveRooms(cutoffsFor(this.policy, (this.options.now ?? (() => new Date()))()), this.options.batchSize ?? 500);
    if (result.expired.length + result.archived.length > 0) {
      this.options.log?.(`[retention] expired ${result.expired.length} room(s), archived ${result.archived.length}`);
    }
    return result;
  }

  start(): void {
    if (this.timer || this.options.intervalMs <= 0) return;
    this.timer = setInterval(() => {
      this.sweepOnce().catch((error: unknown) => this.options.log?.(`[retention] sweep failed: ${(error as Error).message}`));
    }, this.options.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
