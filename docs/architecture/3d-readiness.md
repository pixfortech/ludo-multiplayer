# 3D technical readiness specification

**Status: specification (Batch B).** Nothing in this document is implemented yet. It defines what the 3D city experience must do, how it is built, and how it is proven, so the next milestone (a genuine interactive Kolkata proof of concept, [kolkata-3d-poc.md](../design/kolkata-3d-poc.md)) starts from agreed contracts.

## Principles

1. **3D is another view of the same game.** The server decides every roll and move; the 3D renderer shows the state the server committed, animated toward it, exactly like the 2D board. It never computes legality, never moves a token on its own, and never sends anything 2D cannot send.
2. **One source of truth for positions.** Cell coordinates come from `@ludo/board-layouts` (the frozen classic layout). 2D and 3D convert the same cells; neither has a movement map of its own.
3. **One playback.** `useBoardPlayback` (typed motions, home counts, flashes, celebration) drives both renderers. The 3D view consumes its output; it does not re-derive animation from game state.
4. **2D is always there.** 3D is lazy-loaded and optional. No WebGL, a lost context, a phone, low memory or a user setting means 2D, with no loss of function.
5. **Readability beats spectacle.** Valid moves, the path, safe cells, bases and home lanes stay obvious. Scenery never covers the board in Tabletop View.

## A. Tabletop View

| Requirement | Specification |
| --- | --- |
| Interactive 3D board | Board mesh built procedurally from the layout: one tile per cell (instanced), the four bases, home lanes and the centre, using the same colours as 2D (`PLAYER_IDENTITIES`, `boardMaterial2d`). Safe cells carry the same star as an inlaid decal. |
| Elevated camera | The city's `cameras.overview` pose (pitch 56–70°, never below `MIN_OVERVIEW_PITCH` = 50°), framed so the whole board fits with a margin at every aspect ratio. A one-key top-down camera (`cameras.topDown`). Intro sweep (`cameras.intro`) skipped under reduced motion. Idle drift ±2° yaw, ±1° pitch, off under reduced motion. |
| All tokens visible | Tokens are raised pawns (token-design.md § 3D) placed by the same stacking rules as 2D (`placeTokens`). A test renders every stack case and checks each token's screen-space footprint is visible from the overview camera (no full occlusion). |
| Real 3D dice | A rounded-box die (dice-design.md § 3D) in a felt tray beside the board. The server's value arrives first; the client plays a pre-authored tumble that ends on that face. No physics decides anything. |
| Premium materials | `MeshPhysicalMaterial` resin tokens, ivory die with clearcoat, city board material (`boardMaterial.cell`: laterite, sandstone, granite, terrazzo), plinth finish matching 2D. |
| City landmarks around the board | Placed on a ring outside the board footprint (radius ≥ 1.35 board widths) and behind the camera's far half, so they never sit between the camera and a cell. |
| Precise token-to-cell coordinates | `cellToWorld(cell)` (below), shared and tested against the 2D `cellCentre`. Token placement error budget: 0 (exact cell centres; stacks use the same offsets as 2D, in cell units). |
| Interaction | Raycast picking on token meshes plus invisible hit cylinders (≥ 44 px on screen); movable tokens are exactly the server's legal moves, with the same move tray and keyboard as 2D. |

### Shared board coordinates

```ts
// @ludo/board-layouts (new, pure): one board cell = 1 world unit, board centred at the origin, +Y up.
export function cellToWorld(cell: Cell): { x: number; z: number } {
  return { x: cell.col - (CLASSIC_GRID - 1) / 2, z: cell.row - (CLASSIC_GRID - 1) / 2 };
}
```

- Row grows toward the camera (+Z), column to the right (+X), so the 3D board reads exactly like 2D from above: seat 0 (crimson) top left, 1 top right, 2 bottom right, 3 bottom left.
- Base slots use `classicBaseSlots` in the same units.
- Test: for every track, lane, finish and base cell, `cellToWorld` equals the 2D `cellCentre` mapped through `(p - PAD - CELL·7.5) / CELL`. The two renderers can never disagree about where a cell is.

## B. Explore View

A third-person, street-level view in which each player's tokens are people walking the board's paths through the city.

