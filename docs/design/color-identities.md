# Player colour identities (15 seats)

**Source of truth:** `packages/design-tokens/src/palette.ts`. **Measured report:** [generated/palette-report.md](generated/palette-report.md). **Visual check:** [generated/palette-sheet.svg](generated/palette-sheet.svg) shows every token on the board, on its own lane, and under protanopia, deuteranopia and tritanopia simulation.

## The palette

| Seat | Identity | Symbol | Body | Ink |
| --- | --- | --- | --- | --- |
| 1 | Crimson | heart | `#C8102E` | white |
| 2 | Royal Blue | drop | `#1F5FD6` | white |
| 3 | Emerald | leaf | `#16B060` | ink |
| 4 | Golden Yellow | bolt | `#F5BE00` | ink |
| 5 | Graphite & Gold | bars | `#3B4150` | gold `#E3B341` |
| 6 | Mint | chevron | `#86E3C6` | ink |
| 7 | Vivid Orange | triangle | `#F26419` | ink |
| 8 | Turquoise | circle | `#0E8C84` | ink |
| 9 | Indigo | hexagon | `#2E2A85` | white |
| 10 | Rose | cross | `#F47FA4` | ink |
| 11 | Cyan | diamond | `#1EB8E6` | ink |
| 12 | Magenta | flower | `#C8239A` | white |
| 13 | Amber | square | `#A86A12` | white |
| 14 | Royal Purple | crescent | `#7B3FD1` | white |
| 15 | Lime | plus | `#9ACD32` | ink |

Ink is `#FFFFFF` or `#141821`, whichever contrasts more with the body. Each identity also derives:

- **Rim:** a darker shade capped at L\* 28. It outlines the token and is ≥ 3:1 on every surface.
- **Highlight:** a gloss tint.
- **Lane:** a 30% blend of the body toward the cell colour, used for home lanes and base fills.

All exact derived values are in the generated report.

## Seat order

Seats 1–4 are the traditional red, blue, green, yellow. Seats 5–15 are ordered **greedily for colour-blind distinctness**: each next seat is the identity that keeps the default N-player set as far apart as possible across normal vision and all three colour-vision deficiencies. Under the suggested order, a 5-player game paired Royal Blue with Royal Purple, which are nearly identical for deuteranopes (ΔE 1.5). The reordered sets keep every 2–7 player default ≥ ΔE 12 for every vision type.

Players can still pick any free colour in the lobby; "Auto colour" assigns the next seat in this order.

## Accessibility contract (enforced by tests)

| Check | Threshold | Status |
| --- | --- | --- |
| All 15 body colours, normal vision | min ΔE₀₀ ≥ 15 | 15.8 ✅ |
| Classic 4, every vision type | min ΔE₀₀ ≥ 12 | 13.7 ✅ |
| Default 2–7 player sets, every vision type | min ΔE₀₀ ≥ 12 | ✅ |
| Default 8–11 player sets, every vision type | min ΔE₀₀ ≥ 8.5 | ✅ |
| Body vs board cell | ΔE₀₀ ≥ 20 | min 24 (Mint) ✅ |
| Token outline on **every** surface (cells, base, all 15 lanes and start colours) | ≥ 3:1 (WCAG 1.4.11) | min 3.1:1 ✅ |
| Symbol ink vs body | ≥ 3:1 | min 4.3:1 ✅ |
| Unique symbol per seat; star, arrow and crown reserved | — | ✅ |

**Honest limits.** With 12 or more seats, some pairs inevitably collide for colour-blind players (for example Golden and Lime under protanopia). Identity then rests on the symbol, which is why:

- every token carries its symbol at all sizes ≥ 10 px;
- player chips always show symbol + name, never a colour dot alone;
- the turn banner names the player and shows their symbol;
- an optional **"symbols on board"** setting adds the symbol to base and lane-entry cells.

## Rules for use

- Seat colours represent players only, never decoration or status.
- Do not place a token on a background other than the defined board surfaces without re-running the outline contrast check.
- 3D uses the same hex values (converted to linear). Material changes (gloss, clearcoat) must not shift perceived hue.
- Any palette change is made in `palette.ts`, regenerated with `npm run design:generate`, and must keep the test suite green.
