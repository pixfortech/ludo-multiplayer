# poc-token-3d · v1

- **Purpose:** candidate 3D pawn mesh, compared with the procedural lathe token (token-design.md § 3D)
- **Model:** `meshy_v7_image_to_3d` · model_type `standard` · target_polycount `2000` · topology `triangle` · symmetry_mode `on` · should_remesh `true` · should_texture `false` · outputs 1
- **Input:** the approved `poc-token-family` concept, cropped to one pawn on a plain background (background removed)
- **Follow-up (if needed):** `meshy_v5_remesh` with `origin_at: bottom`, `resize_height`, `target_polycount 2000`
- **Status:** draft, not submitted; runs only after `poc-token-family` is approved

## Acceptance (from token-design.md)

Base Ø 0.80 and height 0.95 after uniform scaling; origin at base centre; ≤ 2,000 triangles; watertight, smooth normals with hard edges only at the base bevel and top facet; flat top facet usable for the symbol decal; no internal geometry. If it fails any item, the procedural lathe token is used.
