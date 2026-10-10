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
| B | 2D city mode: themed backdrop, ground and districts around the board; responsive density | Next |
| C | 3D foundation: lazy-loaded scene from `sceneDescription3d`, camera intro and drift, 2D fallback | |
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

- **Procedural** (drawn in code today): the six city-card illustrations
  (`apps/client/src/components/city/CityPreviewArt.tsx`), original simple
  silhouettes in each city's palette.
- **Placeholder** (briefs only): every landmark and prop. Batch B/C stand in
  simple shapes; final art goes through the approved asset pipeline
  ([Higgsfield workflow](../design/higgsfield-integration.md)) only with
  explicit approval.
- **Hooks only**: audio cue ids exist; no audio ships.

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
