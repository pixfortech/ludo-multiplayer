# Test plan

Every phase must pass `npm run test`, `npm run typecheck` and `npm run build` before it is committed.

| # | Suite | Package | Phase |
| --- | --- | --- | --- |
| 1 | Dice (range, injected source, no client dice) | game-engine | 1 |
| 2 | Opening only on 6 | game-engine | 1 |
| 3 | Movement | game-engine | 1 |
| 4 | Exact roll to finish | game-engine | 1 |
| 5 | Finished tokens immovable | game-engine | 1 |
| 6 | Capture | game-engine | 1 |
| 7 | Safe cells | game-engine | 1 |
| 8 | No capture in home lanes | game-engine | 1 |
| 9 | Six bonus | game-engine | 1 |
| 10 | Three-sixes forfeit | game-engine | 1 |
| 11 | Capture bonus | game-engine | 1 |
| 12 | Home bonus | game-engine | 1 |
| 13 | Auto-move | game-engine | 1 |
| 14 | No legal move, auto-pass | game-engine | 1 |
| 15 | Win condition and ranking | game-engine | 1 |
| 16 | Room create and join | server | 2 |
| 17 | Colour availability | server | 2 |
| 18 | Reconnect and resume | server | 2 / 8 |
| 19 | Session persistence | server | 2 / 8 |
| 20 | Board geometry for 2–15 players | board-layouts | 3 / 5 |
| 21 | Asset manifest: schema, missing files, unregistered files, recorded sizes, fallback resolution | assets | 0 ✅ |

Later: Playwright multi-browser room tests, plus visual checks at 1920×1080, 1366×768, 1024×768, 390×844 and 360×800. A viewport is reported as verified only when a screenshot was actually taken.

## Phase 0 baseline

| Workspace | Tests |
| --- | --- |
| shared-types | 4 |
| assets | 22 (schema, resolver, repo manifest) |
| game-engine | 1 (wiring) |
| board-layouts | 1 (wiring) |
| server | 5 (health, socket hello, config) |
| client | 1 (shell render) |
