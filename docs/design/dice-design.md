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

## 3D die (as built in C.3C.1; provisional look)

The 2.5D and 3D boards throw a real die into the base of the player who rolled
(`board3d/dice/Die3D.tsx`, rules in `board3d/dice/dieMath.ts`). The 2D board
keeps the 2D die; in 3D the tray shows a static face of the value (no second
animation).

| Property | Value |
| --- | --- |
| Geometry | `RoundedBoxGeometry`, edge radius 15% of the side, 2 segments at Low, 4 above (about 300 / 1,000 triangles) |
| Faces | one 3 × 2 canvas atlas (128 px cells at Low, 256 px above): ivory body, recessed ink pips, gold rings on the six; standard layout (opposite faces sum to 7; 1-2-3 counter-clockwise) |
| Material | `MeshStandardMaterial`, roughness 0.38; one draw call (no material groups) |
| Shadow | a soft radial contact disc that widens and fades with height |
| Size | 0.78 world units on large boards, up to 1.0 on small screens (a cell is 1) |
| Resting spot | inside the roller's base, on the side away from the start cell, clear of the four characters and of every path out of the base |

### Sequence (time-based, never physics-decided)

1. **Ready** (own roll, request on its way): the die lifts from its spot into the hand over the base's outer edge (260 ms) and shakes softly.
2. **Throw** (the server's value has arrived): from wherever it is, an arc and two bounces to its resting spot, rolling forward along its direction of travel with at least two whole turns and a small wobble, over `DIE3D_ROLL_MS` (1,150 ms). The plan picks, among the orientations that show the server's value on top, the one reached by rolling forward; the last part of the turn happens on the ground, so there is no snap. A seed (the throw's id) varies the turn and wobble; it never decides a value.
3. **Reveal**: the playback reveals the value when the throw ends; the tray shows it at the same time; tokens move only after.
4. **Turn passes**: a short toss (520 ms) to the next player's base, still showing its value.

Every motion is a function of time: at any frame the die is where its plan says, so dropped frames or a slow device never leave it mid-air. A remounted board (a quality or view change, including the automatic quality step) starts the die in the base of the seat whose turn it is on the server's latest value: a throw still in the air carries on for the time it has left and lands on its value, and a throw that has ended is never replayed. Frames are requested only while it moves.

**Reduced motion**: no lift, throw or toss; the die is simply on its value in the right base.

## Dice tray

- 2D: a pill or rounded rectangle in the action area, outlined in the current player's `rim`, filled with the `lane` colour at 35%.
- 3D: a shallow felt-lined tray beside the board (or in the board hub for 5+ players), with the felt colour tinted toward the current player.

## Result display (separate concepts)

| Element | Shows |
| --- | --- |
| Active die | the value in play this turn |
| Last roll | previous roll and who made it (small chip in the log or banner) |
| Pending move | "Move 4: choose a token" prompt when a choice is needed |
