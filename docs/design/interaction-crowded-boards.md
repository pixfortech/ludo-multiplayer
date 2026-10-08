# Interaction layer for crowded boards

Applies whenever cells are smaller than the comfortable 30 px: ring boards (5–15 players) on phones and small tablets, the triangle on phones, and classic on very small phones. The per-device numbers are in the [geometry report](generated/geometry-report.md). The rule: **touch targets never depend on cell size.**

## 1. The move tray (primary selection)

When the server reports legal moves for your roll, a tray slides up above the action bar with **one large button per legal token** (≥ 56 px high, full-width on phones, 2–4 per row on tablets):

```
┌───────────────────────────────────────────┐
│ ♥ Token 2   step 31 → 35   ★ lands safe   │  ← tap to preview, tap again to move
│ ♥ Token 4   base → start   (opens)        │
│ ♥ Token 1   lane 52 → 56   ⌂ finishes     │
└───────────────────────────────────────────┘
```

- Each entry shows the symbol, the token number, from → to, and the outcome: **captures {name}**, **lands safe**, **enters lane**, **finishes**, or **opens**. Outcomes come from the server's legal-move list (the client computes nothing).
- **First tap previews:** the board pans to the token, highlights its exact path cell by cell, and outlines the destination. **A second tap or the "Move" button confirms.** Board taps on a token do the same.
- Ordered by step (most advanced first). Tokens with no legal move are not listed.
- With **exactly one** legal move and auto-move on, the tray shows that single move as "Auto-moving…" during the reveal pause; there's nothing to tap.
- Keyboard: ↑/↓ to choose, Enter to confirm. Screen readers announce each entry.

## 2. Automatic focus

- **Your turn:** after the dice reveal, the camera (2D viewport or 3D camera) eases over ≤ 400 ms to frame **all your movable tokens plus their destinations** at a zoom of ≤ 2.3×. If they don't fit at 2.3×, it frames the most advanced one, and the tray handles the rest.
- **Others' turns:** the view follows the moving token at overview zoom when "Follow moves" is on (default on for phones, off for desktop).
- After the move animation: return to the previous view, or stay if the player zoomed manually during the turn.
- Never auto-moves the view while a finger is down, and never during the reduced-motion "snap" mode (it cuts instead of easing).

## 3. Navigation

| Control | Behaviour |
| --- | --- |
| **Fit** (button) | full-board overview; always one tap away |
| **My tokens** (button) | cycles focus through your tokens (base → most advanced) |
| **Current player** (tap their chip) | frames that player's base and active tokens |
| Pinch / double-tap | zoom 1–3× around the touch point, pan clamped to the board |
| Mini-map | appears while zoomed > 1.2×: a 72 px overview with a viewport rectangle; tap to jump |
| Two-finger drag (3D) | pan; one-finger drag orbits within clamps |

## 4. What never moves or hides

The die and roll button, the turn banner, the move tray, and the Fit button stay in fixed screen positions **outside** the zoomable layer. Zooming, panning or switching 2D ↔ 3D never removes or covers a game control.

## 5. Board-side affordances when zoomed out

- Movable tokens get a 3 px ring that scales with the zoom (never under 2 px), plus a numbered badge (1, 2, 3…) that matches the tray entries.
- Stacks show a count badge; tapping a stack opens a mini picker (it never guesses).
- Optional "symbols on board" setting: symbol plates on bases and lane entries, for colour-blind players at 12+ seats.

## 6. Acceptance criteria (checked in Phase 4 and 6)

- Any legal move can be made on a 360 × 800 phone with the board at overview zoom, using only targets ≥ 44 px.
- From any zoom, Fit returns to the full board in one tap.
- No game control is ever covered or scrolled out of view.
- The focus behaviour never animates the camera during a touch.
