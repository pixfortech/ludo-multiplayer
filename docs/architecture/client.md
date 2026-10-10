# Web client (Phases 3A–3B)

The browser client in `apps/client` is React 19, Vite and TypeScript, styled with Tailwind 4. Phase 3A built the app shell, the home page, the create and join workflows, the live multiplayer lobby and session handling. Phase 3B added the playable 2D game: the classic board, dice, moves and the game screen.

The client holds **no game rules**. Everything it shows comes from the server: rooms, seats, colours, presence and game state. It sends requests and renders the answers.

## Structure

| Path | Role |
| ---- | ---- |
| `src/lib/connection.ts` | `GameConnection`: the only path to the server. A typed wrapper around one Socket.IO connection, using the shared protocol types from `@ludo/shared-types` (no duplicated contracts). It holds no DOM or React code. |
| `src/lib/session.ts` | `SeatStore` (`localStorage`) and `TabSeat` (`sessionStorage`); see [Sessions](#sessions) |
| `src/state/gameClient.tsx` | The `GameClient` interface, the React context and `useConnectionState` (`useSyncExternalStore`) |
| `src/lib/router.tsx` | A small History-API router: `/`, `/create`, `/join/:code?`, `/room/:code`, `/resume` |
| `src/pages/` | Home, Create, Join, Lobby, Resume, Not found |
| `src/components/ui/` | Buttons, fields, segmented controls, switch, badges, cards, toasts, connection pill, icons |
| `src/components/game/` | Player tokens, the colour picker, the room code card |
| `src/components/board/` | The 2D classic board (3B): `geometry.ts` (layout cells → SVG points), `placement.ts` (token positions and stacking), `BoardSurface` with `PlayerBase`, `BoardCell`, `SafeCell`, `HomeLane`, `FinishArea`; `BoardToken` (token states); `TokenOverlay` (move preview, destination, capture/home marks); `ClassicBoard` (the interactive board) |
| `src/components/game/` (game screen) | `GameScreen`, `DicePanel` and `Die`, `TurnIndicator`, `PlayerPanel` / `PlayerStrip`, `MoveTray`, `GameActionFeed`, and `useBoardPlayback` (the motion timeline) |
| `src/components/brand/` | The wordmark, the hero board, board and renderer previews. They use the same board surface and tokens as the game; the geometry is not changed. |
| `src/components/layout/` | The app shell (header, mobile menu, footer) and the mobile action bar |
| `src/index.css` | Tailwind theme mapped from `@ludo/design-tokens`; `styles.test.ts` keeps the two in step |

## GameConnection

### Requests

Every request gets a fresh `requestId` and a timeout (10 s by default). An acknowledgement either resolves with its data or throws a `ProtocolRequestError` with the server's error code. `src/lib/errors.ts` turns every code into plain words.

### State

`GameConnection` keeps `{ link, seat, room, game, ended }` exactly as the server reports it:

- A room or game update with an older version than the one held is ignored.
- Presence events update a player's connection status.
- `session:ended` detaches the seat and forgets the in-memory credential.

### Notices

Lobby-worthy changes are derived from authoritative updates and become toasts: a player joined, left, connected or disconnected; the host changed; the game started or paused; the room closed; the session ended; the seat was restored.

### Reconnects

After a transport reconnect (a new server-side socket), the connection re-attaches its seat with `room:resume`, using the credential it holds in memory. If the seat is now controlled elsewhere, it does **not** take over. It also sends the `controlEpoch` it was given (memory only), so a stale connection the server has not yet noticed is replaced. If another tab took over meanwhile, the epoch has moved on and nothing is displaced ([sessions](sessions.md)).

## The 2D board (Phase 3B)

### Geometry has one source

Every position comes from `@ludo/board-layouts`:

- `classicSeatPath(seat)` gives steps 0–50 on the track, 51–55 in the lane and 56 at the finish;
- `classicBaseSlots` gives the four base slots;
- the track, start, safe and lane tables give the cells.

`components/board/geometry.ts` only converts grid cells to SVG coordinates. There is no second movement map, and the frozen geometry is unchanged.

### Stacking

Placement follows `docs/design/token-design.md`:

| Tokens on a cell | Layout |
| ---------------- | ------ |
| 1 | 0.82 × cell |
| 2 | offset ±18% diagonally, at 0.72 |
| 3–4 | a 2 × 2 cluster at 0.6 |
| more | a 3 × 3 grid with a count badge |

Mixed colours are ordered by seat. Finished tokens sit in the seat's finish wedge.

### Token states

Token states are the approved ones:

- **movable:** a ring that breathes (static under reduced motion), with a numbered badge matching the move tray;
- **selected:** an ink ring, lifted;
- **unmovable:** 60% opacity;
- **finished:** 72% size with a gold check.

The current player's base glows.

### Renderer independence

`ClassicBoard` renders whatever positions it is given and reports which token was picked. A Canvas or 3D renderer can take the same inputs: placements, states and preview.

### The 2.5D board (Batch C.1)

`GameScreen` renders the board through `BoardView`: the 2.5D board by default (a lazily loaded three.js / React Three Fiber renderer), the 3D preview or the 2D `ClassicBoard` on request, and the 2D board while the 3D chunk loads or whenever 3D fails. All three take the same props from the playback. See [board-3d.md](board-3d.md).

### City themes (Batch B)

In a city room, `GameScreen` passes the city's `boardMaterial2d` to `ClassicBoard` (neutral surfaces only: body, track cells, outlines, safe stars), wraps the board in a `CityPlinth`, and mounts a `CityBackdrop` behind the page: a fixed, non-interactive, `aria-hidden` layer whose artwork is a lazily loaded chunk per city. Geometry, seat colours, tokens, dice and every control are the same as on the classic table. See [city themes](city-themes.md#batch-b-2d-city-environments) and, for the 3D view, [3d-readiness.md](3d-readiness.md).

## Gameplay (Phase 3B)

### Requests

`GameConnection.rollDice()` and `moveToken(tokenId)` send `game:roll` and `game:move` with a request id and the `expectedStateVersion` the board is showing. The server's acknowledgement carries the committed state, which is applied as authoritative.

### Legal moves

The movable tokens, their badges, the tray entries and the move previews come only from `turn.legalMoves`. The client never decides legality and never moves a token before the server confirms. A selected token stays put, marked "selected", until the new state arrives.

### Choosing a move

- **Mouse:** hovering a token or tray entry previews its exact path and destination; one click moves.
- **Touch:** the first tap previews and the second moves.
- **Keyboard:** R rolls, Tab reaches the movable tokens, Enter moves, Escape clears a preview.

### Wrong player, pause and finish

- When it is not your turn, the controls are visibly disabled and the board has no buttons.
- A paused game shows why. A host pause offers the host "Resume game".
- A finished game shows the ranking and offers no actions.

### Reconciliation

| Situation | What the client does |
| --------- | -------------------- |
| A `game:event` whose version skips ahead | Fetches the authoritative state once (`room:getState`) |
| An announced action whose snapshot doesn't arrive within 2 s | Fetches the authoritative state |
| A `stale-state`, `timeout` or turn refusal | Fetches the authoritative state |
| An older or duplicate snapshot | Ignored |

Reconnect and refresh restore the exact board from the resume snapshot.

## Motion (Phases 3B–3C.3)

`useBoardPlayback` follows `docs/design/motion.md`.

### When an action animates

Only a single consecutive version (n → n+1) is animated, by playing its history entries in order:

1. **Roll:** the die tumbles for 650 ms, then the server's value is revealed for 260 ms.
2. **Auto-move:** a 350 ms pause before the token moves.
3. **Move:** the token hops cell by cell, 170 ms per hop, along the layout path. Opening takes 320 ms, and the hops speed up on long moves.
4. **Capture:** the attacker lands, then the captured token returns to its base over 520 ms.
5. **Home entry:** a 600 ms glide, with a mark at the finish.

### When it snaps

Everything else snaps straight to the server state: the first load, a refresh, a reconnect or a version jump. Nothing is replayed after a reconnect. A newer state fast-forwards any animation that is still running, and so does a pause. A replacement tab (takeover) starts from the server's state with no queue of its own.

### The die (Phase 3C.2)

`components/game/Die.tsx` is one ivory-resin die, built as a small CSS-3D cube. It has six identical faces (rounded, bevelled, recessed ink pips, gold rings on the six) around a solid core, so it can tumble without a 3D engine.

- **The tumble:** a fixed spin, the same for every roll and added on top of the resting face. It starts on the click and continues until the board starts playing that roll.
- **The landing:** when the server's value is revealed, the die settles from its current orientation onto that face (about 420 ms, overshoot ≤ 6%). It never shows another value first, and it never predicts one. Click to rest is about 850 ms.
- **A six:** the same die, plus one soft gold glow and a small pop. The turn banner says "Six! Move a token, then roll again".
- **Waiting:** the die is drawn at 70% only on other players' turns.
- **Under the hood:** the tumble and the landing are Web Animations on transforms. React does not write the cube's transform, so a reveal never moves it before the landing starts.

### Token travel (Phase 3C.2)

`useBoardPlayback` gives each token change a typed motion: `hop`, `land`, `open`, `home`, `capture` or `slide`. `BoardToken` turns it into Web Animations on transforms only, using the keyframes in `components/board/tokenMotion.ts`.

| Motion | What the player sees |
| ------ | -------------------- |
| Hop | A straight glide to the next cell of the seat's own path, with the body lifting about a quarter cell. The contact shadow stays on the board and shrinks while the body is up. |
| Land | The last hop of a move, ending with a short settle |
| Open | An arc from the base slot onto the start cell |
| Home | A 600 ms glide into the finish wedge. The token then eases to its finished size and is shown as inactive. |
| Capture | After the attacker lands, the captured token shrinks, fades and arcs back to its base slot |
| Slide | Reduced motion: straight to the destination in 180 ms, with no lift |

A change without a motion is a jump. Any animation still running is cancelled first, so motions never overlap.

### Captures (Phase 3C.3)

Every token captured by one move plays as one group, right after the attacker has settled on the cell:

1. Each captured token reacts where it stood: a 140 ms jolt and settle.
2. It then shrinks, fades and arcs back to its base slot (520 ms). Tokens captured together start 60 ms apart.
3. The capturing player's panel gets a brief sweep of their colour.

A safe cell never shows a capture, because the client only plays the server's `capture` entries. Placement draws every token exactly once.

### Home (Phase 3C.3)

1. A token runs up its own lane cell by cell and glides into the finish wedge.
2. When it arrives, a short gold accent plays: a soft glow, an expanding ring and eight sparks, about 700 ms.
3. The player's panel gets a gold sweep, and the n/4 counter pops.

The counter is driven by the playback, so it advances on arrival, never ahead of the board. Finished tokens are drawn inactive and are never offered as moves.

### The turn banner (Phase 3C.3)

`turnEventFor` picks the single most important outcome of the action just shown. Each kind has its own icon, colour and words:

| Kind | Look | Example |
| ---- | ---- | ------- |
| Win | Gold | "You win!" |
| Finished | Gold | "Ben finished 2nd" |
| Three sixes | Soft red | "Three sixes: turn forfeited" |
| Capture | The capturer's colour | "Double capture: roll again" |
| Home | Gold | "Home: roll again" |
| Six | Gold | "Six: roll again" |
| No move | Neutral | "No moves: passing turn" |
| Auto-move | Neutral | "Auto-moved: only one legal move" |

- **Meaning never relies on colour alone:** every kind has an icon and words.
- **Detail line:** at most one quieter line ("You captured Ben's 2 tokens").
- **Screen readers:** one live region announces a full sentence.
- **No layout shift:**
  - on phones, the banner is a single line that replaces the detail line;
  - the desktop panel keeps a fixed slot for it;
  - at the end of the game, the phone's die button becomes a Results button of the same size.
- **Fourth token:** a fourth token home is a win, never another bonus. In full-ranking games, the first finisher's banner says play continues.

### Victory (Phase 3C.3)

The finish follows the board, not the server's arrival:

1. The last token glides home and the gold accent plays.
2. The counter reaches 4/4.
3. About 700 ms later, `VictoryScreen` opens.

What the screen shows:

- **Trophy:** a gold cup with the winner's colour as a ribbon and their symbol on a medallion.
- **Winner:** the winner's name and token, and "Game complete".
- **Standings:** the server's ranking. In first-winner games, players without a place are listed last with "–".
- **Summary:** taken only from the complete action log (`game:getHistory`, paged) and the final state: duration, turns, captures, tokens home. If the log can't be loaded, the summary is left out.

Actions and accessibility:

- **Actions:** New game, Return home, and View board (Escape does the same). Show results reopens the dialog. There is no rematch backend, so there is no "Play again".
- **Focus:** the dialog's title is focused on open, Tab stays inside, and focus returns to Show results. The actions sit in a footer that is never clipped.

Confetti:

- One burst: at most 80 particles, about 1.3 s, in a lazily loaded 1.3 kB chunk.
- It plays only when the end is seen live and motion is allowed.
- A refresh or reconnect shows the same screen without it.

### Controls and the log

- The board, the turn banner and the player counters all show the same state, and change together.
- Controls are enabled only after the reveal has finished.
- The move log never runs ahead of the board.

### Reduced motion

The die shows its value at once, and tokens slide straight to their destination in 180 ms. The auto-move pause is kept.

Captured tokens slide straight home. There are no capture or home effects and no confetti. The banners, counters and victory screen are unchanged.

## Sessions

This follows the [browser guidance in sessions.md](sessions.md#guidance-for-the-browser-ui).

### Storage

- **`localStorage` `ludo.seats.v1`:** one entry per seat: `{ roomCode, playerId, secret, displayName, roomName, savedAt }`. It survives closing the browser. At most 20 seats are kept.
- **`sessionStorage` `ludo.tab.v1`:** the seat this tab controls.

The secret is a bearer credential the browser must hold to resume. The server stores only its digest. The secret is never logged, never put in a URL and never shown.

### How each situation is handled

| Situation | What happens |
| --------- | ------------ |
| Refresh | The tab marker is found and the seat resumes without `takeover` |
| A brief `session-in-use` while the old socket is released | Retried quietly a few times |
| A new tab with a stored seat but no marker | It tries to resume without `takeover`. If the seat is open elsewhere (`session-in-use`), the lobby says so and offers **Continue here as {name}** (an explicit `takeover`). Nothing is taken silently. |
| Several stored seats for one room (several players on one device) | The lobby asks which player to continue as |
| `session:ended` `replaced` | The tab stops acting and offers to continue here |
| `session:ended` `left` or `expired`; resume answers `session-expired` or `unauthenticated` | The stored seat is removed |
| Different players in two tabs | Each holds its own seat and marker |

The **Resume** page lists stored seats, with Resume and Forget.

## Responsive layout

### Game screen

The game screen follows `docs/design/ui-desktop.md`, `ui-tablet.md` and `ui-mobile.md`. The board side is `min(available width, available height)` after the fixed bars and columns. The board is never clipped and never scrolls separately.

| Width | Layout |
| ----- | ------ |
| ≥ 1280 px | Three columns: players and room (240–280 px), the board, then the turn, die, move tray and log (280–320 px) |
| 1024–1279 px | The board, plus a 300 px rail |
| Below 1024 px | A players strip, a full-width board, and a fixed thumb bar with the turn banner and a 76 px die button. The move tray (two-column tiles of at least 56 px) slides up inside the bar. |

During play:

- the footer is hidden;
- lobby toasts are cleared, and notices appear in an inline status line, so nothing floats over the board or the controls.

### Other pages

The app has distinct layouts rather than one stretched column:

- **Desktop (`lg` and up):** multi-column grids (hero with board; form with a sticky summary; lobby with players, code and actions side by side). These are capped at 1280–1440 px.
- **Tablet:** two-column where it fits.
- **Phone:** a single column with a fixed bottom action bar for the main action. The bar publishes its height as `--action-bar-h`, and page padding and toasts use it.

Sizes that depend on height (the hero board, the create preview) use `svh`.

These sizes were checked with headless Chromium for no horizontal overflow and no console errors: 1920×1080, 1366×768, 1024×768, 768×1024, 390×844 and 360×800. Reduced motion turns off the animations.

## Tests

### Browser end-to-end (Phase 3C.1)

Complete 2-, 3- and 4-player games, the classic rules, and refresh or reconnect, played in real Chromium against the real server and PostgreSQL: [docs/qa/browser-e2e.md](../qa/browser-e2e.md).

### Phase 3B

- **Board tests:** geometry and placement against `@ludo/board-layouts`, and board rendering. These cover start, safe, lane and finish cells, token-to-cell mapping, stacks, and the interactive tokens.
- **Game-screen tests** with a scripted client, covering:
  - wrong-player rejection;
  - roll, reveal, then move offering;
  - legal-token highlighting;
  - manual moves with no movement before the server answers;
  - a refused move;
  - auto-move timing;
  - capture return;
  - snapping after a refresh or a version jump;
  - pause and finish.
- **Connection tests:** the versions sent with roll and move, and reconciliation after a stale refusal, a version gap or a missing snapshot.
- **Real Socket.IO + PostgreSQL tests** (`clientConnection.pg.test.ts`). The client's own `GameConnection` plays real turns against the real server, with dice queued at the server's dice source (its only test seam). They cover rolls, legal moves, wrong-player refusals, a manual move both players see, bonus and turn passing, an auto-move as one action, a stale refusal and recovery, and the exact board after a refresh.

### Phase 3A

#### UI tests

UI tests (`apps/client/src/**/__tests__`, Vitest + jsdom) render the real app against a scripted `FakeClient`. They cover:

- the create and join forms;
- invalid codes;
- taken and automatic colours;
- host-only start;
- lobby rendering and live updates;
- presence;
- restore and takeover;
- forgetting a seat.

These prove UI behaviour, **not** live multiplayer.

#### Live multiplayer

Live multiplayer is covered by `apps/server/src/__tests__/clientConnection.pg.test.ts`. It runs the client's own `GameConnection` and `SeatStore` over real WebSockets against the real server and PostgreSQL. It covers:

- create;
- a preview with no ids or secrets;
- malformed and unknown codes;
- automatic and taken colours;
- a full room;
- live joins;
- host-only start;
- the disconnect indicator;
- restore from storage;
- refusal of a second tab, then explicit takeover;
- a wrong secret;
- automatic re-attach after a transport drop;
- leaving.
