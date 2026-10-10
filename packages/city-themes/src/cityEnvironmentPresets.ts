// Light, sky, atmosphere, board material and cameras for each city. These are
// renderer inputs: the 2D renderer uses the sky, light colour and density;
// the 3D renderer (Batch C) uses all of it. Nothing here may make the board
// harder to read: the overview camera looks down steeply enough that no cell
// is hidden, dressing is thinned on smaller screens, and motion is optional.

export type DeviceClass = "desktop" | "tablet" | "phone";

/** How much world dressing a renderer may draw. "minimal" = sky, ground and the hero landmark only. */
export type Density = "full" | "reduced" | "minimal";

export interface CameraPose {
  /** Degrees above the board plane: 90 is straight down. */
  pitch: number;
  /** Degrees around the board, 0 = looking from seat 3/0's side (the bottom edge). */
  yaw: number;
  /** Distance in board widths. */
  distance: number;
  /** Vertical field of view in degrees. */
  fov: number;
}

export interface EnvironmentPreset {
  id: string;
  lighting: {
    timeOfDay: "morning" | "midday" | "golden-hour" | "dusk" | "studio";
    sun: { elevation: number; azimuth: number; colour: string; intensity: number };
    ambient: { colour: string; intensity: number };
    shadowSoftness: number;
  };
  sky: { gradient: readonly [string, string]; haze: number; clouds: "none" | "wisps" | "scattered" | "monsoon" };
  atmosphere: { particles: "none" | "dust-motes" | "sea-spray" | "drizzle" | "leaves" | "kites"; density: number };
  boardMaterial: { cell: "paper" | "stone" | "terrazzo" | "laterite" | "granite" | "lacquer"; sheen: number; wear: number };
  cameras: {
    /** The default play camera. */
    overview: CameraPose;
    /** A short intro sweep (skipped under reduced motion). */
    intro: { from: CameraPose; to: CameraPose; durationMs: number };
    /** A slow, small idle drift around the overview pose, in degrees (0 = none). */
    drift: { yaw: number; pitch: number; periodMs: number };
    /** The flat, readable fallback. */
    topDown: CameraPose;
  };
  density: Readonly<Record<DeviceClass, Density>>;
}

/** The overview may not look flatter than this, so no token hides a cell behind it. */
export const MIN_OVERVIEW_PITCH = 50;

const TOP_DOWN: CameraPose = { pitch: 90, yaw: 0, distance: 1.4, fov: 35 };
const DENSITY = { desktop: "full", tablet: "reduced", phone: "minimal" } as const;

function cameras(overview: CameraPose, introYaw: number): EnvironmentPreset["cameras"] {
  return {
    overview,
    intro: { from: { pitch: 22, yaw: overview.yaw + introYaw, distance: overview.distance * 1.9, fov: overview.fov }, to: overview, durationMs: 2400 },
    drift: { yaw: 2, pitch: 1, periodMs: 24_000 },
    topDown: TOP_DOWN,
  };
}

const PRESETS: readonly EnvironmentPreset[] = [
  {
    id: "kolkata-golden-riverside",
    lighting: {
      timeOfDay: "golden-hour",
      sun: { elevation: 18, azimuth: 250, colour: "#FFC27A", intensity: 1.1 },
      ambient: { colour: "#FBE3BD", intensity: 0.55 },
      shadowSoftness: 0.7,
    },
    sky: { gradient: ["#F2B872", "#FBE3BD"], haze: 0.35, clouds: "wisps" },
    atmosphere: { particles: "dust-motes", density: 0.2 },
    boardMaterial: { cell: "laterite", sheen: 0.15, wear: 0.3 },
    cameras: cameras({ pitch: 58, yaw: 0, distance: 1.55, fov: 38 }, -35),
    density: DENSITY,
  },
  {
    id: "delhi-sandstone-dusk",
    lighting: {
      timeOfDay: "dusk",
      sun: { elevation: 12, azimuth: 260, colour: "#F4A06B", intensity: 1.0 },
      ambient: { colour: "#F7DDC4", intensity: 0.6 },
      shadowSoftness: 0.6,
    },
    sky: { gradient: ["#E7A877", "#F7DDC4"], haze: 0.4, clouds: "scattered" },
    atmosphere: { particles: "kites", density: 0.1 },
    boardMaterial: { cell: "stone", sheen: 0.1, wear: 0.35 },
    cameras: cameras({ pitch: 60, yaw: 0, distance: 1.6, fov: 36 }, 30),
    density: DENSITY,
  },
  {
    id: "chennai-coastal-morning",
    lighting: {
      timeOfDay: "morning",
      sun: { elevation: 30, azimuth: 95, colour: "#FFE2B0", intensity: 1.2 },
      ambient: { colour: "#E3F2EE", intensity: 0.65 },
      shadowSoftness: 0.5,
    },
    sky: { gradient: ["#8CC7D6", "#F3E7C9"], haze: 0.25, clouds: "wisps" },
    atmosphere: { particles: "sea-spray", density: 0.15 },
    boardMaterial: { cell: "granite", sheen: 0.2, wear: 0.2 },
    cameras: cameras({ pitch: 57, yaw: 0, distance: 1.55, fov: 38 }, -30),
    density: DENSITY,
  },
  {
    id: "mumbai-seafront-dusk",
    lighting: {
      timeOfDay: "dusk",
      sun: { elevation: 8, azimuth: 275, colour: "#F59A7A", intensity: 0.9 },
      ambient: { colour: "#C9D3E8", intensity: 0.6 },
      shadowSoftness: 0.75,
    },
    sky: { gradient: ["#5B6FA3", "#F2B8A0"], haze: 0.45, clouds: "monsoon" },
    atmosphere: { particles: "drizzle", density: 0.12 },
    boardMaterial: { cell: "terrazzo", sheen: 0.35, wear: 0.15 },
    cameras: cameras({ pitch: 56, yaw: 0, distance: 1.6, fov: 38 }, 35),
    density: DENSITY,
  },
  {
    id: "bengaluru-garden-morning",
    lighting: {
      timeOfDay: "morning",
      sun: { elevation: 35, azimuth: 110, colour: "#FFF0C8", intensity: 1.1 },
      ambient: { colour: "#E4F1E4", intensity: 0.7 },
      shadowSoftness: 0.55,
    },
    sky: { gradient: ["#9CCBE0", "#EAF3E3"], haze: 0.2, clouds: "scattered" },
    atmosphere: { particles: "leaves", density: 0.12 },
    boardMaterial: { cell: "granite", sheen: 0.25, wear: 0.1 },
    cameras: cameras({ pitch: 60, yaw: 0, distance: 1.55, fov: 36 }, -30),
    density: DENSITY,
  },
  {
    id: "classic-studio",
    lighting: {
      timeOfDay: "studio",
      sun: { elevation: 60, azimuth: 135, colour: "#FFFFFF", intensity: 1.0 },
      ambient: { colour: "#FFFFFF", intensity: 0.8 },
      shadowSoftness: 0.8,
    },
    sky: { gradient: ["#EEF1F6", "#F7F4EE"], haze: 0, clouds: "none" },
    atmosphere: { particles: "none", density: 0 },
    boardMaterial: { cell: "paper", sheen: 0.05, wear: 0 },
    cameras: cameras({ pitch: 70, yaw: 0, distance: 1.5, fov: 35 }, 0),
    density: { desktop: "minimal", tablet: "minimal", phone: "minimal" },
  },
];

export const CITY_ENVIRONMENT_PRESETS: Readonly<Record<string, EnvironmentPreset>> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
