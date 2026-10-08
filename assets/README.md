# Visual and audio assets

Source tree for every generated or hand-made asset. Every file here must be registered in [`manifest.json`](manifest.json); `npm run test` fails on unregistered, missing or mis-sized files. The workflow is in [docs/design/higgsfield-integration.md](../docs/design/higgsfield-integration.md).

| Folder | Holds | Shipped to players? |
| --- | --- | --- |
| `source/` | Raw outputs as received, plus `prompts/` (versioned prompt files) | No |
| `concepts/` | Art-direction explorations awaiting review | No |
| `approved/` | Approved reference images (style anchors) | No |
| `previews/` | Review sheets, turntables, comparisons | No |
| `2d/{backgrounds,tokens,dice,textures,effects}` | Optimised 2D outputs (SVG, WebP, AVIF) | Approved files only |
| `3d/{tokens,dice,materials,environments}` | Optimised GLB and KTX2 | Approved files only |
| `audio/` | Optimised sound effects and ambience | Approved files only |

## Rules

- Name files `<id>.v<version>.<ext>`. Never overwrite an approved version; add `v<N+1>`.
- Generated art is decoration. Board geometry, cells and token positions come from `@ludo/board-layouts`.
- Never put credentials, tokens or account details in this folder or the manifest.