| Requirement | Specification |
| --- | --- |
| Third-person camera | A follow camera behind and above the active walker (distance 3.5 cells, height 2.2, pitch 25°). A critically damped spring follows position and heading (no overshoot); obstacles fade instead of pushing the camera. |
| Human figures as tokens | One rigged character per seat, tinted in the seat colour (outfit) with the seat symbol on a sash; a ring under the feet in the seat colour keeps identity readable. Inactive tokens stand at their cells (or in their base courtyard). |
| Walks along approved cells | A walk is a sequence of cell centres from `hopSteps(from, to)` (the 2D function), so a walk is exactly the cells the server's move passed through, in order, and ends on the server's cell. |
| Movement equals the dice result | The walk starts only when playback starts the authoritative move. Its length is `to − from` steps (or one step from base onto the start cell), which is the die value the server reported. A test asserts walk length = die value for every legal-move fixture. |
| Animations | `idle`, `walk` (one cycle per cell, 380 ms), `stop` (settle), `capture` (the captured figure is knocked back and runs home along an arc to its base), `home` (a short celebration at the centre), `victory`. Crossfades of 150 ms; no root motion (position comes from the path). Reduced motion: no walk cycle, the figure glides cell to cell. |
| Camera follows smoothly | The camera's target is the walking figure; when no one moves, it eases to the current player's figure. |
| Instant return | `T` or the "Tabletop" button switches back in one frame (no transition), and Escape always returns. The choice is per player and local. |

### Invariants (tests enforce these)

- The Explore View has **no free movement**. The only inputs are camera orbit/zoom (bounded) and the same Roll and Move controls as every other view, which send the same `game:roll` / `game:move` requests. A browser test drives the camera with mouse, touch and keys and asserts no gameplay frame is sent.
- A figure's cell is always the playback's cell for that token. A browser test compares, after every action, the 3D scene's token cells (exposed through a hidden accessible list, as 2D exposes `data-step`) with the server's committed state, the same way `expectInSync` does for 2D.
- Switching views never changes game state, timers or whose turn it is.

## C. Technical architecture

```
apps/client/src/three/                  (lazy chunk: import() only when 3D is chosen)
  Renderer3D.tsx        <Canvas> host, error boundary → 2D fallback, context-loss handling
  scene/BoardMesh.tsx    instanced tiles, bases, lanes, centre (from the layout)
  scene/Tokens.tsx       InstancedMesh per identity (Tabletop), Walker per token (Explore)
  scene/Die3D.tsx        rounded-box die, tumble library keyed by face
  camera/CameraRig.ts    tabletop / top-down / explore modes, springs, bounds, intro
  characters/Walker.tsx  GLB + AnimationMixer, path follower, state machine
  environment/CityEnvironment.tsx  per-city loader (manifest slots → GLB/KTX2), procedural fallback
  quality/Quality.ts     presets, DPR cap, auto-drop, device classes
  a11y/SceneMirror.tsx   hidden DOM list of tokens and cells (screen readers, tests)
```

