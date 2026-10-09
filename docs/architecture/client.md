# Web client (Phase 3A)

The browser client in `apps/client` is React 19, Vite and TypeScript, styled with Tailwind 4. Phase 3A built the app shell, the home page, the create and join workflows, the live multiplayer lobby and session handling. The game board, dice and moves follow in 3B.

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
| `src/components/brand/` | The wordmark, the hero board, board and renderer previews. They are drawn from the real classic layout data in `@ludo/board-layouts`; the geometry is not changed. |
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

After a transport reconnect (a new server-side socket), the connection re-attaches its seat with `room:resume`, using the credential it holds in memory. If the seat is now controlled elsewhere, it does **not** take over.

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

The app has distinct layouts rather than one stretched column:

- **Desktop (`lg` and up):** multi-column grids (hero with board; form with a sticky summary; lobby with players, code and actions side by side). These are capped at 1280–1440 px.
- **Tablet:** two-column where it fits.
- **Phone:** a single column with a fixed bottom action bar for the main action. The bar publishes its height as `--action-bar-h`, and page padding and toasts use it.

Sizes that depend on height (the hero board, the create preview) use `svh`.

These sizes were checked with headless Chromium for no horizontal overflow and no console errors: 1920×1080, 1366×768, 1024×768, 768×1024, 390×844 and 360×800. Reduced motion turns off the animations.

## Tests

### UI tests

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

### Live multiplayer

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
