# City themes

A city theme dresses the one classic board as a district of an Indian city:
Kolkata, Delhi, Chennai, Mumbai or Bengaluru (and "classic", the original
plain table). Themes are **presentation only**. The rules, the engine, the
board topology (cells, path, safe cells, bases, home lanes), networking and
persistence are the same for every city, and the engine never sees a theme.

The visual direction comes from the Kolkata concept image (a riverside
promenade at golden hour, the board laid into the paving, colour corners as
districts, the Howrah Bridge on the horizon). It is a reference, not a spec to
copy: HUD elements in it (quest list, minimap, key hints) are planned for later
batches and only where they help play.

## Batches

| Batch | Scope | Status |
| ----- | ----- | ------ |
| A | Architecture, data model, city picker, persistence in room state, placeholder configs | ✅ |
| B | 2D city environments for all five cities; board materials; responsive density; 3D readiness spec and Kolkata proof-of-concept plan | ✅ |
| C | Interactive Kolkata 3D proof of concept: Tabletop and Explore views ([3d-readiness.md](3d-readiness.md), [plan](../design/kolkata-3d-poc.md)) | Proposed |
| D | Emotions, captions and dialogue, city reactions, mute and volume settings | |
| E | Performance, responsive and accessibility QA, settings, polish | |

## Where the theme lives

- `CityThemeId` (`packages/shared-types/src/settings.ts`) is one of
  `classic | kolkata | delhi | chennai | mumbai | bengaluru`.
- `RoomSettings.cityTheme` stores it with the room (the `rooms.settings` JSONB
  column, so no migration). `room:create` accepts an optional `cityTheme`; the
  server validates it (`parseCityTheme`, error `invalid-settings` with
  `field: "cityTheme"`) and defaults to `classic`.
- Rooms created before themes existed have no `cityTheme`; the server
  normalises them to `classic` whenever it builds a room view or preview
  (`normaliseSettings`), so old rooms keep working.
- `RoomView.settings.cityTheme` and `RoomPreview.cityTheme` carry it to every
  client, so every player in a room loads the same city, including after a
  refresh or resume. The preview exposes only the theme id (nothing sensitive).
- The protocol change is additive (one optional request field, one new view
  field), so `PROTOCOL_VERSION` is unchanged.

Not yet: changing the city after creation (the room service supports a
settings patch, but no socket event exposes it), and a local/offline game setup
(the app has none yet).

## `@ludo/city-themes`

Pure data and pure functions; no React, no DOM, no WebGL.

| File | Contents |
| ---- | -------- |
| `cityThemeTypes.ts` | `CityTheme` and its parts: palette, four districts (one per seat), landmarks, props, ground pattern, signage voice, reactions, audio hooks |
| `cityThemes.ts` | The six themes |
| `cityDialoguePacks.ts` | Caption lines per game moment (two or more each) |
| `cityEmotionPacks.ts` | Ten emotion states: icon id, motion, label, city flavour |
| `cityEnvironmentPresets.ts` | Light, sky, atmosphere, board material, cameras, density per device class |
| `cityAssetManifest.ts` | Every asset with its city and status |
| `cityThemeRegistry.ts` | `getCityTheme` (unknown ids fall back to classic), `listCityThemes`, `CITY_ORDER`, pack and preset getters, `dialogueFor` |
| `themeRenderer2d.ts` | `themeCssVariables`, `sceneLayers2d` (layers to draw around the board, by device) |
| `themeRenderer3d.ts` | `sceneDescription3d` (the scene as data), `supports3d` |

### Readability rules, enforced by tests

- Board cells stay light (relative luminance > 0.8), and player colours never
  change, so the path, safe cells and tokens read the same in every city.
- UI accents meet WCAG AA (accent text ≥ 4.5:1, ink on surface ≥ 7:1).
- The 3D overview camera never looks flatter than 50° (`MIN_OVERVIEW_PITCH`),
  so no token hides a cell; there is always a top-down camera.
- Reduced motion removes the camera intro, the idle drift and particles.
- Dressing thins by device: full on desktop, reduced on tablets, minimal on
  phones (sky, ground and the hero landmark only). Phones play in 2D.
- The board and tokens are always drawn above every scene layer.

## Assets

Nothing is third-party, and nothing is generated without approval.

- **Procedural** (original artwork drawn in code): the six city cards
  (`CityPreviewArt`), and in Batch B every landmark and prop the 2D scenes
  show (`apps/client/src/components/city/scenes/`).
- **Planned** (not drawn, so never shown): a few props listed in the theme
  data for later (Kolkata tea stall, Delhi metro and arches, Chennai coffee
  stall and bell, Mumbai terminus and puddles, Bengaluru metro and cycles).
  The asset manifest and a client test keep this honest: every "procedural"
  asset is in its city's scene, and no "planned" one is.
