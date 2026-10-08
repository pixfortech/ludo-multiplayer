// @ludo/game-engine — the single source of truth for Ludo rules.
//
// Pure TypeScript: no I/O, no timers, no randomness except through an injected
// dice source. The server runs it authoritatively; clients never import it to
// decide outcomes. Rules arrive in Phase 1 (see docs/rules/classic-ludo.md).

import { MAX_PLAYERS, MIN_PLAYERS } from "@ludo/shared-types";

export const ENGINE_INFO = {
  name: "@ludo/game-engine",
  supportedPlayers: { min: MIN_PLAYERS, max: MAX_PLAYERS },
} as const;
