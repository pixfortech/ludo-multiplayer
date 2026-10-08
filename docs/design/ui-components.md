# UI component styling

Tokens: `SPACE`, `RADIUS`, `TYPE`, `FONT`, `THEMES`, `MIN_TOUCH_TARGET` in `packages/design-tokens/src/ui.ts`. Components are built once in Phase 3–4 (`packages/ui` or `apps/client/src/components/ui`) and themed via CSS variables generated from these tokens.

## Foundations

- **Spacing:** 4 px base; component padding 12–16, section gaps 24–32.
- **Radii:** chip 8 · control 12 · card 16 · panel 24 · pill.
- **Elevation:** two levels only. Raised = `0 1px 2px rgba(20,24,33,.08)`; overlay = `0 12px 32px rgba(20,24,33,.18)`. Dark theme uses lighter surfaces instead of shadows.
- **Focus:** 2 px `focus` ring, 2 px offset, on every interactive element (visible on keyboard focus only).
- **Touch:** every target ≥ 44 × 44 px; primary game actions ≥ 56 px.
- **States:** hover (desktop only) +4% overlay · pressed scale 0.97, 80 ms · disabled 40% opacity, no pointer events, still readable.

## Components

| Component | Anatomy | Notes |
| --- | --- | --- |
| **Primary button** | accent fill, white label, 48 px high (56 in game), radius control | One primary per view |
| **Secondary button** | surface fill, 1 px border, ink label | |
| **Icon button** | 44 px square, 24 px icon, tooltip on desktop, `aria-label` always | |
| **Roll button / dice** | die (see [dice-design.md](dice-design.md)) inside a seat-tinted tray; label "Roll" below at 14 px | Disabled unless it's your turn and the server awaits a roll; never optimistic |
| **Player chip** | symbol disc (24 px) + name + home counter `●●○○` + connection dot | Current player: seat-colour outline + subtle glow; never rely on colour alone |
| **Turn banner** | "{Name}'s turn" + symbol, or "Your turn: roll" / "Choose a token (4)" | Single line; announces via `aria-live="polite"` |
| **Room code** | 6 characters, Inter 600, tabular, letter-spaced, in 3+3 groups | Copy button + share link + (later) QR; ambiguous characters (0/O, 1/I/L) excluded |
| **Colour picker** | 15 swatches as token chips (symbol shown), taken = 40% + taker's name below | "Auto" chip first; keyboard grid navigation |
| **Settings rows** | label + description + control (segmented control for ≤ 4 options, select above) | Player count uses a stepper 2–15 with board-shape preview |
| **Board preview** | live mini render of the selected board shape and seat colours | Same layout code as the game |
| **Toast** | bottom-centre (mobile) or top-right (desktop), 4 s, max 2 stacked | Game events only when actionable |
| **Modal / sheet** | desktop centred modal; mobile bottom sheet with drag handle | Focus-trapped, Esc / swipe to close |
| **Move log** | compact rows: symbol, verb, detail, relative time | Collapsible; capped at the last 50 |
| **Connection status** | inline pill: Connected · Reconnecting… · Offline | Reconnecting shows a spinner and disables actions |
| **Reconnect / resume banner** | "Game resumed: it's {Name}'s turn" | Shown once after a restore |

## Content style

- Sentence case everywhere; verbs on buttons ("Roll", "Create room", "Copy link").
- Name players, not colours ("Asha's turn", not "Red's turn"), with the symbol alongside.
- No debug wording in production UI (ids, states, coordinates).

## Accessibility

- Text contrast: body ≥ 4.5:1, large text and UI glyphs ≥ 3:1 in both themes (checked when the client is built).
- Full keyboard play: Tab to tokens in board order, Enter to select, Space or R to roll.
- Screen-reader announcements for roll results, moves, captures, home entries and turn changes.
- Respects `prefers-reduced-motion` and `prefers-contrast`, and offers a "symbols on board" option.
