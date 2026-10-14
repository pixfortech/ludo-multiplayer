# Motion design

Timings and easings live in `MOTION` (`packages/design-tokens/src/ui.ts`) and are shared by 2D and 3D.

## Rules

1. **Animation is presentation only.** The authoritative state arrives from the server first; animation plays *toward* it. No animation decides or delays a rule.
2. **One event at a time, in order.** Server events (roll → move → capture → bonus → turn change) go into a client animation queue keyed by `stateVersion`.
3. **Never block on animation for correctness.** If a newer state arrives (reconnect, skipped frames, a backgrounded tab), the queue fast-forwards: remaining animations collapse to ≤ 120 ms or snap.
4. **Input follows the server, not the animation.** A control enables only when the server says the action is allowed *and* the preceding reveal has finished. A delayed reveal can never expose an action early or allow an invalid one.
5. **Restraint.** At most one celebratory effect at a time; no full-screen particle storms.

## Sequences

| Event | Timeline |
| --- | --- |
| **Roll** | tray pulse stops → die tumbles `diceRoll` 650 ms (`standard`) → lands with `settle` → result face highlighted `diceReveal` 260 ms → movable tokens begin pulsing |
| **Six** | after the reveal: gold pip-ring flash 300 ms + one soft radial burst behind the die (400 ms, opacity ≤ 35%); banner "Six: roll again" |
| **Move** | token lifts 6% → hops cell by cell along the **exact authoritative path** (`hopPerCell` 170 ms each, arc height 0.25 cell, `standard`) → lands with `settle` (overshoot ≤ 6%, no wobble). Diagonal corner crossings hop like any other step. Long moves (> 8 cells) speed up to 120 ms per cell after the 4th hop. |
| **Opening (6)** | token rises from its base slot and arcs onto the start cell (320 ms) |
| **Auto-move** | roll → reveal → **`autoMovePause` 350 ms** with the moving token highlighted → normal move. Banner: "Auto-moved: only one legal move". |
| **Capture** | attacker completes its move → captured token flashes its rim (120 ms) → shrinks to 80% and arcs back to its base slot along a smooth curve over the board (`capture` 520 ms, not cell by cell) → attacker's seat gets a "Capture: roll again" banner with a brief seat-colour sweep on its chip |
| **Home entry** | token glides into its finish wedge (`homeEntry` 600 ms) → scales to 72% → home counter ticks with a 1.2× pop → token becomes non-interactive → "Home: roll again" |
| **Turn change** | previous player's base glow fades (220 ms), next player's fades in; chip outline moves; banner updates; on own device a light haptic (if supported) |
| **No legal move** | reveal → 600 ms hold with "No moves: passing turn" → turn change |
| **Three sixes** | third die reveals → die shakes softly (200 ms) → "Three sixes: turn forfeited" → turn change |
| **Victory** | final home entry → board dims to 85% except the winner's tokens → winner's chip enlarges with a crown → one tasteful confetti burst in seat colours (≤ 80 particles, 1.2 s, 2D canvas or instanced 3D quads) → results sheet; total `victory` 2.4 s |

## Presentation sequence (C.3C.1, 2.5D/3D)

One plan per server version (`game/playbackPlan.ts`): a list of steps at fixed
times (the die thrown, revealed; the cue; each hop; the capture; the home
entry; settle), executed on the plan's own clock (`useBoardPlayback`). Each step
applies its part of the view and emits its presentation events
(`game/presentation.ts`): `die-throw`, `die-land`, `cue`, `token-move`, and
`victory-screen` from the game screen. These are the hooks for sound and
dialogue (dice sounds, reactions, Bengali lines with English subtitles,
capture, home, victory music); none are connected yet.

- **The plan's clock.** Each step runs at its time after the action began,
  not after the previous step ran: steps that fell due while the page was busy
  run together, in order, in one batched update, and lateness never adds up
  cell after cell. The die's reveal is the one anchor: if it runs late,
  everything after it moves back by its lateness, so the value is on show
  (reveal pause, auto-move pause) before anything moves. A step is applied at
  the time it was due, so a move's path starts on the plan's clock and the 3D
  board catches up with a late timer instead of lagging behind it.
- **One path per move.** All of a move's cell steps carry the same `MovePath`
  (every cell, its kind and time, its start). The 2D board, the token list and
  the log advance cell by cell from the steps; the 3D board follows the path by
  elapsed time (`board3d/pathMotion.ts`). A newer server state, a refresh, a
  reconnect, a pause or a renderer switch drops the path and places tokens on
  the server's state.
- Pacing (characters): a cell 340 ms, a six-cell walk about 2 s, cells in the
  middle of a longer move 250 ms, leaving the base 0.8 s, home 0.7 s, a capture
  0.8 s; the 3D die's throw 950 ms. Pawns keep their hop timings.
- Only consecutive versions are played; a refresh, a reconnect or a skipped
  version snaps to the server's state and emits nothing (no replay).
- A newer version or a pause fast-forwards the plan; every step and cue has a
  fixed length, so nothing can wait forever or hold input.
- A six with characters: die lands → team reacts (1.4 s, while the choice is
  already open) → the chosen character waves and leaves after the server
  accepts the move.
- A capture: arrival → capture cue (attacker cheers; victim's dismay and walk
  back to its own base slot) → bonus cue.
- Camera emphasis: in the 3D follow view only, a capture draws the camera to
  the capture cell and a home entry or the win to the board's centre for
  1.6 s, within the camera's usual zoom limits. The aerial 2.5D view and an
  overview or free view the player chose never move; a drag or the Overview
  button takes over at once.
- The victory screen opens after the win cue (3.2 s) when characters play the
  game, else after 700 ms.

## Reduced motion (`prefers-reduced-motion` or the in-game setting)

- The die shows its result directly (crossfade 120 ms); no tumble. In 2.5D/3D the 3D die is placed on its value without a throw.
- No character reactions to game events (cues are not presented).
- Tokens slide straight to the destination in 180 ms, or teleport with a 120 ms crossfade for captures.
- No pulses (movable tokens get a static ring), no bursts or confetti; banners and announcements are unchanged.
- The order of reveals and the minimum pause before an auto-move (350 ms) are kept, because they carry meaning.

## 3D camera

- **Default:** fixed three-quarter view (pitch 55°, slight 6° yaw toward the current player). It transitions only on turn change, over 900 ms with `standard` easing, and only if the "follow turn" setting is on.
- **Top-down** and **isometric** presets are available from the view menu.
- Touch: one-finger orbit (yaw ±35°, pitch 35–85° clamped), two-finger pinch zoom and pan within board bounds, double-tap to reset. The camera never auto-moves while the user is touching.
- No cinematic sweeps during play; a single 1.6 s establishing move when a game starts.

## Performance

- 2D: animate only `transform` and `opacity`; one rAF-driven queue; no layout thrash.
- 3D: animate object transforms and material uniforms only; no per-frame allocations; tween library-free (shared easing functions).
