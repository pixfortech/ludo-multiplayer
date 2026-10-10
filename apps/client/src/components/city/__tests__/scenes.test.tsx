// The 2D city scenes draw what the theme data says is drawn: every landmark
// and prop marked "procedural" is in its city's scene, nothing "planned" is,
// and every scene is decoration only (no controls, nothing focusable).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { CITY_THEMES, type CityThemeId } from "@ludo/city-themes";
import KolkataScene from "../scenes/KolkataScene";
import DelhiScene from "../scenes/DelhiScene";
import ChennaiScene from "../scenes/ChennaiScene";
import MumbaiScene from "../scenes/MumbaiScene";
import BengaluruScene from "../scenes/BengaluruScene";
import { CityMotif } from "../CityMotif";

const SCENES: Record<Exclude<CityThemeId, "classic">, ComponentType> = {
  kolkata: KolkataScene,
  delhi: DelhiScene,
  chennai: ChennaiScene,
  mumbai: MumbaiScene,
  bengaluru: BengaluruScene,
};

describe.each(Object.entries(SCENES))("%s scene", (id, Scene) => {
  const theme = CITY_THEMES[id as CityThemeId];

  it("draws every landmark and prop the theme lists as drawn, and nothing planned", () => {
    const { container } = render(<Scene />);
    const drawn = new Set([...container.querySelectorAll("[data-asset]")].map((el) => el.getAttribute("data-asset")));
    for (const l of theme.landmarks) expect(drawn.has(l.id), `${id}: landmark ${l.id} (${l.asset.status})`).toBe(l.asset.status === "procedural");
    for (const p of theme.props) expect(drawn.has(p.id), `${id}: prop ${p.id} (${p.asset.status})`).toBe(p.asset.status === "procedural");
  });

  it("has exactly one hero landmark, the theme's", () => {
    const { container } = render(<Scene />);
    const heroes = [...container.querySelectorAll('[data-role="hero"]')].map((el) => el.getAttribute("data-landmark"));
    expect(heroes).toEqual([theme.landmarks.find((l) => l.role === "hero")!.id]);
  });

  it("is decoration only", () => {
    const { container } = render(<Scene />);
    expect(container.querySelectorAll("button, a, input, [tabindex], [role]")).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  it("has a motif", () => {
    const { container } = render(<CityMotif city={id as CityThemeId} />);
    expect(container.querySelector(`[data-motif="${id}"] pattern`)).not.toBeNull();
  });
});
