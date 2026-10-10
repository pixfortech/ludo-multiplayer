# The 2.5D board and the 3D foundation (Batch C.1)

The board can be drawn three ways, all from the same inputs, so switching
never touches the game:

| View | What it is | When |
| --- | --- | --- |
| **2.5D** (default) | Real 3D geometry seen through a fixed orthographic aerial camera (62° above the board), always fitted to the whole board | Wherever WebGL 2 works |
| **3D (preview)** | The same scene through a perspective camera: isometric overview, constrained orbit (drag, pinch, wheel), follow the active token, reset | When the player chooses it |
| **2D** | The approved SVG board | No WebGL, a renderer failure, the player's choice, or (automatic setting only) a device too slow even at Low quality |

The choice and the graphics quality (Auto, Low, Medium, High) are remembered per browser.

## One source of positions

- `@ludo/board-layouts` (`world.ts`): `cellToWorld(row, col)`, `classicStepCell(seat, step)`,
  `baseSlotToWorld(seat, slot)`, `tokenPositionToWorld(seat, step, slot)`. One cell is one
  world unit, the board is centred on the origin, rows run along +Z, so the board seen from
  above reads exactly like 2D. The 2D board's `stepCell` now delegates to the same function.
- Tokens: the 3D board uses the 2D board's placements (`placeTokens`, stacks included) and
  converts them with `svgToWorld`. Tests prove 2D and 3D agree for every seat, step and base
  slot, and that each seat's route is the previous seat's turned a quarter.
- There is no second path or movement map anywhere in the renderer.

## The scene

All geometry is procedural (`board3d/geometry3d.ts`) and comes from `boardModel.ts`, a pure
description of the board built only from the layout (unit tested):

- a bevelled tabletop slab, a raised border in the city's plinth colour, a grid plate;
- 72 bevelled cells in one instanced mesh with per-cell colour (52 track, 4 starts, 20 lane
  cells), lanes deepening toward the centre as in 2D;
- inlaid safe stars (the approved 2D star path) and chevrons on the starts and lane entries;
- raised bases in three stepped tiers with four slot wells; the current player's base outlined;
- the raised centre (one triangle per seat) and a "You" label on your base;
- city board materials from `boardMaterial2d` (classic stays as approved);
- placeholder tokens: lathe-turned resin pawns in the seat colour, the seat symbol on the
  flat top, the 2D states (movable ring, selected lift and ring, dimmed, finished), move
  numbers matching the tray, stack counts. `PawnBody` implements a small interface
  (`TokenBodyProps`: identity, state) and `Token3D` places, scales and moves it along the motion
  sample, so an animated character can replace it in Batch C.3 without touching the board or
  the game.

Lighting is mostly soft sky light, so cells keep their exact colours (measured: plain cells
within ΔE 0.7, start cells within ΔE 5), plus a high key light for depth.

## Motion and interaction

- Positions come from `useBoardPlayback`, the same playback as 2D: nothing moves until the
  server's state does, and each change carries the same typed motion (hop, land, open, home,
  capture, slide). `motion3d.ts` samples them per frame; a change without a motion is a jump.
- Picking: raycast on each movable token's hit cylinder, plus a forgiving tap catcher that
  picks the nearest movable token within 0.85 cells. Mouse: hover previews, click moves. Touch:
  first tap previews (path dots and destination ring), second tap moves. Only the server's
  legal moves are pickable.
- Overlays: the move preview from the server's legal move, and capture and home bursts.

## Cameras

`CameraRig.tsx` owns both cameras; `cameraMath.ts` holds the rules (unit tested):

- aerial: orthographic, fixed angle, fitted with `fitAerial(aspect)` so the whole board and a
  raised token are in frame at any aspect; no input moves it;
- immersive: `isometricPose`, `orbit` with limits (pitch 24–84°, distance, target kept on the
  board), `focusPose` on the active token, `blendPose` transitions (instant under reduced
  motion), reset to the overview.

The camera never changes a token's position or any game state.

## Rendering, quality and resilience

- Lazy chunk: three.js and React Three Fiber load only when a 3D view is shown; the 2D board
  is shown while it loads. Exact versions: three 0.186.1, @react-three/fiber 9.8.1.
- On-demand rendering: frames are drawn only while something changes or moves.
- Quality: Low (pixel ratio 1, no antialiasing, contact blobs, fewer segments), Medium
  (pixel ratio ≤ 1.5, antialiasing, physical resin, contact blobs), High (pixel ratio ≤ 2,
  real-time soft shadow maps). Auto starts at Medium (Low on phones), steps down when frames
  average over 22 ms, and, if the player has not chosen a view, falls back to 2D when even
  Low averages over 45 ms. Quality never changes positions or what is pickable.
- Resources: geometries and materials are shared and disposed on unmount; textures are cached
  per renderer and disposed with it.
- Failure: a lost WebGL context, no first frame within 8 s, or an error in the renderer falls
  back to the 2D board with a notice; the game is untouched.
- A hidden mirror lists each token's step, state and projected screen position, and each
  cell's colour and projected centre: the browser tests read the drawn pixels there and click
  or tap tokens where they appear.

See [3d-readiness.md](3d-readiness.md) for the full 3D plan and what comes next.
