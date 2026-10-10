import { contrastRatio, luminance } from "@ludo/design-tokens";
import { CITY_THEME_IDS } from "@ludo/shared-types";
import { describe, expect, it } from "vitest";
import {
  CITY_DIALOGUE_PACKS,
  CITY_EMOTION_PACKS,
  CITY_ENVIRONMENT_PRESETS,
  CITY_ORDER,
  CITY_THEMES,
  EMOTION_STATES,
  GAME_MOMENTS,
  MIN_OVERVIEW_PITCH,
  assetCounts,
  cityAssetManifest,
  dialogueFor,
  getCityTheme,
  getEnvironmentPreset,
  listCityThemes,
  sceneDescription3d,
  sceneLayers2d,
  supports3d,
  themeCssVariables,
} from "../index.js";

const themes = Object.values(CITY_THEMES);
const cities = themes.filter((t) => t.id !== "classic");

describe("city theme registry", () => {
  it("has exactly one theme per shared id, keyed by its own id", () => {
    expect(Object.keys(CITY_THEMES).sort()).toEqual([...CITY_THEME_IDS].sort());
    for (const [id, theme] of Object.entries(CITY_THEMES)) expect(theme.id).toBe(id);
    expect([...CITY_ORDER].sort()).toEqual([...CITY_THEME_IDS].sort());
    expect(listCityThemes().map((t) => t.id)).toEqual(CITY_ORDER);
  });

  it("offers the five cities first and the classic table last", () => {
    expect(CITY_ORDER).toEqual(["kolkata", "delhi", "chennai", "mumbai", "bengaluru", "classic"]);
  });

  it("falls back to the classic table for unknown or missing ids", () => {
    for (const bad of [undefined, null, "", "paris", "Kolkata", 3]) expect(getCityTheme(bad).id).toBe("classic");
    expect(getCityTheme("mumbai").name).toBe("Mumbai");
  });
});

