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

## Reduced motion (`prefers-reduced-motion` or the in-game setting)

- The die shows its result directly (crossfade 120 ms); no tumble.
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
