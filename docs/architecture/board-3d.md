# The 2.5D board and the 3D foundation (Batch C.1)

The board can be drawn three ways, all from the same inputs, so switching
never touches the game:

| View | What it is | When |
| --- | --- | --- |
| **2.5D** (default) | Real 3D geometry seen through a fixed orthographic aerial camera (62° above the board), always fitted to the whole board | Wherever WebGL 2 works |
| **3D (preview)** | The same scene through a perspective camera: isometric overview, constrained orbit (drag, pinch, wheel), follow the active token, reset | When the player chooses it |
| **2D** | The approved SVG board | No WebGL, a renderer failure, the player's choice, or (automatic setting only) a device too slow even at Low quality |

Each player's view, graphics quality (Auto, Low, Medium, High) and camera are their own. They
are presentation only: never stored in the room, never sent over Socket.IO, and different renderers
play the same game side by side.

- The view and quality are kept per tab (`sessionStorage`, `ludo.view.tab.v2`), so a refresh keeps
  them and two players in two tabs of one browser keep their own. Nothing listens for other tabs'
  changes.
- They are also remembered per seat (`localStorage`, `ludo.view.seats.v2`, keyed by room code and
  player, the 20 most recent), so a player who resumes their seat in a new tab gets their own choice
  back and nobody else's.
- The camera (overview, follow, free orbit, zoom) lives in the page only; a 3D failure, the
  automatic quality steps and the slow-device fallback affect only that tab.
- Before this fix (after C.3C.1) the choice was one browser-wide key (`ludo.board-view.v1`) followed live through
  `storage` events, so a second player in another tab changed the first player's view. That key is
  no longer read or written.

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

## The living Kolkata environment (Batch C.2)

A semi-stylised, procedural Kolkata round the board: not an open world, with no characters
to steer. It is decoration: it never covers a cell, never takes a click, and never reads or
writes game state.

### Where it lives

- `packages/city-themes/src/environment3d.ts`: which cities have a 3D environment and its
  asset list (Kolkata only). Other cities keep their 2D environment round the 3D board, and
  never download the Kolkata chunk.
- `apps/client/src/components/board3d/environments/`: `registry.ts` (lazy `Component`,
  camera obstacles, landmark anchors per city), `kit.ts` (the `Builder` that merges coloured
  parts into one vertex-coloured geometry; `noRaycast`), `ambient.ts` (budgets, the ambient
  clock and its governor).
- `environments/kolkata/`: `layout.ts` (pure data: landmark footprints, routes, trees and
  lamps, all tested), `landmarks.ts` and `districts.ts` (the models), `Ground.tsx` (ground,
  river, embankments, tram track and wire, skyline, sky, haze), `KolkataLandmarks.tsx`,
  `Foliage.tsx`, `movers.ts` and `KolkataAmbient.tsx` (the ambient life),
  `KolkataEnvironment.tsx` (the lazily loaded chunk that composes them).

### The city

| District (seat corner) | What is there |
| --- | --- |
| North Kolkata heritage (crimson, north-west) | Bengali houses with shuttered windows, balconies and parapets; a courtyard; a tea stall with benches for adda; Writers' Building (red brick, white bands, pedimented portico) |
| Hooghly riverside (royal blue, north-east) | Ghats stepping into the river, a small temple, a jetty, moored boats; the Shaheed Minar |
| Cultural Kolkata (emerald, south-east) | The Maidan with its lawns, paths, benches, tram stop and tram loop under an overhead wire; the Victoria Memorial with its reflecting pool; College Street book stalls |
| Contemporary Kolkata (golden, south-west) | The Biswa Bangla Gate's tilted ring over the avenue, glass towers, a plaza with a sculpture |
| Joining them | The Hooghly's west arm with Howrah Bridge (cantilever truss, towers, anchor arms) to Howrah Station; the riverside promenade with railings and lamps; the ring road round the board; trees; a far skyline and a golden-hour sky |

Street signage is coloured boards with pale bands standing in for lettering (no text textures):
shop boards, a blue street-name sign, the College Street banner, a tram-stop sign, a ghat
notice board and a wayfinding totem.

Every model is merged into one geometry per landmark or district (one draw call each), with
vertex colours and no textures. Lamps and trees are instanced. Static scenery is about 9.7k
triangles on Low, 15.3k on Medium and 17.8k on High.

### Life