describe("each theme", () => {
  it.each(themes.map((t) => [t.id, t] as const))("%s: four districts, one per seat", (_, theme) => {
    expect(theme.districts.map((d) => d.seat)).toEqual([0, 1, 2, 3]);
    for (const d of theme.districts) expect(d.motto.split(" · ")).toHaveLength(3);
  });

  it.each(themes.map((t) => [t.id, t] as const))("%s: accent text is readable (WCAG AA)", (_, theme) => {
    expect(contrastRatio(theme.palette.accent, theme.palette.accentInk)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.palette.surface, theme.palette.ink)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(theme.palette.surface, theme.palette.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(themes.map((t) => [t.id, t] as const))("%s: board cells stay light so the path and tokens read", (_, theme) => {
    expect(luminance(theme.palette.boardCell)).toBeGreaterThan(0.8);
  });

  it.each(themes.map((t) => [t.id, t] as const))("%s: its packs and preset exist", (_, theme) => {
    expect(CITY_DIALOGUE_PACKS[theme.id]).toBeDefined();
    expect(theme.dialoguePack).toBe(theme.id);
    expect(CITY_EMOTION_PACKS[theme.id]).toBeDefined();
    expect(theme.emotionPack).toBe(theme.id);
    expect(CITY_ENVIRONMENT_PRESETS[theme.environmentPreset]).toBeDefined();
  });

  it.each(cities.map((t) => [t.id, t] as const))("%s: one hero landmark, props, reactions and a script sample", (_, theme) => {
    expect(theme.landmarks.filter((l) => l.role === "hero")).toHaveLength(1);
    expect(theme.landmarks.find((l) => l.role === "hero")?.placement).toBe("horizon");
    expect(theme.props.length).toBeGreaterThanOrEqual(4);
    expect(theme.nativeName).toBeTruthy();
    expect(theme.signage.script).not.toBeNull();
    for (const r of theme.reactions) expect(GAME_MOMENTS).toContain(r.moment);
    const ids = [...theme.landmarks.map((l) => l.id), ...theme.props.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the classic table bare", () => {
    expect(CITY_THEMES.classic.landmarks).toEqual([]);
    expect(CITY_THEMES.classic.props).toEqual([]);
  });
});

describe("dialogue", () => {
  it.each(Object.values(CITY_DIALOGUE_PACKS).map((p) => [p.id, p] as const))("%s: at least two short lines for every moment", (_, pack) => {
    for (const moment of GAME_MOMENTS) {
      const lines = pack.lines[moment];
      expect(lines.length, moment).toBeGreaterThanOrEqual(2);
      for (const l of lines) {
        expect(l.text.length).toBeGreaterThan(0);
        expect(l.text.length, l.text).toBeLessThanOrEqual(48);
        expect(l.meaning.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks every non-English city pack as a draft for native review", () => {
    for (const city of cities) expect(CITY_DIALOGUE_PACKS[city.id].reviewStatus).toBe("draft-needs-native-review");
  });

  it("carries the lines from the brief", () => {
    const all = (id: keyof typeof CITY_DIALOGUE_PACKS) => Object.values(CITY_DIALOGUE_PACKS[id].lines).flat().map((l) => l.text);
    expect(all("kolkata")).toEqual(expect.arrayContaining(["Cholun, game shuru hok.", "Aaj jombe.", "Ei move ta dekhun!", "Ki darun!"]));
    expect(all("delhi")).toEqual(expect.arrayContaining(["Dilli ka move alag hi hota hai.", "Yeh khel ab garam hoga.", "Seedha dil se, seedha board par."]));
    expect(all("chennai")).toEqual(expect.arrayContaining(["Vaanga, game aarambikkalaam.", "Semma move!", "Idhu romba interesting-a irukku."]));
    expect(all("mumbai")).toEqual(expect.arrayContaining(["Picture abhi baaki hai.", "Yeh move full paisa vasool.", "Mumbai speed mein khelo!"]));
    expect(all("bengaluru")).toEqual(expect.arrayContaining(["Game on.", "Super move, maga.", "Nice one!", "Idhu clean play."]));
  });

  it("picks lines deterministically and wraps", () => {
    expect(dialogueFor("kolkata", "game-start").text).toBe("Cholun, game shuru hok.");
    expect(dialogueFor("kolkata", "game-start", 2)).toEqual(dialogueFor("kolkata", "game-start", 0));
    expect(dialogueFor("kolkata", "game-start", -1)).toEqual(dialogueFor("kolkata", "game-start", 1));
    expect(dialogueFor("nowhere", "victory").text).toBe("Victory!");
  });
});

describe("emotions", () => {
  it.each(Object.values(CITY_EMOTION_PACKS).map((p) => [p.id, p] as const))("%s: every state has an icon, a motion and a label", (_, pack) => {
    expect(Object.keys(pack.states).sort()).toEqual([...EMOTION_STATES].sort());
    for (const e of Object.values(pack.states)) {
      expect(e.icon).toMatch(/^face\./);
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.flavour.length).toBeGreaterThan(0);
    }
  });
});

describe("environment presets", () => {
  it.each(Object.values(CITY_ENVIRONMENT_PRESETS).map((p) => [p.id, p] as const))("%s: cameras keep the board readable", (_, preset) => {
    expect(preset.cameras.overview.pitch).toBeGreaterThanOrEqual(MIN_OVERVIEW_PITCH);
    expect(preset.cameras.overview.pitch).toBeLessThanOrEqual(90);
    expect(preset.cameras.topDown.pitch).toBe(90);
    expect(preset.cameras.intro.to).toEqual(preset.cameras.overview);
    expect(preset.cameras.intro.durationMs).toBeLessThanOrEqual(3000);
    expect(Math.abs(preset.cameras.drift.pitch)).toBeLessThanOrEqual(3);
    expect(preset.density.phone).toBe("minimal");
  });

  it("every preset is used by a theme", () => {
    const used = new Set(themes.map((t) => t.environmentPreset));
    expect(Object.keys(CITY_ENVIRONMENT_PRESETS).sort()).toEqual([...used].sort());
  });
});

describe("renderer contracts", () => {
  it("2D: CSS variables come from the palette", () => {
    const vars = themeCssVariables(CITY_THEMES.kolkata);
    expect(vars["--city-accent"]).toBe("#A8392A");
    expect(vars["--city-board-cell"]).toBe(CITY_THEMES.kolkata.palette.boardCell);
    expect(themeCssVariables(CITY_THEMES.delhi)["--city-water"]).toBe(CITY_THEMES.delhi.palette.sky[1]);
  });

  it("2D: dressing thins out by device and skips motion when asked", () => {
    const kolkata = CITY_THEMES.kolkata;
    expect(sceneLayers2d(kolkata, "phone")).toEqual(["sky", "horizon-landmark", "ground"]);
    expect(sceneLayers2d(kolkata, "desktop")).toContain("atmosphere");
    expect(sceneLayers2d(kolkata, "desktop", { reducedMotion: true })).not.toContain("atmosphere");
    expect(sceneLayers2d(CITY_THEMES.delhi, "desktop")).not.toContain("water");
    expect(sceneLayers2d(CITY_THEMES.classic, "desktop")).toEqual([]);
  });

  it("3D: phones fall back to 2D, reduced motion stills the camera, small screens show only the hero", () => {
    expect(supports3d("phone")).toBe(false);
    expect(supports3d("desktop")).toBe(true);
    const full = sceneDescription3d(CITY_THEMES.mumbai, "desktop");
    expect(full.camera.intro).not.toBeNull();
    expect(full.camera.drift).not.toBeNull();
    expect(full.landmarks).toHaveLength(CITY_THEMES.mumbai.landmarks.length);
    const still = sceneDescription3d(CITY_THEMES.mumbai, "desktop", { reducedMotion: true });
    expect(still.camera.intro).toBeNull();
    expect(still.camera.drift).toBeNull();
    expect(still.atmosphere.particles).toBe("none");
    const tablet = sceneDescription3d(CITY_THEMES.mumbai, "tablet");
    expect(tablet.landmarks.map((l) => l.role)).toEqual(["hero"]);
    expect(tablet.props.length).toBeLessThanOrEqual(2);
    expect(getEnvironmentPreset("mumbai").id).toBe("mumbai-seafront-dusk");
  });
});

describe("asset manifest", () => {
  it("lists every asset once with an honest status", () => {
    const manifest = cityAssetManifest();
    const ids = manifest.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of manifest) expect(a.brief.length).toBeGreaterThan(0);
    // Only the procedural city cards are drawn today; everything else is a placeholder brief.
    expect(manifest.filter((a) => a.status === "procedural").every((a) => a.kind === "preview")).toBe(true);
    expect(assetCounts().procedural).toBe(CITY_THEME_IDS.length);
  });
});
