# Browser end-to-end tests (Phases 3C.1–3C.3)

Real Chromium players play complete games through the real UI. They connect to the production client build (`vite preview`), the real Socket.IO server and an isolated PostgreSQL.

```bash
npm run build
npm run test:e2e   # Playwright, about 7 minutes
```

CI runs the suite on Ubuntu and Windows after the other checks. If it fails, traces and screenshots are uploaded as an artifact.

## How it works

| Part | Role |
| ---- | ---- |
| `playwright.config.ts` | One worker (one shared server), and the client build served by `vite preview` on 127.0.0.1:4173 |
| `e2e/support/globalSetup.ts` | Starts the test server for the run. Stops it with a graceful shutdown over the control port, so it behaves the same on Windows. |
| `e2e/support/testServer.ts` | **Test only.** The production `startServer`, room and gameplay services on a disposable PostgreSQL (the server tests' `pgHarness`). It relaxes the per-client room-creation and code-lookup limits, because every browser connects from 127.0.0.1. See below. |
| `e2e/support/game.ts` | Players on different devices; create, join and start through the UI; rolling and moving like a person; the in-sync checks; the game driver |
| `e2e/tests/*.spec.ts` | The scenarios |

### What the test server changes

The test server differs from production in one place: the gameplay service's dice source. That is the documented test seam (`GameplayServiceOptions.dice`):

- Values the tests queue are drawn first, then secure random dice.
- The queue is reachable only through a control port bound to 127.0.0.1, which needs a per-run token.
- Browsers and Socket.IO clients cannot choose a die.
- None of this is in `apps/server/src` or the server build.

### Every action goes through the UI

Every roll is a click on Roll (or a tap on the die on touch devices). Every move is chosen in the move tray, or by clicking a token on the board. On touch devices that means tap to preview, then tap again.

After every action, three things must hold:

1. **Same board:** every player's page draws exactly the server's committed token positions.
2. **Right controls:** only the current player can roll or move.
3. **No duplicates:**
   - one committed roll per Roll click, and one committed move per chosen move (from the server's action log);
   - one `game:roll` / `game:move` WebSocket frame per action;
   - versions advance by exactly one per action.

### The game driver

The driver reads the authoritative state and queues dice so a game ends deterministically. One player at a time advances a single token: a six for the bonus roll, never a third six, and an exact roll to finish. Everyone else rolls a 1 and is auto-passed.

## Scenarios

| # | Requirement | Where |
| - | ----------- | ----- |
| 1 | Two-player game, room creation to victory | `full-games` › two players (desktop + phone) |
| 2 | Three-player game to completion | `full-games` › three players, full ranking: every place decided, second place played on a phone |
| 3 | Four-player game to completion | `full-games` › four players (desktop, phone, tablet, wide desktop); turns pass clockwise through seats 0→1→2→3 |
| 4 | Clockwise movement | `rules`: at each stop the drawn cell equals `@ludo/board-layouts` for that step, and the angle around the centre only increases (most of a lap) |
| 5 | Safe-cell protection | `rules`: landing on the opponent's start does not capture; both tokens share the cell |
| 6 | Capture and bonus turn | `rules`: the captured token returns to base on both screens; capture bonus roll; "Capture: roll again" |
| 7 | Six and three sixes | `rules`: a six gives a bonus roll; a third six forfeits the turn with no move, with banners on both screens |
| 8 | Home lane and exact finish | `rules`: step 51 is the first lane cell; a six that would overshoot is not offered; an exact five finishes, with a home bonus |
| 9 | Finished tokens are immovable | `rules`: the finished token is drawn as finished, not offered in the tray, and is not a button; the game driver checks this on every choice |
| 10 | Auto-move when exactly one move is legal | `rules` and every full game: no tray, the server moves the token, "(auto)" in the log |
| 11 | Winning and ranking screens | every full game: "You win!" / "{name} wins!", ranking rows in the server's order with places, no game actions left, and the route home |
| 12 | Refresh and reconnect during a game | `resilience`: refresh on your own turn; refresh during a roll animation; network loss while the other player moves, then reconnect |
| 13 | No duplicated movements or rolls | every test: action log and WebSocket frames match clicks. `rules`: synchronous double clicks on Roll and on a move. `resilience`: no hop-by-hop replay after reconnect (the token jumps straight to the server's step). |

## Animation (Phase 3C.2)

`e2e/tests/animation.spec.ts` records what each player's page showed. A `MutationObserver` with timestamps (`e2e/support/timeline.ts`) watches the die and every token, and the running Web Animations are inspected directly. Aman's WebSocket goes through a test proxy, which can hold the server's replies or make one move request stale.

| Check | How |
| ----- | --- |
| The tumble starts on the click | The die shows "rolling" within 300 ms, and its spin animation is running |
| The result matches the server | The die's attribute, the server's `lastRoll`, and the face nearest the viewer (hit-tested) all agree. The die shows "rolling" and then the value, never another number. |
| Consistent styling | Same size while rolling and at rest; always six faces |
| A six | `data-six`, the gold glow animation plays, and the bonus is explained on both screens |
| No movement before the server confirms | With the server's reply held for 700 ms, the chosen token stays in base, marked as selected |
| A refused move never animates | A stale move request is refused by the real server, and the token's position never changes |
| Auto-move waits for the reveal | On both screens, the first hop comes more than 300 ms after the die shows the value |
| Cell by cell | Steps 1, 2, 3, 4, drawn on the layout's cell |
| Capture | The attacker hops 28 → 29 → 30. The captured token goes straight to base, and only after the attacker landed. |
| Home lane | 47 → 52 is drawn as 48, 49, 50, 51, 52, ending in the seat's own lane cell. An exact roll finishes in the finish wedge, inactive. |
| No replay | A page reloaded mid-move shows the result with no running animations and no recorded steps |
| A takeover tab | Starts from the server's board with no running animations; the old tab shows "open elsewhere" |
| Reduced motion | No tumble at any time, a single straight slide, and still after the reveal |

## Captures, home and victory (Phase 3C.3)

`e2e/tests/effects.spec.ts` covers these, together with the full-game checks.

| # | Requirement | How |
| - | ----------- | --- |
| 1, 2 | The capture plays only after the attacker lands, and the token returns to base | A double capture, checked on both screens: each captured token goes straight to base, later than the attacker's landing |
| 3 | Capture bonus feedback | "Double capture: roll again" for the capturer and "Double capture: Aman rolls again" for the other player. The banner kind is `capture`, and Roll is offered again. |
| 4 | Several tokens captured together | Both tokens leave within 200 ms of each other, and each token is drawn exactly once |
| 5 | Home entry follows the approved route | Steps 52, 53, 54, 55, 56, cell by cell up the seat's own lane, with the gold accent |
| 6 | The home counter changes at the right moment | On both screens, it changes more than 450 ms after the token reaches the finish, once the glide is done |
| 7 | Completed tokens can't be selected | Drawn as finished and not a button. Every move choice also checks that no finished token is offered. |
| 8 | The fourth token home triggers victory | The last entries are home, player-finished, win and game-over, with no bonus. The win banner shows, then the victory screen. |
| 9, 10 | The first-winner and full-ranking screens | All three full games check the dialog: winner, "Game complete", standings in the server's order (unranked "–" last), the summary, and actions in the viewport |
| 11 | The victory actions work | Escape and View board return to the board, and focus goes to Show results, which reopens the dialog. New game opens Create; Return home opens Home. |
| 12 | A refresh doesn't replay celebrations | After a refresh: no confetti, no running animations, and nothing recorded on the timeline, for both the capture and the victory |
| 13 | Reconnect snaps to the server | `resilience.spec`: after a network loss the page jumps straight to the server's step |
| 14 | Reduced motion avoids elaborate effects | A capture is one straight move home with no effect animation, and the banner still explains it. A reduced-motion victory has no confetti. |
| 15 | Phone effects don't cover the board or controls | On the phone during a capture, the board's centre and corners are not covered and the die is fully in view. On the victory screen, every action is fully in the viewport. |

## Bugs found and fixed

1. **A double click sent two requests.** Two clicks in the same moment, before React re-rendered, sent two `game:roll` (or `game:move`) requests. The server's state-version check refused the second as stale, so the game state was never wrong. But the client sent a duplicate request and could briefly show a refusal.
   - **Fix:** a synchronous in-flight guard in `GameScreen`.
   - **Tests:** a game-screen test for each case, both failing on the old code, plus the browser frame count.
2. **After a real network drop, the seat was not re-attached.** The server notices a silently dropped connection only when the Socket.IO heartbeat times out, which takes up to about 45 s. Until then, the page's automatic re-attach was refused with `session-in-use`. The page then wrongly said the seat was open elsewhere and showed no board. The Phase 3A live test had closed the socket cleanly, which the server notices at once.
   - **Fix:** create, join and resume return a `controlEpoch`, which the page keeps in memory and sends when it re-attaches. If the seat's epoch is unchanged, nobody else has claimed the seat, so the page's own stale connection is replaced. A takeover by another tab moves the epoch on, so that tab is never displaced silently. See [sessions](../architecture/sessions.md).
   - **Tests:** a new `sessions.pg` test, and the browser network-loss test, which failed before the fix.
3. **The tray said "1 squares".** Fixed to "1 square".
4. **Phase 3C.2, caught before commit: on the roller's own screen, the token moved before the die landed.** The die's continuous tumble (kept going from the click until the board starts playing the roll) did not stop until the whole action had played. On the roller's page, the auto-move therefore hopped about 680 ms before the die showed the value; the other player's screen was correct. The tumble now ends as soon as the board starts playing that version.
   - **Test:** `animation.spec` checks the ordering on both screens.
5. **Phase 3C.3, caught before commit: "You win!" appeared before the final move had played.** The title followed the server's state instead of the board. It now follows the board.
6. **Phase 3C.3, caught before commit: layout shift when a banner appeared.**
   - **Cause:** the turn indicator grew, so the phone's thumb bar pushed the turn title and die up (0.109 at the finish).
   - **Fix:** the banner now has reserved space, and the end-of-game row keeps its height.
   - **Measured after the fix:** 0.009–0.018 during captures, about 0.03 across the finish.
7. **Phase 3C.3, caught before commit: focus did not return to "Show results" after closing the victory screen.** The button exists twice (rail and phone bar), and the ref pointed at the hidden copy. Focus now goes to the visible one.
8. **Phase 3C.3, found by CI on Ubuntu: under reduced motion, effect marks were still drawn.** Their animations were cut to 1 ms, but the test could catch them still running. Under reduced motion, capture and home effects are now not drawn at all; the banner still explains what happened.
9. **Phase 3C.3, found by CI on Ubuntu: the suite tripped the production room-creation limit.** The limit is 10 rooms per 10 minutes per client. The suite now creates 12 rooms from 127.0.0.1, so whether the 11th was refused depended on timing. This is a test-harness issue, not a product bug: the test server now relaxes the per-client limits (as the server's integration harness does), and the limits keep their own server tests.
10. **Phase 3C.3, found locally, in the tests and present since 3C.1: a race in the in-sync check.** The check read the server's state once. When it ran right after a click whose move was still committing, it compared the pages with a stale state and timed out. It now re-reads the server's state on every poll.

## Not covered here

- Browsers other than Chromium.
- Real mobile devices: phones and tablets are emulated, with touch, by viewport.
- Pause after the reconnect grace period: this is covered by the server's session tests.
