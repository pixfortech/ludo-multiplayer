# Kolkata 3D proof of concept: plan and asset-production proposal

**Status: proposal, awaiting approval.** No 3D code, no models and no paid generation exist yet. Nothing in this plan runs a Higgsfield job; any generation below is a candidate that needs its own approved batch proposal with a preflighted cost ([higgsfield-integration.md](higgsfield-integration.md)).

The goal is a **genuine, interactive** Kolkata scene in the browser: a real game played on a 3D board on the Hooghly promenade, with a Tabletop View and an Explore View, driven by the live server, not a rendered still. The specification it implements is [3d-readiness.md](../architecture/3d-readiness.md).

## What the proof of concept must show

1. A real game (2–4 players, live server) played start to finish in Tabletop View, in sync with every other player's 2D or 3D view.
2. The Howrah Bridge, the river, the laterite promenade with tram rails, gas lamps and a tram, lit for golden hour, around a board that stays fully readable.
3. Real 3D dice that land on the server's value.
4. An Explore View in which the current player's token is a person who walks exactly the cells of each move, with walk, stop, capture and home animations, and an instant return to Tabletop.
5. Automatic 2D fallback (no WebGL, lost context, phone) with no loss of play.
6. Measurements: bundle size, first-frame time, frame time in headless Chromium, and **real-device runs** on hardware you choose before any frame-rate claim.

## Milestones

| # | Milestone | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| C1 | 3D foundation | Lazy `Renderer3D` chunk, view switcher (2D / Tabletop), `cellToWorld` in `@ludo/board-layouts`, procedural board, instanced lathe tokens, procedural die with face-keyed tumbles, camera rig (overview, top-down, intro, drift), picking, scene mirror for tests, 2D fallback | Full-game browser tests pass in Tabletop View; `cellToWorld` tests; WebGL-off and context-loss tests fall back to 2D; 3D chunk within budget |
| C2 | Kolkata environment | Golden-hour lighting and sky from `kolkata-golden-riverside`, water shader, laterite ground with rails, procedural Howrah Bridge (shared chord function), far skyline cards from the 2D art, instanced lamps and railing, a tram on a spline, quality presets | Board readability checks (pitch ≥ 50°, no landmark between camera and board); draw calls and sizes within the Medium budget; screenshots at desktop, laptop and tablet sizes |
| C3 | Explore View | Walker figure with idle, walk, stop, capture, home and victory clips; path follower from `hopSteps`; follow camera; instant return (`T`, Escape, button); reduced-motion glide | Walk length equals the die value for every move fixture; camera input sends no gameplay frames; in sync through a full game in Explore View |
| C4 | Device QA and polish | Auto quality, tuning, accessibility pass, performance report | Measured on your chosen devices; results recorded in performance-budgets.md |

C1 needs no binary assets at all. C2 and C3 can start fully procedural (bridge, ground, water, lamps, a simple original low-poly walker built from primitives with a code-driven walk cycle), so **the proof of concept does not depend on any paid generation**. Modelled and generated assets then replace the procedural stand-ins as they are approved.

## Asset-production proposal (Kolkata)

Budgets follow performance-budgets.md. "Approval" lists what you approve before work starts.

| Asset | Method | Budget | Approval |
| --- | --- | --- | --- |
| Board, tokens, die, tray, plinth | Procedural | ≤ 6k tris total, no textures beyond the decal atlas | None (code) |
| Laterite paving, brass tram rails, cast-iron railing, kolam-free promenade | Procedural geometry + one tileable laterite texture | Texture 1024² KTX2 ≤ 250 KB | Texture source: hand-made, or a Higgsfield candidate (batch proposal) |
| Hooghly water | Shader + one tileable normal map | Normal map 512² ≤ 120 KB | None if procedural noise is used |
| Sky and far riverbank | Gradient sky shader; far skyline as flat cards extruded from the Batch B SVG silhouettes | ≤ 300 draw-free tris, no textures | None (reuses approved original art) |
| Howrah Bridge | Procedural truss from the 2D chord function; optional Blender refinement (rivets, deck detail) | ≤ 12k tris, one 1024² KTX2 atlas | Blender refinement only if the procedural version falls short in review |
| Victoria Memorial (distant) | Blender low-poly or impostor card | ≤ 3k tris or one 512² card | Blender work |
| Riverside temples (ghats) | Blender low-poly | ≤ 3k tris | Blender work |
| Tram (two cars) and yellow taxi | Blender low-poly | ≤ 2k tris each, shared 512² atlas | Blender work |
| Ferry | Blender low-poly | ≤ 1.5k tris | Blender work |
| Gas lamps, book stall, tea stall | Procedural lamp (lathe); stalls in Blender, or Higgsfield image→3D candidates cleaned to budget | ≤ 1k tris each | Batch proposal if generated |
| Walker character (one rig, seat-tinted outfits) | Blender: original stylised figure, rig and clips (idle, walk, stop, capture, home, victory) | ≤ 6k tris LOD0, ≤ 2k LOD1; clips ≤ 200 KB total | Character design sheet approval first (hand-drawn or a Higgsfield concept batch) |
| Golden-hour lighting | Small prefiltered environment map | ≤ 256² per face, ≤ 400 KB | None |

### Candidate Higgsfield batch (not submitted)

If you want generated candidates, this is the batch I would propose. Costs are **not** estimated here: each item is preflighted (no charge) and the totals shown to you before any job runs.

| Item | Use | Output | Notes |
| --- | --- | --- | --- |
| Walker concept sheet (front, side, back) | Reference for the Blender model | 1 image, 2k | Stylised, original, no likeness of real people |
| Tileable laterite paving texture | Ground material | 1 image, 1k, seamless | Then KTX2; tested for tiling seams |
| Book stall and tea stall image→3D | Street furniture candidates | 2 GLB | Must pass the 3D acceptance checklist; remeshed to budget or rejected |

### Approvals needed to start

1. Approve this plan (milestones C1–C4) and that the proof of concept starts fully procedural.
2. Choose the real devices for C4 measurements.
3. Separately, and only if wanted: approve the candidate Higgsfield batch after seeing preflighted costs.
