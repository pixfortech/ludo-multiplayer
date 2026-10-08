# Higgsfield asset production plan

What gets generated, with which model, in what order, and why. Spending rules: [credit-approval-checklist.md](credit-approval-checklist.md). Tool access and verified models: [higgsfield-integration.md](higgsfield-integration.md).

## What is generated vs built

| Asset family | Source | Why |
| --- | --- | --- |
| Board geometry, cells, lanes, safe markers, bases | **Procedural** (`board-layouts` + renderers) | Must be exact and interactive |
| 2D tokens, symbols, dice faces, UI | **Procedural / vector** (`design-tokens`) | Crisp at every size, tiny, already specified |
| 3D token and die meshes | **Procedural lathe / Blender** first; Higgsfield 3D as a comparison candidate | Exact dimensions, pivot and polycount |
| Art-direction references (look of board, tokens, dice, rooms) | **Higgsfield image** | Fast exploration of materials and lighting |
| Board surface detail textures (subtle lacquer and ceramic micro-texture) | **Higgsfield image → tiled texture** | Material richness without busy patterns |
| Environment backdrops | **Higgsfield image** | Static, lightweight, art-directed |
| Sound effects and ambience | **Higgsfield audio** (`mirelo_text_to_audio`, `sonilo_music`), after the usage terms of "Game pipeline only" are confirmed | Bespoke, consistent audio identity |
| Marketing imagery | **Higgsfield image/video** | Not shipped in the app |

## Phased plan

| Stage | Assets | When |
| --- | --- | --- |
| **PoC (this proposal)** | board reference, token family, dice concept, tabletop environment, one 3D token candidate | after your spending approval |
| 2D polish | 1–2 board surface micro-textures, 2D background, UI illustration spots (empty states) | Phase 4 |
| Polygon boards | per-shape surface/frame texture variants only if procedural looks flat (likely not needed) | Phase 5 |
| 3D | final token and die materials, environment lighting reference, 4 environment backdrops | Phase 7 |
| Audio | dice roll, token hop, capture, home, six, victory, UI ticks (≈ 10 SFX) + 1 ambience loop | Phase 4 |
| Marketing | key art, store screenshots frames, short promo video | Phase 9 |

## Proposed proof-of-concept batch (NOT executed)

All prompts are in `assets/source/prompts/` (v1). Every output is a **concept** until you approve it.

| # | Asset id | Purpose | Model | Outputs | Format | Credits (estimate and basis) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `poc-board-classic` | Art-direction reference for the 4-player board: materials, lighting, palette harmony | `gpt_image_2_5` (variant flare, quality high, 2k) | 4 | 1:1, 2048² | 4 × 0.5–2.75 observed = **2–11**; high/2k may cost more → price probe |
| 2 | `poc-token-family` | One pawn silhouette in 4 colourways (crimson, royal blue, emerald, golden) on a neutral sweep, with symbols | `gpt_image_2_5` (flare, high, 2k) | 4 | 3:2 | **2–11** |
| 3 | `poc-dice` | Ivory resin die, pip detail, six with gold inlay; 3 views | `gpt_image_2_5` (flare, high, 2k) | 4 | 3:2 | **2–11** |
| 4 | `poc-environment-tabletop` | "Luxury tabletop" backdrop: board-sized empty felt and walnut surface, soft light | `gpt_image_2_5` (flare, high, 2k) | 4 | 16:9 | **2–11** |
| 5 | `poc-token-3d` | Candidate GLB from the **approved** token concept, compared with our procedural lathe token | `meshy_v7_image_to_3d` (standard, target_polycount 2000, triangle, symmetry on, should_texture false) | 1 | GLB | **unknown**: no observed price for any 3D model; cap applies |

- **Images:** 16 outputs, 8–44 credits on the observed price range. Price probe first: 1 image at the chosen settings, check the real cost, then continue only within the cap.
- **3D:** 1 job, run only after item 2 is approved; untextured because materials are applied in-engine from the palette.
- **Proposed cap for the whole PoC: 75 credits.** I stop and report if the projected total would exceed it.
- **Deliverables:**
  - the best 1–2 images per item committed as `concept` with full provenance;
  - the GLB committed as `concept` after inspection (dimensions, pivot, triangles, normals);
  - a review sheet in `assets/previews/` comparing it with the procedural token;
  - a written defect review per item.
- **Why generate:** items 1–4 explore material and lighting language faster than hand-modelling; item 5 tests whether AI meshes beat a procedural lathe for the pawn. My expectation is that procedural wins on precision and size, but the comparison is cheap and informative.

## Prompt conventions

- Lead with the subject and its function in the game, then materials, then palette with hex values, then framing and lighting, then an explicit **avoid** list.
- Always: top-down or three-quarter view as specified, neutral background, no text or logos, no hands or people, no busy patterns.
- Never ask for "a Ludo board" to be used as a layout. Board references are about look only; the layout is drawn by our code.
- Keep a version per prompt; edits create `v2`.

## Rights

Before committing any output, confirm the provider's commercial-use terms for each model used and that the output can be published in a **public** repository. Record the confirmation in the approval log.
