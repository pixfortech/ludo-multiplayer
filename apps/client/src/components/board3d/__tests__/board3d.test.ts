// The 3D board's pure parts: its model comes only from the layout, the camera
// keeps the board readable and in frame, and motion starts and ends exactly
// where the placements say.
import { describe, expect, it } from "vitest";
import { CLASSIC_HOME_LANES, CLASSIC_SAFE_INDICES, CLASSIC_START_INDEX, CLASSIC_TRACK, cellToWorld } from "@ludo/board-layouts";
import { CITY_THEMES, CLASSIC_BOARD_MATERIAL, boardMaterial2d } from "@ludo/city-themes";
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { buildBoardModel, LANE_TINTS } from "../boardModel";
import { AERIAL_PITCH, BOARD_HALF, BOARD_TOP, blendPose, clampPose, fitAerial, fitDistance, isometricPose, orbit, ORBIT_LIMITS, poseToPosition } from "../cameraMath";
import { sampleMotion } from "../motion3d";

const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;

describe("3D board model", () => {
  const model = buildBoardModel(CLASSIC_BOARD_MATERIAL, [0, 1, 2, 3]);

  it("has one tile per layout cell: 52 track (4 of them starts) and 20 lane cells, at the layout's positions", () => {
    expect(model.tiles.filter((t) => t.kind !== "lane")).toHaveLength(52);
    expect(model.tiles.filter((t) => t.kind === "start")).toHaveLength(4);
    expect(model.tiles.filter((t) => t.kind === "lane")).toHaveLength(20);
    CLASSIC_TRACK.forEach((c, i) => expect(model.tiles.find((t) => t.index === i)).toMatchObject(cellToWorld(c.row, c.col)));
    expect(new Set(model.tiles.map(key)).size).toBe(72);
  });

  it("colours each start cell in its seat colour, at the seat's start index", () => {
    for (let seat = 0; seat < 4; seat++) {
      const tile = model.tiles.find((t) => t.index === CLASSIC_START_INDEX[seat]);
      expect(tile).toMatchObject({ kind: "start", seat, colour: PLAYER_IDENTITIES[seat]!.body });
    }
  });

  it("puts the stars on the four non-start safe cells, and chevrons on the starts and lane entries", () => {
    const starCells = CLASSIC_SAFE_INDICES.filter((i) => !CLASSIC_START_INDEX.includes(i)).map((i) => key(cellToWorld(CLASSIC_TRACK[i]!.row, CLASSIC_TRACK[i]!.col)));
    expect(model.stars.map(key).sort()).toEqual(starCells.sort());
    expect(model.chevrons).toHaveLength(8);
  });

  it("draws each home lane on its layout cells, deepening toward the centre", () => {
    for (let seat = 0; seat < 4; seat++) {
      const lane = model.tiles.filter((t) => t.kind === "lane" && t.seat === seat);
      expect(lane.map(key)).toEqual(CLASSIC_HOME_LANES[seat]!.map((c) => key(cellToWorld(c.row, c.col))));
      expect(LANE_TINTS).toEqual([0.8, 0.64, 0.47, 0.3, 0.12]);
    }
  });

  it("raises four bases with three tiers and four slot wells each, in the right corners", () => {
    expect(model.tiers).toHaveLength(12);
    expect(model.slots).toHaveLength(16);
    const signs = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const b of model.bases) expect([Math.sign(b.x), Math.sign(b.z)]).toEqual(signs[b.seat]);
    // Tiers rise toward the middle of the base.
    for (let seat = 0; seat < 4; seat++) {
      const heights = model.tiers.filter((t) => t.seat === seat).map((t) => t.height);
      expect(heights).toEqual([...heights].sort((a, b) => a - b));
    }
  });

  it("gives every seat a centre triangle facing its own arm", () => {
    expect(model.centre.map((c) => c.seat)).toEqual([0, 1, 2, 3]);
    for (const c of model.centre) {
      const cx = (c.corners[0].x + c.corners[1].x + c.corners[2].x) / 3;
      const cz = (c.corners[0].z + c.corners[1].z + c.corners[2].z) / 3;
      const arm = [[-1, 0], [0, -1], [1, 0], [0, 1]][c.seat]!;
      expect(Math.sign(Math.round(cx * 100))).toBe(arm[0]);
      expect(Math.sign(Math.round(cz * 100))).toBe(arm[1]);
    }
  });

  it("uses the city's board surfaces, and fades seats not in play", () => {
    const kolkata = boardMaterial2d(CITY_THEMES.kolkata);
    const m = buildBoardModel(kolkata, [0, 2]);
    expect(m.tiles.find((t) => t.kind === "track")!.colour).toBe(kolkata.cell);
    expect(m.stars[0]!.colour).toBe(kolkata.safeMark);
    expect(m.tiles.find((t) => t.kind === "start" && t.seat === 1)!.colour).not.toBe(PLAYER_IDENTITIES[1]!.body);
    expect(m.tiles.find((t) => t.kind === "start" && t.seat === 2)!.colour).toBe(PLAYER_IDENTITIES[2]!.body);
  });
});

