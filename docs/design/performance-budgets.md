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
