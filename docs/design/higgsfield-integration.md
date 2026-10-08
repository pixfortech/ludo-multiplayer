# Higgsfield integration

Higgsfield is the project's **visual asset pipeline**. It is not part of the game engine, renderers or build.

| Higgsfield produces | Always programmatic, never generated |
| --- | --- |
| Concept and art-direction references | Board geometry for every shape (2–15) |
| Surface artwork and material textures | Track cells, safe cells, start/home-entry cells, home lanes |
| Backgrounds and environment references | Token coordinates and movement paths |
| Icon and symbol concepts | Rules, dice values, turn logic, sync |
| Candidate 3D meshes (GLB), accepted only after inspection | Hit targets and layout |
| Sound effects and ambience | Base token shapes in the 2D renderer (SVG) |
| Marketing imagery | |

**An image is not a board. A render is not a model.** A generated file is recorded by what it actually is: a raster concept stays a raster concept until a real SVG or GLB exists and passes review.

## Status (verified 2026-10-08)

| Item | Status |
| --- | --- |
| Official Higgsfield **MCP server** | Connected and authenticated in the Claude Code cloud session |
| Account | Paid plan with credits available; one private workspace (exact balance not recorded in the repo) |
| Workspace selection | Verified as the account's only workspace (private, owner role, Max plan) and **selected** on 2026-10-08, as approved |
| **CLI** (`@higgsfield/cli` 1.1.26 on npm) | Not installed in the cloud container (see below) |
| **Skills** (`higgsfield-ai/skills`) | Not installed in the cloud container |
| Credit cost per job | **Verifiable before submitting** via the image tool's `get_cost` preflight (no job, no charge). `gpt_image_2_5` flare: low/1k 0.25 · medium/1k 0.5 · medium/2k 1.0 · high/1k 1.5 · high/2k 2.75. 3D and audio prices are not checked yet and will be preflighted before any such batch. |
| Jobs submitted | **None.** No generation has been run. |
| Terms of use | Primary text not reachable from the cloud container (DNS blocked for `higgsfield.ai`); see the status in [higgsfield-production-plan.md](higgsfield-production-plan.md#proof-of-concept-batch-request-awaiting-final-authorisation-not-executed) |

The cloud container is ephemeral and `higgsfield auth login` is an interactive, user-authorised step, so the CLI is not installed there. The MCP connection provides the same generation access for cloud sessions.

### Local setup (your machine, optional)

```powershell
npm i -g @higgsfield/cli
higgsfield auth login          # interactive; completes in your browser
npx skills add higgsfield-ai/skills
```

- Never paste passwords or tokens into chat, code, `.env` files committed to git, or the manifest.
- `.gitignore` excludes `.env*` and `.higgsfield/`. Keep CLI credentials in the CLI's own user-level store.
- The `higgsfield-websites` skill's game-art references may be consulted for art direction. Its project-generation workflow must **not** be used: the app is this React/TypeScript/Node monorepo.

## Models verified available (via MCP `models_explore`)

Only ids returned by the live model list are recorded here. Re-check before each batch; availability changes.

| Use | Model ids | Notes |
| --- | --- | --- |
| Art-direction stills, concepts | `nano_banana_pro`, `gpt_image_2_5`, `flux_3_image`, `seedream_v5_pro`, `cinematic_studio_2_5` | Up to 2K or 4K depending on model |
| Icons, symbols, flat brand marks | `recraft_v4_1` (`model_type: vector` or `utility_vector`, explicit `colors` palette) | Whether the file delivered is a true SVG is **unverified**. Treat the output as raster until a real SVG is inspected. |
| Environments and backgrounds | `soul_location`, `nano_banana_2`, `seedream_v4_5` | |
| Image → 3D (GLB) | `meshy_v7_image_to_3d` (`model_type: lowpoly`, `target_polycount`, `topology: quad`), `tripo_h3_1_image_to_3d`, `tripo_h3_1_multiview_to_3d`, `hunyuan3d_v3_image_to_3d` (`generate_type: LowPoly`), `sam_3_3d` | |
| Text → 3D (GLB) | `meshy_v6_text_to_3d`, `tripo_3d`, `hunyuan3d_v3_1_text_to_3d` | |
| 3D post-processing | `meshy_v5_remesh` (`origin_at: bottom`, `resize_height`, `target_polycount`), `meshy_v5_retexture` | |
| Sound effects | `mirelo_text_to_audio` (duration in seconds) | Described as "Game pipeline only"; confirm what that means for usage before relying on it |
| Music and ambience | `sonilo_music` | Same "Game pipeline only" note |

## Workflow

```
proposal ──approval──▶ generate ──▶ assets/concepts|source/<id>.v<N>.<ext>
                                     │  manifest entry: status "concept"
                                     ▼
                     review (defects, licence, fit) ──▶ "rejected"
                                     │
                                     ▼
              optimise ──▶ assets/2d|3d|audio/<id>.v<N>.<ext>   status "candidate"
                                     │
                         your approval, logged in asset-approval-log.md
                                     ▼
                              status "approved" ──▶ served to the game
```

1. **Batch proposal.** Before any paid job, post a request with: asset names and purposes, model per asset, number of outputs, dimensions or 3D format, credit estimate (only from real pricing data), why generation beats procedural geometry, and expected deliverables.
2. **Explicit approval.** No job runs without it. Bulk generation needs its own separate approval.
3. **Record every output.** Add a manifest entry with full provenance: model id, versioned prompt file under `assets/source/prompts/`, generation time and job id. Unrecorded files fail the test suite.
4. **Never overwrite.** File names carry `.v<N>.`; a revision is a new version that `supersedes` the old entry.
5. **Approve deliberately.** `approved` requires an optimised file, its real size, and `license.commercialUseConfirmed: true`, which only a person sets after checking the terms.

## 3D acceptance checklist

A generated mesh becomes a `candidate` only after inspection confirms:

- correct silhouette at small sizes;
- scale in metres, consistent across variants;
- origin at the base centre;
- clean normals and no internal or duplicate geometry;
- triangle count within budget (set in Phase 0.5);
- PBR materials named consistently;
- texture resolution within budget.

Where Blender or procedural geometry gives a cleaner result (for example lathe-turned tokens or dice), use that instead and record `generation.source` accordingly.

## Runtime contract

- `@ludo/assets` validates the manifest and resolves assets by **slot** (for example `token.3d.model`). Only `approved` entries resolve. Everything else returns `null`, and the renderer draws its procedural fallback.
- The game is fully playable with an empty manifest. No build, test or runtime step contacts Higgsfield.
- Approved, optimised files are copied into the client by a controlled build step, added in Phase 3. Concepts and raw sources are never shipped.

## Open decisions

| # | Decision | Proposal |
| --- | --- | --- |
| H1 | Storage for binary assets | **Resolved:** Git LFS configured for `assets/**` binaries (see [asset-pipeline.md](asset-pipeline.md)) |
| H2 | Target Higgsfield workspace | **Resolved:** private workspace verified and selected |
| H3 | Commercial-use terms per model | Open. You confirm per batch; recorded in the approval log. The repo is public, so this also covers public distribution. |