| Concern | Decision |
| --- | --- |
| Rendering | three.js with React Three Fiber; only the drei helpers actually used (no barrel imports). Exact versions are pinned when the milestone starts (each at least two weeks old) and recorded here. |
| Loading | `React.lazy` chunk for the renderer; environment assets streamed per city after the board is interactive. The 2D board stays mounted underneath until the 3D scene reports its first frame. |
| Assets | GLB (glTF 2.0) with meshopt geometry and KTX2 (Basis) textures; decoders self-hosted (no CDN at runtime). Resolved by slot through `@ludo/assets`; only `approved` entries load, otherwise the procedural fallback draws. |
| Character animation | One shared humanoid rig and clip set for all seats (tinted materials), `AnimationMixer` per visible figure, clips shared across instances; off-screen figures stop updating. |
| Camera controller | A small custom rig (springs and bounds), not free OrbitControls, so the gameplay rules (pitch floor, board always framed in Tabletop) are enforced in one place. |
| Environment by city | `getEnvironmentPreset(city)` drives light, sky, fog and density; `sceneDescription3d(theme, device)` (already implemented and tested in `@ludo/city-themes`) decides which landmarks and props load for a device class. |
| Quality presets | Low / Medium / High from [performance-budgets.md](../design/performance-budgets.md#rendering-budgets): DPR cap 1 / 1.5 / 2, draw calls ≤ 60 / 120 / 200, shadows (baked blobs / 1024² / 2048²). Start Medium; drop a level if frame time stays above 22 ms for 2 s; never raise mid-game. |
| Performance-aware rendering | Instancing for tiles, tokens, railings and lamps; LOD for landmarks (LOD0 near, impostor card far); frustum culling; on-demand rendering when nothing moves (`frameloop="demand"` in Tabletop); baked lighting for static scenery; no post-processing beyond FXAA/SMAA. |
| 2D fallback | Automatic when WebGL2 is missing, the context is lost twice, the device class is phone, or the first frame does not arrive within 4 s; manual from the view switcher at any time. |
| Budgets | 3D chunk ≤ 650 KB gz; first 3D load ≤ 3 MB (performance-budgets.md); per city environment ≤ 4 MB streamed after first interaction. |

### Testing strategy

- **Unit:** `cellToWorld` against 2D geometry; walk sequences against `hopSteps` and every legal-move fixture; camera rig keeps pitch ≥ 50° in Tabletop and the board inside the frustum for aspect ratios 0.45–2.4.
- **Browser (Playwright, WebGL via SwiftShader):** the 3D view stays in sync through full games (as `full-games.spec.ts`); Explore camera input never sends gameplay frames; view switching mid-move; WebGL disabled → 2D; context loss → 2D.
- **Visual:** screenshots of Tabletop and Explore at desktop, laptop and tablet sizes for review (not pixel-diffed).
- **Performance:** frame time and main-thread measurements in headless Chromium for regressions, plus **real-device runs before any frame-rate claim** (a 2021 mid-range Android phone, an iPad, a laptop with integrated graphics).

## D. Asset requirements

How each 3D asset should be made. "Procedural" means generated in code at runtime or by a build script; it needs no binary asset.

| Asset | Method | Why |
| --- | --- | --- |
| Board tiles, bases, lanes, centre, star decals | Procedural | Exact geometry from the layout; colours are data. |
| Tokens (pawns) | Procedural lathe (token-design.md) | Exact profile, tiny, one geometry for all identities. |
| Die and tray | Procedural (rounded box, indented pips) | Exact, small; tumbles are authored keyframes. |
| Board plinth | Procedural (bevelled slab) + city texture | Matches the 2D plinth finish. |
| Ground, paving, tram rails, railings, kolam | Procedural geometry + tileable textures | Instancing; textures are small and repeatable. |
| Water and sky | Shaders (gradient sky, normal-mapped water) | No asset; follows the environment preset. |
| Far skyline | Procedural extrusion of the Batch B SVG silhouettes into flat cards | Reuses approved original artwork; cheap; consistent with 2D. |
| Howrah Bridge | Procedural truss from the same chord function as the 2D art, refined in Blender if needed | The truss is parametric; code gives exact, light geometry. |
| India Gate, gopuram, Gateway of India, Vidhana Soudha, Qutub Minar | Blender (low-poly, baked AO) | Architectural detail and silhouette need a modeller; budgets ≤ 8k tris each, one 1024² KTX2 atlas. |
| Supporting landmarks (Victoria Memorial, lighthouse, Red Fort gate, glass house, art deco row) | Blender, simpler (≤ 3k tris) or impostor cards | Seen at distance. |
| Vehicles (tram, taxi, ferry, auto, local train, catamaran) | Blender low-poly (≤ 2k tris) | Recognisable shapes; animated along splines. |
| Street furniture (lamps, stalls, palms, rain trees) | Blender or Higgsfield image→3D candidates, then cleaned | Many variants; candidates must pass the 3D acceptance checklist. |
| Characters (walkers) and animation clips | Blender: one original rig and clip set; optional licensed clip library only with confirmed commercial terms | Must be original and consistent across seats. |
| Tileable textures (laterite, sandstone, granite, terrazzo, slate) | Higgsfield image generation as candidates (with approval), or hand-made, then KTX2 | Texture variety is where generation helps most. |
| Sky/backdrop panoramas | Built from the approved Batch B illustrations; optional painted panoramas from Higgsfield with approval | Keeps the 2D and 3D cities consistent. |
| Concept and reference sheets (characters, landmark turnarounds) | Higgsfield with approval, or hand-drawn | References for modelling only; never shipped as geometry. |

Rules carried over from [higgsfield-integration.md](../design/higgsfield-integration.md): no paid job without an approved batch proposal and preflighted cost; every output recorded in the manifest with provenance; an image is not a model; nothing third-party; the game is fully playable with an empty manifest.

## Open decisions

| # | Decision | Proposal |
| --- | --- | --- |
| D1 | Explore View on tablets | Enabled on tablets with Medium quality; phones stay 2D until measured on devices. |
| D2 | Walker look | Stylised, friendly, non-photoreal figures; tinted outfits in seat colours; no likeness of real people. |
| D3 | Clip source | Original Blender clips first; a licensed library only after its commercial terms are confirmed and logged. |
| D4 | Who sees Explore View | Each player chooses their own view; a room setting can come later. |