Yellow Ambassador taxis on two ring-road lanes (opposite directions), blue-and-white trams
round the Maidan, ferries on the Hooghly, and people on the promenade, the ghats, the Maidan
and the plaza; trees sway on Medium and High. One instanced mesh per kind. Counts per quality
(`ENV_QUALITY`): taxis 2 / 5 / 8, trams 1 / 2 / 3, ferries 1 / 2 / 3, people 4 / 12 / 22.

- Positions are a pure function of time along closed routes (`loopPoint`), so a dropped or
  throttled frame never makes anything jump, and nothing accumulates state.
- The ambient clock asks for frames at a capped rate (Low 12, Medium 20, High 30 a second),
  halves it while tokens move, stops while the tab is hidden, and never runs under reduced
  motion (everything stands still).
- The governor: after a 1 s warm-up it counts the frames delivered in a 2 s window against those
  it asked for, and the main-thread work of each. If fewer than three-quarters arrive, a frame's
  cost is taken as the window over the frames delivered (a GPU-bound device). If ambient frames
  would take more than about a third of the device's time it lowers the rate ("eased"), or stops
  the city ("resting") below 3 frames a second. Tokens moving or a hidden tab restart the window.
  It decides once per build and never raises the rate mid-game. On software WebGL (headless
  Chromium) the city rests about 3 s after it is built.
- The board's root element reports `data-ambient` (`measuring`, `live`, `eased`, `resting`, `still`),
  `data-ambient-fps` and `data-frames` (frames drawn) for tests and tooling.

### Placement rules (unit tested)

- Every landmark footprint, tree and lamp is off the board and its border; every model's
  triangles stay inside its declared footprint and height, and off the board.
- No landmark hides a cell from the 2.5D aerial camera or from the 3D overview at any screen
  shape, or the followed token wherever it is; the orbiting camera is pushed up out of any
  building (`sightlines.ts`: `segmentHitsBox`, `avoidObstacles`).
- Each district's landmarks lie in its seat's corner.
- Every route is a closed loop off the board; boats stay on the water and everything else on
  land; over a full lap no mover passes through any triangle of any model, a lamp or a tree;
  no two vehicles ever meet (rotated footprints, ten minutes simulated).

### The stage

On wide screens (at least 1024 × 541) in 2.5D or 3D, the Kolkata canvas is portalled into a
fixed full-window layer behind the game screen (`.board-stage-host`, z-index 0), so the city
fills the window around the panels. Both cameras still fit the board to its square slot and
then shift the view with `setViewOffset`, so the board sits exactly in its slot. The slot
lets pointer events through to the canvas; panels sit above it. On narrower screens the 3D
view draws the city inside the board's canvas, and 2.5D keeps the 2D Kolkata backdrop. Over
the live stage the header is solid rather than backdrop-blurred (a blur would be recomputed
for every city frame).

### Rendering

- Scenery uses Lambert shading (no specular term), the water and glass Standard; no scenery
  casts or receives shadow maps (only the board does, on High).
- The ground's layers are stored top-first so overlapping layers are rejected early; the sky
  is drawn last, where nothing covers it.
- Fog starts well beyond the board, so the board's colours never change.
- Everything is disposed on unmount and on quality changes (the canvas is rebuilt per quality).

## Human characters (Batch C.3A, prototype)

In Kolkata's 3D and 2.5D board, the Crimson team's four tokens are people (rigged GLB
characters on plinths in the seat colour) instead of pawns. Design, pipeline, licences and
limitations: [characters.md](../design/characters.md).

- `apps/client/src/components/board3d/characters/`: `catalog.ts` (which seats of which city
  have characters, the files, their scale), `brain.ts` (the presentation state machine: pure,
  tested), `CharacterBody.tsx` (loads a level of detail, tints the `team` material, plays clips
  through one mixer), `characters.json` (built by `tools/characters`).
- `Tokens3D.tsx` swaps the pawn for the character and follows each move's whole path by
  elapsed time (`pathMotion.ts`); the plinth is the pick target. `useBoardPlayback` paces seats
  with characters at walking speed (`CHARACTER_PACE`) and runs each plan on its own clock (see
  [motion.md](../design/motion.md)); the server, rules and move tray are unchanged.
- The token mirror carries `data-character`, `data-character-ready`, `-state`, `-clip`,
  `-team`, `-level` and `-clips` for tests and tooling.
- The 2D board, other cities and other seats keep the pawns; losing WebGL falls back to the
  2D board as before.
