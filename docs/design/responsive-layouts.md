# Responsive layouts: shared principles

Each device class has its own purpose-built specification:

| Device | Spec | Reference viewports |
| --- | --- | --- |
| Desktop (≥ 1200 px wide) | [ui-desktop.md](ui-desktop.md) | 1920 × 1080, 1366 × 768 |
| Tablet (600–1199 px) | [ui-tablet.md](ui-tablet.md) | 1024 × 768, 768 × 1024 |
| Phone (< 600 px; landscape when height < 500) | [ui-mobile.md](ui-mobile.md) | 390 × 844, 360 × 800 |
| Crowded boards (any device, cells < 30 px) | [interaction-crowded-boards.md](interaction-crowded-boards.md) | — |

## Principles (all devices)

1. **The board is the centrepiece** and is always fully visible at overview zoom. It is sized as `side = min(available width, available height)` after the fixed bars; rectangles rotate to the screen's long axis.
2. **Primary controls never scroll or hide:** the die and roll button, the turn banner, the move tray and Fit sit outside the zoomable board layer.
3. **Selection never depends on cell size:** the move tray always offers every legal move as a ≥ 56 px target.
4. **Same screen and own device share one UI.** Same-screen adds stronger turn hand-off cues; own-device adds "You" emphasis and notifications.
5. **Renderer independence:** 2D and 3D share layout, controls and timing; switching changes only the board layer.
6. **No horizontal page scroll** at any width ≥ 320 px.

## Modes every layout supports

| Mode | Notes |
| --- | --- |
| Same-screen multiplayer | clear current-player cues; table mode on tablets |
| Own-device online multiplayer | personal controls; server-authoritative sync |
| Persistent rooms and resume | "Game resumed: it's {Name}'s turn" banner after a restore or reopen |
| 2D / 3D | 3D lazy-loads; 2D stays fully playable if 3D fails |
| Fullscreen | Fullscreen API button on every device that supports it |
| Light / dark | the board surface stays light in both |

## Verification

Layouts are verified with real browser screenshots at the reference viewports for 2-, 4-, 6- and 15-player boards in Phase 4 (2D) and Phase 7 (3D). A viewport is reported as verified only when a screenshot exists.
