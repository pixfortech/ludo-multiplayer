// UI design tokens shared by every screen. The client maps these onto Tailwind
// theme variables; numbers are CSS pixels unless noted.

export const SPACE = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const RADIUS = { chip: 8, control: 12, card: 16, panel: 24, pill: 999 } as const;

export const FONT = {
  /** Interface and numerals: Inter (variable, OFL licence), tabular figures for counters. */
  ui: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  /** Display headings and the wordmark: Outfit (variable, OFL licence) — geometric, friendly, not childish. */
  display: '"Outfit", "Inter", ui-sans-serif, system-ui, sans-serif',
} as const;

/** Type scale (size / line-height). Minimum interactive label size is 14 px; never below 12 px. */
export const TYPE = {
  caption: [12, 16],
  label: [14, 20],
  body: [16, 24],
  title: [20, 28],
  heading: [28, 34],
  display: [40, 44],
} as const;

/** Minimum touch target (WCAG 2.5.8 AA = 24; we use the platform-comfortable 44). */
export const MIN_TOUCH_TARGET = 44;

export const THEMES = {
  light: {
    canvas: "#F3F0EA",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    border: "#E2DCD1",
    ink: "#141821",
    inkMuted: "#5C6370",
    accent: "#1F5FD6",
    focus: "#1F5FD6",
    danger: "#C8102E",
    success: "#0E8C4A",
  },
  dark: {
    // Deep slate rather than black: keeps the light board from glaring.
    canvas: "#161A23",
    surface: "#1E2330",
    surfaceRaised: "#262C3B",
    border: "#323A4C",
    ink: "#EEF1F6",
    inkMuted: "#A3ABBB",
    accent: "#7FA8FF",
    focus: "#9CC0FF",
    danger: "#FF6B7F",
    success: "#4FD38A",
  },
} as const;

export type ThemeName = keyof typeof THEMES;

/** Motion durations (ms) and easings. See docs/design/motion.md. */
export const MOTION = {
  duration: {
    instant: 80,
    quick: 140,
    standard: 220,
    hopPerCell: 170,
    diceRoll: 650,
    diceReveal: 260,
    autoMovePause: 350,
    capture: 520,
    homeEntry: 600,
    victory: 2400,
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    enter: "cubic-bezier(0, 0, 0, 1)",
    exit: "cubic-bezier(0.3, 0, 1, 1)",
    /** Token settle after a hop: slight overshoot, no wobble. */
    settle: "cubic-bezier(0.34, 1.4, 0.64, 1)",
  },
} as const;
