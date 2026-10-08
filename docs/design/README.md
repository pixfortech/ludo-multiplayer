# Design system — index

Phase 0.5 deliverables. The approved direction is **Contemporary Playful (B) with Luxury Tabletop materials (A)**. Where a value exists in code, the code is the source of truth and these documents link to it.

| # | Deliverable | Document | Source of truth in code |
| --- | --- | --- | --- |
| 1 | Premium visual design bible | [visual-bible.md](visual-bible.md) | `packages/design-tokens/src/ui.ts` |
| 2 | 15-player colour palette with accessibility checks | [color-identities.md](color-identities.md) · [generated report](generated/palette-report.md) · [swatch sheet](generated/palette-sheet.svg) | `packages/design-tokens/src/palette.ts` |
| 3 | 2D token specification | [token-design.md § 2D](token-design.md#2d-token) | `packages/design-tokens/src/token2d.ts` |
| 4 | 3D token specification | [token-design.md § 3D](token-design.md#3d-token) | — (Phase 7) |
| 5 | Premium dice specification | [dice-design.md](dice-design.md) | — |
| 6 | Classic square board specification | [board-classic.md](board-classic.md) · [diagrams](generated/) | `packages/board-layouts/src/classicSquareLayout.ts` |
| 7 | Polygon board geometry guidelines (2–15) | [board-polygon.md](board-polygon.md) | — (Phase 5) |
| 8 | UI component styling | [ui-components.md](ui-components.md) | `packages/design-tokens/src/ui.ts` |
| 9 | Animation and motion | [motion.md](motion.md) | `MOTION` in `ui.ts` |
| 10 | Responsive desktop/tablet/mobile requirements | [responsive-layouts.md](responsive-layouts.md) | — |
| 11 | Higgsfield prompts and asset production plan | [higgsfield-production-plan.md](higgsfield-production-plan.md) · [prompts](../../assets/source/prompts/) | — |
| 12 | Asset optimisation and performance budgets | [performance-budgets.md](performance-budgets.md) | — |
| 13 | Approved-asset manifest workflow | [asset-pipeline.md](asset-pipeline.md) | `packages/assets` |
| 14 | Cost/credit approval checklist | [credit-approval-checklist.md](credit-approval-checklist.md) | — |

Also: [higgsfield-integration.md](higgsfield-integration.md) (tool access and verified models) and [asset-approval-log.md](asset-approval-log.md).

Regenerate the measured and diagram artifacts with `npm run design:generate`; `npm run test` fails if they are stale.
