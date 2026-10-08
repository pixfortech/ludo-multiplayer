# Tablet UI specification (600–1199 px wide)

Reference viewport: **1024 × 768** (landscape) and **768 × 1024** (portrait). Touch first.

## Landscape

```
┌──────────────────────────────────────────────────┬───────────────────┐
│                                                  │ ♥ ◆ ❀ ⚡  chips    │
│                                                  │ ┌───────────────┐ │
│             BOARD (full height)                  │ │  DIE  [Roll]  │ │
│                                                  │ └───────────────┘ │
│                                       [Fit]      │ banner            │
│                                                  │ move tray         │
│                                                  │ log ▸ (tab)       │
└──────────────────────────────────────────────────┴───────────────────┘
                     ≈ 700 px                              300 px
```

- Board area ≈ 676 × 720 px: classic ≈ 45 px cells; 5–15 player rings ≈ 25–28 px cells (see the geometry report). The move tray is the primary selection for 10+ players, and tapping tokens on the board also works.
- The right rail shows chips in a 2–4 column grid for large counts, then the die, banner, move tray and a log tab.

## Portrait

```
┌──────────────────────────────┐
│ chips (horizontal scroll)    │  64
├──────────────────────────────┤
│                              │
│      BOARD (full width)      │  ≈ 720
│                              │
├──────────────────────────────┤
│ banner        [ DIE ][Roll]  │  96
│ move tray (2 per row)        │  slides up when needed
└──────────────────────────────┘
```

The board keeps its full width; when the move tray is open, it overlays the lower board edge (translucent) rather than shrinking the board.

## Same-screen play (a tablet flat on the table)

- **Table mode** (setting): for the square and ring boards, the dice hub sits in the board centre; the banner text and die rotate to face the current player's side; player chips sit at each player's edge.
- The die is large (72 px) and reachable from any side via the centre hub.
- An optional **confirm-move** step guards against stray taps from other hands.

## Gestures

Pinch zoom 1–3×, double-tap to zoom or fit, two-finger pan. One-finger drag on the board never pans in 2D (it is reserved for token selection), so there are no accidental moves.
