# Desktop UI specification (≥ 1200 px wide)

Reference viewports: **1920 × 1080** and **1366 × 768**. Mouse and keyboard first, with touch screens supported.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ Ludo   Room ABC·123 ⧉   2D|3D   ☀/☾   ⛶ fullscreen   ⚙                  │ 64
├────────────┬───────────────────────────────────────────┬─────────────────┤
│ PLAYERS    │                                           │  ┌───────────┐  │
│ ♥ Asha ●●○○│                                           │  │   DIE     │  │
│ ◆ Ben  ●○○○│              BOARD (square)               │  │  [Roll]   │  │
│ ❀ Cai  ○○○○│        as large as height allows          │  └───────────┘  │
│ ⚡ Dev ●●●○ │                                           │  Your turn      │
│            │                                           │  Last: Ben 4    │
│ spectators │                                           │  Move tray      │
│ room info  │                                           │  Move log ▾     │
└────────────┴───────────────────────────────────────────┴─────────────────┘
   280 px                    flexible                          320 px
```

- **Board:** `side = min(width − 600 − 48, height − 64 − 48)`. That's ≈ 968 px at 1080p and ≈ 656 px at 768p.
- **Player column:** a chip per player (symbol, name, home counter, connection dot). The current player's chip has a seat-colour outline and moves no layout.
- **Game column:** die and tray, turn banner, last roll, the move tray (2-column grid on desktop), then the move log (last 50, collapsible).
- **15 players:** the player column becomes a 2-column compact grid (symbol + initials + counter); full names show on hover/focus.

## 1366 × 768

Side columns shrink to 240 / 280 px and the log collapses to its last 5 rows. The board is ≈ 656 px, which is comfortable for classic (44 px cells) and adequate for 15 players (≈ 24 px cells, with the move tray doing the selecting).

## Fullscreen

The ⛶ button (Fullscreen API) hides browser chrome. If height then permits a larger board than the columns allow, the columns become translucent overlay panels that slide in on hover or focus. Esc exits.

## Input

- **Mouse:** hover a movable token to preview its path (same as the first tray tap); click to move. Hovering a tray entry previews too.
- **Keyboard:** Space/R = roll, Tab/arrows = cycle movable tokens in board order, Enter = move, F = fit, Z = zoom toggle, L = log.
- Zoom (wheel + drag) is available but rarely needed. The Fit button is always visible.

## Same-screen (pass and play) on desktop

The current player is shown by the chip outline, base glow and banner "Ben — your turn" with a symbol. The die tray takes their colour. An optional "hide controls between turns" is unnecessary: Ludo has no hidden information.
