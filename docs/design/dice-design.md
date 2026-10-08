# Dice design

One die identity used everywhere: idle, rolling and result, in 2D and 3D. The server generates every value; the die only animates toward it.

## Form

- Rounded cube, edge radius 18% of the side. Soft, tactile, premium, and not toy-like.
- **Body:** ivory resin `#F6F1E7`.
- **Pips:** recessed, ink `#141821`.
- Standard Western layout: opposite faces sum to 7, and 1-2-3 run counter-clockwise around their shared corner.
- **Six:** the same pips, with a fine gold `#E3B341` inlay ring around each pip. It's subtle when idle and becomes the hook for the six celebration.
- The die body is never recoloured per player. The **tray** (the area holding the die) takes the current player's colour, so identity stays clear without a rainbow of dice.

## 2D die

- Rounded square, radius 22% of the side. Body has a vertical gradient `#FFFFFF` → `#F6F1E7`, 1 px `#D8D0C2` border, and a contact shadow.
- Pips: circles with diameter 18% of the side, with a 1 px inner shadow to suggest recess.
- Size: 64 px (mobile action bar), 72 px (desktop panel), 56 px when shown in the board hub for same-screen play.
- States:

| State | Treatment |
| --- | --- |
| ready (your turn, can roll) | tray glows in seat colour, breathing pulse 1.6 s; the die shows its last face at 100% |
| rolling | 3–4 squash-and-tumble frames cycling random faces (presentation only), 650 ms |
| result | lands with a settle (overshoot ≤ 6%), holds 260 ms before any token moves |
| waiting (not your turn) | 70% opacity; the tray is neutral |
| six | gold ring flash on pips + a single soft radial burst behind the die (no confetti) |

## 3D die

| Property | Value |
| --- | --- |
| Size | 0.70 board cells |
| Geometry | rounded box, 4 bevel segments; pips as real indents (sphere-subtracted) |
| Triangles | ≤ 3,000 (LOD0), ≤ 900 (LOD1, pips via normal map) |
| Material | `MeshPhysicalMaterial`: ivory, roughness 0.30, clearcoat 0.6; pips `MeshStandardMaterial` ink, roughness 0.6 |
| Pivot | geometric centre |

### Roll animation (deterministic, not physics-decided)

1. The server's value arrives.
2. The client picks a pre-authored tumble from a small set (keyframed quaternions over 650 ms with 2–3 bounces) whose **final orientation shows that value face-up**.
3. The die settles, the result face is highlighted, and only then can any movement start.

The animation can never "land" on a different value than the server sent, and nothing on the client is random beyond the choice of tumble.

## Dice tray

- 2D: a pill or rounded rectangle in the action area, outlined in the current player's `rim`, filled with the `lane` colour at 35%.
- 3D: a shallow felt-lined tray beside the board (or in the board hub for 5+ players), with the felt colour tinted toward the current player.

## Result display (separate concepts)

| Element | Shows |
| --- | --- |
| Active die | the value in play this turn |
| Last roll | previous roll and who made it (small chip in the log or banner) |
| Pending move | "Move 4: choose a token" prompt when a choice is needed |