describe("camera", () => {
  it("looks down steeply in 2.5D, so the board reads like a flat board with depth", () => {
    expect(AERIAL_PITCH * (180 / Math.PI)).toBeGreaterThanOrEqual(55);
    expect(AERIAL_PITCH * (180 / Math.PI)).toBeLessThan(90);
  });

  it("fits the whole board in the aerial view for every screen shape", () => {
    for (const aspect of [0.45, 0.75, 1, 1.33, 1.78, 2.4]) {
      const { halfHeight, offsetY } = fitAerial(aspect);
      const sin = Math.sin(AERIAL_PITCH);
      const cos = Math.cos(AERIAL_PITCH);
      // Board corners (and a token's height) in camera space must lie inside the frustum.
      expect(BOARD_HALF).toBeLessThanOrEqual(halfHeight * aspect);
      expect(BOARD_HALF * sin + BOARD_TOP * cos - offsetY).toBeLessThanOrEqual(halfHeight);
      expect(-BOARD_HALF * sin - offsetY).toBeGreaterThanOrEqual(-halfHeight);
    }
  });

  it("keeps the immersive camera above the board, within its limits, and the board in frame", () => {
    const fov = (34 * Math.PI) / 180;
    for (const aspect of [0.5, 1, 1.8]) {
      const iso = isometricPose(fov, aspect);
      expect(poseToPosition(iso).y).toBeGreaterThan(0);
      expect(iso.distance).toBe(fitDistance(fov, aspect, iso.pitch));
    }
    let p = isometricPose(fov, 1);
    for (let i = 0; i < 200; i++) p = orbit(p, 37, 41, 1.08);
    expect(p.pitch).toBeLessThanOrEqual(ORBIT_LIMITS.maxPitch);
    expect(p.distance).toBeLessThanOrEqual(ORBIT_LIMITS.maxDistance);
    for (let i = 0; i < 400; i++) p = orbit(p, -53, -61, 0.9);
    expect(p.pitch).toBeGreaterThanOrEqual(ORBIT_LIMITS.minPitch);
    expect(p.distance).toBeGreaterThanOrEqual(ORBIT_LIMITS.minDistance);
    expect(clampPose({ ...p, target: { x: 40, y: 0, z: -40 } }).target).toEqual({ x: 7.5, y: 0, z: -7.5 });
  });

  it("blends poses smoothly, the short way round", () => {
    const a = { target: { x: 0, y: 0, z: 0 }, pitch: 0.5, yaw: 3, distance: 20 };
    const b = { target: { x: 2, y: 0, z: 2 }, pitch: 1, yaw: -3, distance: 12 };
    expect(blendPose(a, b, 0)).toEqual(a);
    expect(blendPose(a, b, 1).distance).toBe(12);
    expect(Math.abs(blendPose(a, b, 0.5).yaw)).toBeGreaterThan(3); // through ±π, not through 0
  });
});

describe("3D token motion", () => {
  const from = { x: -6, z: -1 };
  const to = { x: -5, z: -1 };
  it.each(["hop", "land", "home", "open", "capture", "slide"] as const)("%s starts where the token was and ends on its new placement", (kind) => {
    const start = sampleMotion(kind, from, to, 0);
    expect(start.x).toBeCloseTo(from.x, 6);
    expect(start.z).toBeCloseTo(from.z, 6);
    expect(sampleMotion(kind, from, to, 1)).toEqual({ ...to, lift: 0, scale: 1, squash: 1, tilt: 0, opacity: 1 });
    for (let t = 0; t <= 1; t += 0.05) expect(sampleMotion(kind, from, to, t).lift).toBeGreaterThanOrEqual(0);
  });

  it("lifts a hop in a low arc, and slides flat under reduced motion", () => {
    expect(sampleMotion("hop", from, to, 0.5).lift).toBeCloseTo(0.25, 2);
    for (let t = 0; t < 1; t += 0.1) expect(sampleMotion("slide", from, to, t).lift).toBe(0);
  });
});
