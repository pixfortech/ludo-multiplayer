# Visual bible

**Direction: Contemporary Playful × Luxury Tabletop.** A crisp, modern board you would want on a real table: clean geometry and confident colour from the playful direction, with tactile resin pieces, an ivory-resin die and soft, controlled light from the luxury direction.

## Principles

1. **Readable first.** Every cell, token and turn state is legible at a glance on a 360 px phone. Beauty never costs clarity.
2. **Geometry is crisp and calm.** Flat, precise board surfaces. Materials and depth live in the pieces, not in a busy board.
3. **Pieces feel tactile.** Tokens and dice look like polished resin you could pick up: soft gloss, gentle depth, a defined edge.
4. **Colour carries identity, never alone.** Every seat has a colour **and** a symbol, in every view and every renderer.
5. **Motion explains the rules.** Animation shows what the server decided (roll, move, capture, home) in a clear order, then gets out of the way.
6. **One system, two renderers.** 2D and 3D share layout data, colours, symbols and motion timings. Switching renderer changes depth, not meaning.

## Avoid

- Cartoon outlines, faces or mascots on pieces; childish rounded fonts.
- Dark, moody scenes that make the board murky. The board surface stays light in every theme.
- Bloom, lens flares, chromatic aberration, heavy depth of field.
- Patterned or textured cell surfaces that compete with tokens.
- Photoreal wood grain or marble that reduces contrast.
- More than one accent effect at a time on screen.

## Materials

| Element | 2D treatment | 3D material (PBR) |
| --- | --- | --- |
| Board surface (cells) | Flat `#F7F4EE` porcelain, 1 px `#D8D0C2` separators, 5 px corner radius | Matte lacquered ceramic. Roughness 0.55, metalness 0, very faint micro-normal. |
| Board body and frame | Flat `#ECE6DC`, 18 px outer radius | Satin lacquer, roughness 0.45; bevelled 0.15-cell edge |
| Bases | Seat body colour with an ivory inner panel; 4 slot rings | Inset tray, seat colour satin (roughness 0.4), ivory well |
| Home lanes and start cells | Lane tint / body colour (from palette) | Same colours, satin; never glossy (keeps tokens dominant) |
| Tokens | Radial resin gradient, dark rim, light halo, gloss ellipse, symbol | Polished resin: clearcoat 1.0, roughness 0.22, IOR 1.5 |
| Dice | Ivory rounded square, ink pips | Ivory resin, roughness 0.3, clearcoat 0.6, pips recessed |
| Centre finish | Four flat triangles in seat colours | Shallow pyramid, satin |

## Lighting (3D) and depth (2D)

- **Key:** soft area light from upper-left (10 o'clock, about 45° elevation), neutral 5200 K.
- **Fill:** sky/ground hemisphere at 35%; no coloured rim lights.
- **Reflections:** a small, low-contrast studio environment map (1 soft box). No mirror reflections on the board.
- **Shadows:** soft contact shadows under tokens and dice. Board-wide shadow maps only on high quality.
- **2D depth:** a single contact-shadow ellipse per token, and one subtle panel shadow (0 8 24 rgba(20,24,33,.12)). Nothing else.

## Typography

| Use | Face | Weight | Notes |
| --- | --- | --- | --- |
| Wordmark and display headings | **Outfit** (OFL) | 600–700 | Geometric, friendly, not childish |
| UI, labels, body | **Inter** (OFL) | 400–600 | Tabular figures for counters, timers and room codes |
| Room codes | Inter | 600 | Letter-spaced 0.08 em; ambiguous characters excluded at generation |

The scale and minimum sizes are in `TYPE` (`ui.ts`). No text below 12 px, and interactive labels are at least 14 px. Fonts are self-hosted subsets (Latin) and loaded with `font-display: swap`.

## Colour

- **Player identities:** 15 seats, exact values and measured accessibility in [color-identities.md](color-identities.md).
- **UI themes:** light and dark tokens in `THEMES` (`ui.ts`). Dark uses deep slate `#161A23`, never pure black. The **board keeps its light surfaces in both themes**, so token contrast is identical everywhere.
- **Accent:** royal blue is the UI accent. Seat colours are reserved for player identity and are never used as decoration.

## Iconography

- 24 px grid, 2 px strokes, rounded joins, filled variants for active state.
- Reserved glyphs: 5-point star = safe cell, arrow = direction or start, crown = winner. These are never player symbols.

## Environments

The environment is a backdrop around the board, never under the cells. All four share the same board materials.

| Environment | Description | Use |
| --- | --- | --- |
| **Clean studio** (default) | Soft warm-grey seamless backdrop, gentle vignette | Default for 2D and 3D, light theme |
| **Luxury tabletop** | Board resting on a dark walnut or felt table edge, out-of-focus room | 3D showcase, marketing |
| **Night arena** | Deep slate surround with a soft spotlight pool on the board; the board stays bright | Dark theme, 3D |
| **Minimal light** | Flat `#F3F0EA`, no vignette | Low-power mode, reduced motion, accessibility |

Backgrounds are static textures (≤ 300 KB) or simple geometry. Video backgrounds are not used during gameplay.

## 2D ↔ 3D consistency rules

1. Both renderers read the same `@ludo/board-layouts` coordinates. 3D places meshes on the board plane at `(col, row)` × cell size.
2. Colours come only from `PLAYER_IDENTITIES` and `BOARD_SURFACES`. 3D converts sRGB to linear for materials; it never re-tints.
3. Symbols use the same path data (`SYMBOL_PATHS`), as SVG in 2D and as a decal or extruded inlay on the token head in 3D.
4. Token states (movable, selected, unmovable…) map 1:1. 2D uses rings and opacity; 3D uses a ring decal on the board plus emissive lift.
5. Motion timings come from `MOTION`. A move takes the same time in both renderers, so switching mid-game is seamless.
6. The renderer is a view setting. Switching never touches game state, the socket or the animation queue's authoritative target.
