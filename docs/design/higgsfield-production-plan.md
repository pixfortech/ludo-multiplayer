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
| **PoC (this proposal)** | 2 board concepts, 2 token/material concepts (11 credits) | after your final authorisation |
| PoC follow-up | dice, environment, one 3D token candidate (costs verified before asking) | after concepts are approved |
| 2D polish | 1–2 board surface micro-textures, 2D background, UI illustration spots (empty states) | Phase 4 |
| Polygon boards | per-shape surface/frame texture variants only if procedural looks flat (likely not needed) | Phase 5 |
| 3D | final token and die materials, environment lighting reference, 4 environment backdrops | Phase 7 |
| Audio | dice roll, token hop, capture, home, six, victory, UI ticks (≈ 10 SFX) + 1 ambience loop | Phase 4 |
| Marketing | key art, store screenshots frames, short promo video | Phase 9 |

## Proof-of-concept batch request (awaiting final authorisation; NOT executed)

| # | Asset id | Purpose | Model and settings | Outputs | Verified cost |
| --- | --- | --- | --- | --- | --- |
| 1 | `poc-board-flat` | Board concept A: flat printed, stepped tonal bases | `gpt_image_2_5`, flare, high, 2k, 1:1 | 1 | 2.75 |
| 2 | `poc-board-tabletop` | Board concept B: physical tabletop with frosted resin pawns | `gpt_image_2_5`, flare, high, 2k, 3:2 | 1 | 2.75 |
| 3 | `poc-token-frosted` | Token/material A: classic pawn, frosted resin, 4 colourways | `gpt_image_2_5`, flare, high, 2k, 3:2 | 1 | 2.75 |
| 4 | `poc-token-pebble` | Token/material B: low pebble token, matte pastel with gloss inlay | `gpt_image_2_5`, flare, high, 2k, 3:2 | 1 | 2.75 |
| | | | | **4** | **11.00 of the 15-credit cap** |

**Pre-run verification (2026-10-08)**

| Check | Result |
| --- | --- |
| Workspace | `0154ad81…3c32`: the only workspace on the account; private, owner role, Max plan; **selected** |
| Balance | 861.75 credits, unchanged by this phase (preflights cost nothing) |
| Cost per job | **Verified** with the tool's `get_cost` preflight: low/1k 0.25 · medium/1k 0.5 · medium/2k 1.0 · high/1k 1.5 · high/2k 2.75. Aspect ratio does not change the price. A `count: 2` preflight also returned 2.75, so whether it multiplies by count is unclear. Every asset is therefore submitted as its own single-image job, priced individually. |
| Output format | **Not stated** by the model metadata (the model accepts a `background: transparent` option, which implies PNG/WebP). The actual file type is recorded in the manifest on download. The repo stores optimised WebP/AVIF via LFS. |
| Commercial use | **Not verified from the primary terms**: `higgsfield.ai` is unreachable from this cloud container (DNS blocked). Search results show Higgsfield's help center stating users own outputs and may use them commercially (Terms §4.4), with watermark-free downloads on paid plans. A third-party newsletter reads Higgsfield's retained licence (service operation and model training) more broadly. **You need to confirm** the current Terms of Use §4 before outputs are committed. |
| Public visibility | Per the help center, generations stay private unless you post them (community, contests). Whether result URLs are unauthenticated links is unverified. **Committing an output to this repository makes it public**, because the repo is public. |

**Execution rules once authorised**

1. Run item 1 first, then read the actual charge from `transactions`.
2. Continue only if each charge is ≤ 2.75 and the running total stays ≤ 15.
3. No retries without a new approval.
4. Afterwards, report job ids, actual credits, and a defect review per image.
5. Nothing is committed until you approve the images and the terms.

**Deferred to later batches (separate approval and verified cost):**

- dice concept (`poc-dice`) and tabletop environment (`poc-environment-tabletop`);
- 3D token comparison (`poc-token-3d`), only after a token concept is approved;
- no complete 3D board will be generated.

## Prompt conventions

- Lead with the subject and its function in the game, then materials, then palette with hex values, then framing and lighting, then an explicit **avoid** list.
- Always: top-down or three-quarter view as specified, neutral background, no text or logos, no hands or people, no busy patterns.
- Never ask for "a Ludo board" to be used as a layout. Board references are about look only; the layout is drawn by our code.
- Keep a version per prompt; edits create `v2`.

## Rights

Before committing any output, confirm the provider's commercial-use terms for each model used and that the output can be published in a **public** repository. Record the confirmation in the approval log.
