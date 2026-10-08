# Mobile UI specification (< 600 px wide)

Reference viewports: **390 × 844** and **360 × 800**. A purpose-built phone game screen, not a shrunken desktop. One-handed, thumb-reachable controls.

## Portrait (primary)

```
┌──────────────────────────┐
│ ≡  ABC·123   ♥◆❀⚡ +11  ⛶ │  56  compact chips: current player enlarged; "+11" opens the full list
├──────────────────────────┤
│                          │
│                          │
│     BOARD (full width)   │  side = width − 32
│          [Fit] [◎ Mine]  │  floating, inside the board's safe corner
│                          │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ move tray (when      │ │  slides up, ≥ 56 px rows
│ │ choosing)            │ │
│ └──────────────────────┘ │
│ Your turn: roll  [ DIE ] │  88  thumb zone; die 64 px
└──────────────────────────┘
```

| Board | 360 px phone | 390 px phone | How it plays |
| --- | --- | --- | --- |
| Classic (15 cells) | 21.9 px/cell | 23.9 px/cell | full board; colours alone separate the classic four for every vision type; move tray + light zoom (1.3×) recommended |
| Rectangle (19 × 9, rotated) | 32.8 | 35.2 | full board, comfortable |
| Triangle (est. 23 × 20) | 16.6 | 18.1 | overview + move tray + focus view |
| Rings 5–15 (est. 24–28 cells) | 11.9–13.7 | 13.0–15.0 | overview + **move tray** + **auto-focus** (≤ 2.3×) |

Numbers come from the [geometry report](generated/geometry-report.md).

## Interaction

- **Roll:** the die in the bottom-right thumb zone; a large tap target (64 × 64 inside an 88 px bar).
- **Choose:** the move tray ([interaction-crowded-boards.md](interaction-crowded-boards.md)). Board taps also work, but are never required.
- **Navigate:** Fit and ◎ Mine float in the board corner; pinch / double-tap zoom; mini-map while zoomed.
- **Menu (≡):** a bottom sheet with room code and share, settings, 2D/3D, theme, log, leave.
- **Haptics:** a light tap on your turn, a stronger one on capture (Vibration API where supported).

## Landscape phones (height < 500)

The board fills the left at full height. A 160–200 px right rail holds chips (2 columns of icons), the die, banner, and the move tray as a vertical list. Fullscreen is suggested on the first landscape rotation.

## Same-screen on a phone

Pass-and-play is supported for 2–4 players. Each turn shows a 1 s banner, "Pass to Ben ◆", with a seat-colour sweep. More than 4 players on one phone is allowed but the lobby recommends a tablet.

## Own-device online play

- Your chip is pinned first; "You" appears on your base; your tokens get the focus button.
- When it is not your turn, controls are visibly disabled (not hidden), and the banner shows whose turn it is with a live dot.
- Background tab or lock: a turn notification (if permitted), and on return the state restores with a "Game resumed" banner.

## Verification

Screenshots at 390 × 844 and 360 × 800 for 2-, 4-, 6- and 15-player boards in Phase 4 (2D) and Phase 7 (3D). No viewport is claimed verified without a screenshot.
