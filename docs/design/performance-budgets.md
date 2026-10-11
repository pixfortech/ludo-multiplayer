# Asset optimisation and performance budgets

**Status: provisional.** These are the targets assets and code are built against. They are confirmed or revised with real measurements in Phase 4 (2D) and Phase 7 (3D), and both the targets and the measurements are recorded here.

## Targets

- 60 fps during play on capable devices; at least 30 fps sustained on mid-range phones (reference: a 2021 mid-range Android).
- Interaction latency (tap → visual response) ≤ 100 ms.
- 2D is fully playable without loading any 3D code or asset.

## Load budgets (compressed transfer size)

| Bundle | Budget |
| --- | --- |
| Initial app JS (lobby + 2D game) | ≤ 250 KB gz |
| CSS | ≤ 40 KB gz |
| Fonts (Inter + Outfit, Latin subsets, woff2) | ≤ 120 KB |
| 3D chunk (three + R3F + renderer code), lazy | ≤ 650 KB gz |
| 3D assets, first 3D load (token, dice, board textures, environment) | ≤ 3 MB |
| Audio (all SFX) | ≤ 400 KB; ambience loop ≤ 600 KB, loaded on demand |
| Time to interactive (lobby), mid-range phone on 4G | ≤ 3 s |

Only the identities present in a room are prepared (materials and decals). Nothing is loaded per player beyond palette values.

## Per-asset budgets

| Asset | Format | Budget |
| --- | --- | --- |
| Token mesh (shared by all 15 identities) | GLB, meshopt-compressed | ≤ 2,000 tris LOD0 / 600 LOD1; ≤ 60 KB |
| Symbol decal atlas (15 symbols) | KTX2 (UASTC) or PNG fallback | 512 × 512, ≤ 120 KB |
| Die | GLB | ≤ 3,000 tris; ≤ 80 KB; normal map ≤ 512² |
| Board surface (per shape; detail only, colours stay procedural) | KTX2 | ≤ 2048², ≤ 1.2 MB; 1024² on low quality |
| Environment backdrop | KTX2 or AVIF | ≤ 2048 × 1024, ≤ 300 KB |
| Environment lighting | small HDR or prefiltered cubemap | ≤ 256² per face, ≤ 400 KB |
| 2D background (optional) | AVIF/WebP | ≤ 300 KB at 2560 px; WebP fallback |
| Marketing images | not shipped in the app | — |
| SFX | OGG Opus (AAC fallback) | ≤ 40 KB each, ≤ 1.5 s |

## Rendering budgets

| | Low | Medium | High |
| --- | --- | --- | --- |
| Device pixel ratio cap | 1.0 | 1.5 | 2.0 |
| Draw calls | ≤ 60 | ≤ 120 | ≤ 200 |
| Shadows | baked contact blobs only | one 1024² directional shadow map, board-only receivers | 2048² + soft PCF |
| Reflections | none (matte) | prefiltered env map | env map + clearcoat |
| Post-processing | none | FXAA | SMAA; no bloom, no DOF |
| Token material | Standard | Physical, clearcoat .6 | Physical, clearcoat 1 |
| Anti-aliasing | none | FXAA | MSAA 4× or SMAA |

- **Auto quality:** start at medium; drop a level if frame time stays > 22 ms for 2 s; never raise automatically mid-game.
- Instancing: one `InstancedMesh` per identity for tokens (≤ 15 draw calls for 60 tokens).
- 2D: SVG node count ≤ 2,500 for a 15-player board; tokens are composited layers moved by `transform`.

## Optimisation pipeline (Phase 4/7)

- **SVG:** SVGO, preset-default minus `removeViewBox`, IDs prefixed per asset; path data hand-checked for symbols.
- **Raster:** sharp → AVIF + WebP; KTX2 via `toktx` (UASTC for normal maps, ETC1S for colour) for 3D.
- **GLB:** `gltf-transform` with dedup, prune, weld, `meshopt` compression, texture resize, and KTX2 encode; validated with the Khronos glTF validator.
- **Audio:** ffmpeg → OGG Opus 96 kbps mono for SFX, loudness-normalised to −16 LUFS.
- Sizes are recorded in the manifest (`fileSizeBytes`, `mesh.triangles`, `textureResolution`), and the asset test suite fails on mismatch.