- **Hooks only**: audio cue ids exist; no audio ships.
- 3D models are specified in [3d-readiness.md](3d-readiness.md) § D.

## Dialogue

Lines are captions first (voice is a later, optional hook), always muteable,
and never carry information a player needs to play. City packs mix English with
romanised Bengali, Hindi, Tamil and Kannada. They are **draft copy and need a
native speaker's review** before release (`reviewStatus:
"draft-needs-native-review"`). The tone is warm and playful, never mocking.

## Client

- `CityPicker`: a radio group of city cards on the create page (arrow keys move
  between cities, Tab leaves). The default is classic.
- `CityBadge`: the room's city in the lobby and on the join preview; it shows
  nothing for classic, so classic rooms look exactly as before.
- The lobby's settings list names the city.

## Batch B: 2D city environments

The game screen sets the city around the board. The board, rules, player
colours, tokens and dice are unchanged in every city (tokens and dice are
deliberately identical everywhere, so nobody relearns the pieces).

| City | Hero | Around it | Ground and board | Ambient motion |
| ---- | ---- | --------- | ---------------- | -------------- |
| Kolkata | Howrah Bridge (truss computed from its chord, with a far truss plane for depth) | Riverbank skyline with Victoria Memorial's dome and colonial facades, riverside temples, the Hooghly | Laterite promenade, brass tram rails, cast-iron railing, gas lamps, book stall; teak plinth | Tram, yellow taxi, ferry, river glints, dust motes, clouds |
| Delhi | India Gate | Qutub Minar, Red Fort gate, Jama Masjid and a far dome; dusk sky | Red sandstone avenue with buff bands and lawns, canopy pavilion, avenue lamps; sandstone plinth | Kites, auto-rickshaw, clouds |
| Chennai | Temple gopuram (seven painted tiers) | Marina lighthouse, cathedral spire, Indo-Saracenic court, palms; the Bay of Bengal with surf | Sand laid with kolam, coconut palms, beached fishing boat; granite plinth | Catamaran, gulls, swaying palms, sea glints, clouds |
| Mumbai | Gateway of India | Art deco facades, a skyline with lit windows, the Sea Link, the Queen's Necklace; the Arabian Sea | Wet promenade, tetrapods, street lamps; art deco plinth with a brass line | Local train, black-and-yellow taxi, monsoon drizzle, sea glints |
| Bengaluru | Vidhana Soudha | Glass house, tech towers with LED strips; garden-city canopy | Cubbon Park lawn and granite walkway, rain tree, pink trumpet tree, café kiosk, lit bollards; slate plinth | Falling blossoms, swaying trees, clouds |

How it is built:

- **The backdrop** (`CityBackdrop`) is one fixed layer behind the page
  (`z-index: -1`, `pointer-events: none`, `aria-hidden`), so scenery can never
  cover the board or a control, take a click, or be read out. Each city's
  artwork is its own lazily loaded chunk (≈3 KB gz).
- **Placement** (`city.css`): a horizon line sets where landmarks stand. On
  desktops and laptops the city stands in the open space to the left of the
  board under the players (the hero is sized to fit between the panels and the
  horizon); on portrait screens the landmark crowns the board behind the
  header; phones in landscape keep only the skyline behind the header.
- **Density** follows the environment presets: desktop full (all landmarks,
  props, travellers, particles), tablet reduced (no travellers or particles),
  phone minimal (sky, hero, ground). Reduced motion stops all ambient motion
  and hides travellers and particles.
- **Board materials** (`boardMaterial2d`): only neutral surfaces change (board
  body, track cells, outlines, safe stars) plus a plinth in the city's finish.
  Tests prove lanes, start cells and safe stars stay at least as distinct as on
  the classic table, and that the classic table is byte-for-byte unchanged.
- **Frame**: a city signboard (wordmark, name in its script, tagline, the
  city's motif) on desktop and tablet; a city chip on phones; each seat's
  district name in the players panel; city-tinted, slightly translucent panels
  (tall panels stay solid).
- **Performance**: ambient motion is transform-only on composited HTML layers,
  stepped where slow, and all moving pieces paint after the static scenery.
  Measurements are in [performance-budgets.md](../design/performance-budgets.md#measurements).

Verified in real browsers (`e2e/tests/city-environments.spec.ts`): every city
at desktop, laptop, tablet landscape and portrait, and phone portrait and
landscape, with the right city, scenery only in the backdrop layer, nothing
covering the board or the die, the whole board on screen and no sideways
scrolling; and the city surviving joining, a refresh and a network drop with
play in sync.
