# Asset pipeline: storage, versioning and the approved-asset manifest workflow

Deliverable 13 of Phase 0.5. It complements [higgsfield-integration.md](higgsfield-integration.md), which covers tool access, and [credit-approval-checklist.md](credit-approval-checklist.md), which covers spending.

## Storage

| Content | Where | Storage |
| --- | --- | --- |
| Code-generated geometry (board layouts, cells, lanes) | `packages/board-layouts` | Git (it is code) |
| Procedural 2D graphics (tokens, symbols, dice pips, safe markers) | `packages/design-tokens` and the client | Git |
| SVG artwork, prompts, manifest, docs | `assets/**/*.svg`, `assets/source/prompts/`, `assets/manifest.json` | Git (text) |
| GLB/glTF, FBX, OBJ, USDZ, Blender files | `assets/**` | **Git LFS** |
| PNG, JPEG, WebP, AVIF, KTX2, EXR, HDR, TIFF, PSD | `assets/**` | **Git LFS** |
| WAV, OGG, MP3, FLAC, MP4, WebM, MOV | `assets/**` | **Git LFS** |

The rules live in `/.gitattributes` and are scoped to `assets/**`.

### Verified facts (2026-10-08)

- `pixfortech/ludo-multiplayer` is **public**. Every committed asset, prompt and manifest entry is publicly visible. Only commit assets whose licence permits public distribution, and never commit account details.
- `git-lfs` is **not installed** in the Claude Code cloud container. Attributes still resolve, because they are native git, so tracking is configured. LFS objects cannot be pushed from that environment until `git-lfs` is installed there (for example via a session setup script).
- The GitHub LFS storage and bandwidth quota for this account cannot be read through the API available to this session. Check it under GitHub **Settings → Billing and plans → Git LFS** before the first large upload.

### Local setup for Git LFS (required before committing binary assets)

```bash
# macOS: brew install git-lfs · Windows: included with Git for Windows · Debian/Ubuntu: sudo apt install git-lfs
git lfs install          # once per machine; installs the LFS git hooks
git lfs env              # verify
git lfs pull             # after cloning, fetch binary assets
```

Without `git-lfs`, a clone contains small pointer files instead of images and models (the game still builds and runs, because every asset has a procedural fallback), and committing a binary fails the test suite. For Claude Code cloud sessions, add `apt-get install -y git-lfs && git lfs install` to the environment's setup script before any session commits binaries.

### Guards (enforced by `npm run test`)

- Every file under `assets/` must be registered in the manifest. Draft prompts in `assets/source/prompts/` are exempt.
- Referenced files must exist, and approved files must match their recorded size.
- No file over **20 MB** (hard cap; category budgets in [performance-budgets.md](performance-budgets.md) are far tighter).
- Any LFS-tracked file staged as a raw blob fails the build. This catches commits from machines without `git-lfs`.
- `.glb`, `.ktx2` and `.ogg` resolve to LFS; `.svg` stays in Git.

### What is never committed

- Raw generations that were not selected. Higgsfield retains them; the approval log records their job ids.
- Temporary renders, screenshots for discussion, upscaling intermediates.
- Source files above the cap. Keep them outside the repo and record their location in the manifest `notes`.
- Credentials of any kind (`.env*`, `.higgsfield/` and `*.credentials.json` are ignored).

## Versioning

- File name: `<asset-id>.v<version>.<ext>`, for example `token-3d-classic.v2.glb`. The validator rejects names without the matching version.
- A change is a **new version**. The new entry sets `supersedes`, and the old entry becomes `superseded`. Approved files are never edited in place.
- Prompts are versioned the same way (`<asset-id>.v<N>.md`), and each manifest entry's `promptRef` points at the exact prompt used.

## Manifest workflow

| Step | Who | Manifest status | Files |
| --- | --- | --- | --- |
| 1. Draft prompt | Claude | (none) | `assets/source/prompts/<id>.v1.md` |
| 2. Batch proposal using the [checklist](credit-approval-checklist.md) | Claude | (none) | — |
| 3. **Spending approval** | You | (none) | logged in `asset-approval-log.md` |
| 4. Generate | Claude via MCP | `concept` | selected outputs only, to `assets/concepts/` (raster) or `assets/source/` (meshes) |
| 5. Review against spec: defects, licence, readability | Claude | `concept` or `rejected` | review sheet in `assets/previews/` |
| 6. Optimise (SVG clean-up, WebP/AVIF/KTX2, GLB remesh/compress) | Claude | `candidate` | `assets/2d/…`, `assets/3d/…`, `assets/audio/…` |
| 7. **Asset approval and commercial-use confirmation** | You | `approved` | logged |
| 8. Ship | Build step (Phase 3) | — | copies `approved` optimised files only |

The game resolves assets by **slot** through `@ludo/assets`. Anything not `approved` resolves to `null`, and the renderer draws its procedural fallback. The game is complete without a single generated asset.

## Slot naming

`<area>.<renderer>.<thing>[.<variant>]`, for example `token.3d.body`, `dice.3d.model`, `board.2d.surface`, `environment.3d.tabletop`, `audio.sfx.dice-roll`.