## Measurement plan

Lighthouse (mobile profile) for load; a scripted 4-player and 15-player auto-play in Playwright for frame-time traces at 1920×1080 and 390×844, plus Chrome's CPU 4× throttle as the "mid-range" proxy. Results go into this document with date and commit.

## Measurements

### City themes, 2D (Batch B, 2026-10-10)

Headless Chromium on the CI-class Linux container, laptop viewport (1366 × 768), a live two-player game, from `e2e/tests/city-performance.spec.ts`. Headless Chromium rasterises and composites **in software**, so these are relative comparisons on one machine, not device frame rates. No real-device measurement has been made yet.

| | Classic | Kolkata | Delhi | Chennai | Mumbai | Bengaluru |
| --- | --- | --- | --- | --- | --- | --- |
| Main thread busy while idle (ambient motion on) | 4.4% | 8.5% | 6.7% | 8.3% | 9.2% | 6.9% |
| Style + layout while idle, per 4 s | 19 ms | 53 ms | 32 ms | 42 ms | 54 ms | 50 ms |
| Frames in 4 s idle, motion on (software compositing) | 138 | 103 | 113 | 121 | 119 | 107 |
| Frames in 4 s idle, reduced motion (static scenery) | 240 | 242 | 242 | 242 | 242 | 242 |
| Worst frame during a token move, motion on | 100 ms | 83 ms | 83 ms | 67 ms | 83 ms | 83 ms |
| DOM elements | 1,105 | 1,621 | 1,403 | 1,492 | 1,744 | 1,615 |
| Scene ready after game start | — | 517 ms | 565 ms | 534 ms | 501 ms | 764 ms |

Reading: the static scenery costs nothing measurable (frame pacing identical to classic with motion off); the main thread stays nearly idle with motion on; with motion on, software compositing in headless Chromium produces 75–88% of classic's idle frames (classic itself runs at ~35 fps there because of its own idle animations). GPU compositing on real devices is expected to absorb this, but that must be measured before it is claimed.

Bundle (production build, gzip): main JS 147.2 → 149.2 KB (+2.0 KB), CSS 10.9 → 12.6 KB (+1.7 KB); each city's artwork is a separate chunk loaded only in that city (2.7–3.4 KB) plus a shared 2.4 KB scene kit.

### The 2.5D board (Batch C.1, 2026-10-10)

Headless Chromium, WebGL in software (SwiftShader, on the CPU), laptop viewport 1366 × 768, a live two-player game, from `e2e/tests/board3d-performance.spec.ts`. These compare views on one machine; they are not device frame rates, and no GPU device has been measured yet.

| | 2D | 2.5D Low | 2.5D Medium | 3D preview Medium |
| --- | --- | --- | --- | --- |
| First drawn board after a reload | 211 ms | 1,224 ms | 1,640 ms | 1,805 ms |
| Main thread busy while idle | 4.4% | 4.0% | 3.8% | 3.9% |
| Main thread busy during a token move | 10.2% | 51.3% | 74.0% | 57.5% |
| Worst frame during a move | 67 ms | 117 ms | 217 ms | 200 ms |
| Tap to move request leaving the page | 0.5 ms | 1.0 ms | 1.6 ms | 1.0 ms |
| GPU geometries / textures | — | 24 / 8 | 24 / 8 | 24 / 8 |
| Draw calls / triangles per frame | — | 55 / 29k | 55 / 35k | 55 / 35k |
| JS heap | 10.0 MB | 13.5 MB | 13.5 MB | 16.9 MB |

Bundle (gzip): the main bundle is 151.2 KB (+2.0 KB for the view switch and controls); the 3D renderer chunk is 258.6 KB (three.js, React Three Fiber and the board), downloaded only when a 3D view is shown; the 2D board never loads it.

Reading: at rest the 3D board costs nothing (on-demand rendering); taps reach the server request in about a millisecond; during movement, software rendering is expensive, which is what the automatic quality steps and the 2D fallback are for. Measured on the way: Medium uses contact shadows instead of a shadow-map pass (worst frame 333 → 217 ms), and small pieces use fewer segments (58k → 35k triangles).


### The living Kolkata environment (Batch C.2, 2026-10-11)

