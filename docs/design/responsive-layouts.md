# Responsive layouts: desktop, tablet, mobile

**Principle:** the board is the centrepiece and is always fully visible. Primary actions (roll, choose token) never require scrolling. Each device class gets a purpose-built layout, not a scaled copy.

## Breakpoints (CSS px, by available width × height)

| Class | Condition | Layout |
| --- | --- | --- |
| Phone portrait | width < 600 | stacked: player strip / board / action bar |
| Phone landscape | height < 500 | board left (full height), compact side rail right |
| Tablet | 600 ≤ width < 1200 | board + collapsible side panel (portrait: panel below as a sheet) |
| Desktop | width ≥ 1200 | three columns: players / board / game panel |

**Board size:** `side = min(availableWidth − 2 × gutter, availableHeight − chrome)`, where `gutter` = 16 px on phones and 24 on larger screens, and `chrome` is the sum of fixed bars. The rectangle board uses its 19:9 aspect in landscape and is rotated 90° in portrait.

## Desktop (1920×1080, 1366×768)

- **Left (280 px):** player list (chips with name, symbol, home counter, connection), room code.
- **Centre:** the board, as large as the height allows (≈ 1000 px on 1080p, ≈ 690 px on 768p).
- **Right (320 px):** dice and tray, turn banner, last roll, pending move prompt, move log, settings.
- **Fullscreen:** button in the top bar (Fullscreen API); Esc exits. In fullscreen the side columns overlay as translucent panels if width is short.
- 1366×768: side columns narrow to 240 / 280 px; the log collapses to its last 5 rows.

## Tablet (1024×768 landscape, 768×1024 portrait)

- Landscape: board left at full height; right panel 300 px with dice, banner and players (a compact list). The log is in a tab.
- Portrait: board on top, full width; below it a two-row control area (dice + banner; player chips horizontally scrollable). The board is never shrunk to fit the panel; the panel scrolls instead.

## Mobile (390×844, 360×800)

```
┌──────────────────────────┐
│ ● ● ◐ ●  players strip   │  56 px: compact chips (symbol + initials), current player enlarged
├──────────────────────────┤
│                          │
│          BOARD           │  full width (side = width − 32)
│                          │
├──────────────────────────┤
│ Your turn: roll  [ DIE ] │  88 px action bar: banner + 64 px die, thumb-reachable
└──────────────────────────┘
```

- At 360×800: board ≈ 328 px. Classic (15 cells) gives about 21.9 px per cell, so tokens are ≈ 18 px: the minimum, and comfortable.
- Menu, log and room details are behind a top-right icon in a bottom sheet.
- Haptics on your turn and on capture (if supported); a sound cue optional.

### Crowded boards (5–15 players) on phones

Ring boards are 24–28 cells across, about 13–15 px per cell on a phone, below the token minimum. Required tools:

1. **Auto-focus:** when it's your turn and you must choose, the board zooms (≤ 2×) to frame all your movable tokens, then returns after the move.
2. **Pinch / double-tap zoom** with pan, clamped to the board; a **"Fit"** button restores the full view.
3. **Mini-map:** while zoomed, a 72 px thumbnail of the full board shows the viewport rectangle.
4. **Tap-to-pick:** tapping a crowded area opens a picker listing the tokens there (symbol + "token 2, 5 steps from home").
5. Primary controls (die, banner) are outside the zoomable area and never move.

## Same-screen multiplayer (pass and play)

- One device shows the complete game. No per-player hidden information, so no hand-off screens are needed.
- The current player is unmistakable: base glow, enlarged chip, banner with name and symbol, and the die tray tinted in their colour.
- Tablet or desktop on a table: the dice hub can sit in the board centre (ring boards), with an optional rotate-toward-current-player view for 2D.
- The action bar is shared; an optional "confirm move" step prevents accidental taps by others.

## Online multiplayer (own device)

- "You" are always highlighted: your chip is pinned first, your base gets a subtle "You" label, and your tokens are focusable.
- Personal turn notification: banner + haptic + optional sound; the tab title shows "Your turn".
- Other players' turns animate in real time from server events; you can't interact until the server grants your turn.
- Connection state is always visible (chip dots plus your own status pill); reconnect restores the exact state with a "Game resumed" banner.

## Verification

Layouts are checked with real browser screenshots at **1920×1080, 1366×768, 1024×768, 390×844 and 360×800** for 2-, 4-, 6- and 15-player boards in Phase 4 (2D) and Phase 7 (3D). A viewport is reported as verified only when a screenshot exists.
