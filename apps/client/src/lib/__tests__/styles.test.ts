// The stylesheet's theme variables must match @ludo/design-tokens.
import { describe, expect, it } from "vitest";
import { BOARD_SURFACES, RADIUS, THEMES } from "@ludo/design-tokens";
import css from "../../index.css?raw";

const variable = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toLowerCase();

describe("theme tokens in index.css", () => {
  it("match the approved light theme", () => {
    const t = THEMES.light;
    expect(variable("color-canvas")).toBe(t.canvas.toLowerCase());
    expect(variable("color-surface")).toBe(t.surface.toLowerCase());
    expect(variable("color-border")).toBe(t.border.toLowerCase());
    expect(variable("color-ink")).toBe(t.ink.toLowerCase());
    expect(variable("color-ink-muted")).toBe(t.inkMuted.toLowerCase());
    expect(variable("color-accent")).toBe(t.accent.toLowerCase());
    expect(variable("color-focus")).toBe(t.focus.toLowerCase());
    expect(variable("color-danger")).toBe(t.danger.toLowerCase());
    expect(variable("color-success")).toBe(t.success.toLowerCase());
    expect(variable("color-board-cell")).toBe(BOARD_SURFACES.cell.toLowerCase());
  });

  it("match the radius scale and load the approved typefaces", () => {
    expect(variable("radius-chip")).toBe(`${RADIUS.chip}px`);
    expect(variable("radius-control")).toBe(`${RADIUS.control}px`);
    expect(variable("radius-card")).toBe(`${RADIUS.card}px`);
    expect(variable("radius-panel")).toBe(`${RADIUS.panel}px`);
    expect(css).toContain("@fontsource-variable/inter");
    expect(css).toContain("@fontsource-variable/outfit");
    expect(css).toContain("prefers-reduced-motion");
  });
});