Same machine and method as C.1 (headless Chromium, software WebGL, laptop viewport 1366 × 768, a live two-player game, `e2e/tests/board3d-performance.spec.ts`). Kolkata is drawn on the stage (the window-sized canvas). These compare builds and views on one machine; they are not device frame rates. No GPU device has been measured, so no frame rate on real hardware is claimed.

| | 2D | 2.5D Low | 2.5D Medium | 3D Medium | Kolkata 2.5D Low | Kolkata 2.5D Medium | Kolkata 3D Medium |
| --- | --- | --- | --- | --- | --- | --- | --- |
| First drawn board after a reload | 183 ms | 1,782 ms | 1,601 ms | 1,304 ms | 1,235 ms | 1,569 ms | 1,515 ms |
| Main thread busy while idle (the city settled about 3 s after loading) | 4.2% | 4.0% | 3.8% | 3.5% | 4.5% | 4.2% | 4.2% |
| Ambient state once settled (this renderer) | — | — | — | — | resting | resting | resting |
| Frames drawn in 1.5 s while a token moves | 66 | 52 | 44 | 43 | 35 | 39 | 35 |
| Worst frame during a move | 50 ms | 100 ms | 183 ms | 133 ms | 283 ms | 350 ms | 300 ms |
| Main thread busy during a move | 6.9% | 47.6% | 64.5% | 56.6% | 82.1% | 91.8% | 95.8% |
| Tap to move request leaving the page | 0.6 ms | 0.9 ms | 1.1 ms | 1.0 ms | 1.0 ms | 1.3 ms | 0.9 ms |
| GPU geometries / textures | — | 25 / 8 | 25 / 8 | 25 / 8 | 51 / 8 | 51 / 8 | 50 / 8 |
| Draw calls / triangles per frame | — | 42 / 29k | 42 / 35k | 42 / 35k | 67 / 47k | 67 / 62k | 67 / 61k |
| JS heap | 7.3 MB | 12.3 MB | 13.5 MB | 14.0 MB | 16.5 MB | 11.2 MB | 13.2 MB |

While the city is live (its first seconds, while the governor measures), this renderer's idle main thread was 25–112% busy across runs. That is what the governor exists to stop. The city's frames cost about 22–34 ms of main-thread work each here.

Bundle: the Kolkata scene is its own chunk, 32.6 KB (12.4 KB gzip), loaded only in a Kolkata room with a 3D view; other cities and the 2D board never fetch it. The 3D renderer chunk is unchanged at about 262 KB gzip.

Bottlenecks found and what was done (Kolkata 2.5D Low, before → after):

- **A blurred header over a live canvas.** The sticky header's `backdrop-filter` re-blurred the city behind it on every ambient frame. Over the stage the header is now solid.
- **Fill rate.** The scenery switched from Standard to Lambert shading. The ground's overlapping layers are drawn top-first, so lower layers are rejected early. The sky is drawn last, so it is skipped wherever the city covers it, which is everywhere in the aerial view.
- **Ambient frames the device cannot afford.** The governor counts the frames delivered in a 2 s window after a 1 s warm-up. It lowers the rate, or rests the city, when frames would take more than a third of the device's time. On software WebGL it rests about 3 s after loading.
- **Results:**
  - frames during a move: 10 → 33–48 per 1.5 s (across runs);
  - worst frame: 300 → 200–283 ms;
  - idle main thread once settled: 120% → about 4.5%;
  - tap to request: about 1 ms throughout.
- **Shadows.** Scenery never casts or receives shadow maps.

Budgets for the environment (per quality):

| | Low | Medium | High |
| --- | --- | --- | --- |
| Static scenery triangles (tested) | ≈ 9.7k | ≈ 15.3k | ≈ 17.8k (< 60k) |
| Taxis / trams / ferries / people | 2 / 1 / 1 / 4 | 5 / 2 / 2 / 12 | 8 / 3 / 3 / 22 |
| Ambient frames a second (cap; halved while tokens move) | 12 | 20 | 30 |
| Stage pixel ratio cap | 1.0 | 1.25 | 1.5 |
| Tree sway | off | on | on |
| Scenery draw calls | ≈ 25 (one per landmark or district, one per instanced kind) | same | same |
