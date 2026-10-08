# Token design (2D and 3D)

One silhouette, one material family, 15 colour and symbol variants derived from the palette. No per-player bespoke designs.

## Silhouette

A **classic Ludo pawn**, refined: a wide stable base, a soft waist and a domed head with a flat top facet that carries the symbol.

- **Top-down (2D and 3D top view):** reads as a circle with a dark rim, light halo and centred symbol. That's what the 2D renderer draws.
- **Perspective (3D):** reads as a pawn, unmistakably "Ludo", with the symbol visible on the head.

## 2D token

Reference implementation: `token2dSvg()` in `packages/design-tokens/src/token2d.ts`, rendered for all identities and states in [generated/palette-sheet.svg](generated/palette-sheet.svg).

### Geometry (100-unit box)

| Layer (outside → in) | Radius | Fill |
| --- | --- | --- |
| State ring (when shown) | 48 | see states |
| Halo | 44 | `#FFFFFF` |
| Rim | 41 | identity `rim` |
| Body | 36 | radial gradient: `highlight` (0) → `body` (0.55) → `rim` (1), centre at 38% / 32% |
| Gloss | ellipse 17 × 9 at (41, 33) | white, 28% opacity |
| Symbol | 40-unit box, centred | identity `ink` |
| Contact shadow | ellipse 30 × 5.5 at y 91 | `#D8D0C2` |

### Size

- Rendered at **0.82 × cell size** on track cells; 0.72 × when stacked or finished.
- Minimum rendered diameter **18 px**, with the symbol at least 8 px. Below this (crowded 15-player boards on phones), the focus/zoom tools take over rather than shrinking further (see [responsive-layouts.md](responsive-layouts.md)).
- **Hit target:** at least 44 × 44 px regardless of the drawn size. Overlapping targets resolve to the token nearest the pointer, and stacked tokens open a picker.

### States

| State | When | Treatment |
| --- | --- | --- |
| idle | default | as above |
| movable | your turn, legal move | 3.5-unit ring in body colour; gentle 1.6 s breathing pulse (opacity .55 → .95) |
| selected | tapped, move pending | ink ring 4 + white inner ring 2; no pulse |
| unmovable | your turn, no legal move for this token | 60% opacity, no ring |
| protected | shield power (expanded modes only) | dashed rim-colour ring |
| captured | transient during capture animation | fades to 35% while travelling home |
| finished | in the centre | 72% scale, gold check badge, non-interactive |

Tokens of players who are not on turn keep full colour; the current player is shown by the turn banner and base glow, not by dimming others.

### Stacking

- 2 tokens on a cell: offset ±18% diagonally.
- 3–4 tokens: 2 × 2 cluster at 0.6 × size, with a count badge when 5 or more (expanded modes).
- Mixed colours on a safe cell: ordered by seat, never overlapping symbols.

## 3D token

### Geometry

A lathe (surface-of-revolution) mesh, built **procedurally** in Three.js or exported from Blender. The rotational profile is exact and tiny, so AI mesh generation is only a comparison candidate (see [higgsfield-production-plan.md](higgsfield-production-plan.md)).

| Property | Value |
| --- | --- |
| Units | 1 unit = 1 board cell |
| Base diameter | 0.80 |
| Height | 0.95 |
| Profile | base disc (h 0.16, 0.04 bevel) → concave waist (Ø 0.42 at h 0.40) → shoulder → dome head (Ø 0.56) with a flat top facet (Ø 0.30) |
| Origin / pivot | centre of the base, on the board plane (y = 0) |
| Up axis | +Y; front faces −Z (irrelevant for lathe, required for decals) |
| Triangles | LOD0 ≤ 2,000 · LOD1 ≤ 600 (64 / 24 radial segments) |
| Normals | smooth, with hard edges only at the base bevel and the top facet |
| UVs | one channel; the top facet is mapped planar for the symbol decal |
| Internal geometry | none; watertight, no duplicate vertices |

### Materials

| Quality | Material | Parameters |
| --- | --- | --- |
| High | `MeshPhysicalMaterial` | color = body (linear), roughness 0.22, clearcoat 1.0, clearcoatRoughness 0.08, IOR 1.5, sheen 0 |
| Medium | `MeshPhysicalMaterial` | as High, clearcoat 0.6 |
| Low | `MeshStandardMaterial` | roughness 0.3, metalness 0 |

- Base ring: a second material slot in the identity `rim` colour, matte (roughness 0.5). It gives the same outline cue as 2D.
- Symbol: an inlaid decal on the top facet in identity `ink` (alpha texture from `SYMBOL_PATHS`, 256 px atlas of 15 symbols).
- **One geometry, 15 material instances**, drawn with `InstancedMesh` per identity.
- No transmission or refraction. It's too costly on phones, and opaque resin reads better.

### 3D states

| State | Treatment |
| --- | --- |
| movable | ring decal on the board plane under the token in body colour + 5% emissive lift; same 1.6 s pulse |
| selected | token lifts 0.08 units + ink ring decal |
| unmovable | material opacity 0.6 (transparent pass) |
| captured | arcs back to base (see [motion.md](motion.md)) |
| finished | scaled 0.72, placed on the centre pyramid facet |

### Acceptance (for any mesh, including procedural)

Dimensions and pivot match the table; triangle count within budget; materials named `token_body` and `token_rim`; loads in `three` without warnings; reviewed in a turntable preview at 1×, 0.5× and top-down camera.
