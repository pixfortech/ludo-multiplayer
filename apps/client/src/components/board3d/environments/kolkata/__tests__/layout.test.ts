// The 3D Kolkata's placement rules, checked on its data: nothing on the board,
// no building between the gameplay cameras and any cell, routes that loop
// without jumps, and every registered asset placed.
import { describe, expect, it } from "vitest";
import { CLASSIC_HOME_LANES, CLASSIC_TRACK, cellToWorld } from "@ludo/board-layouts";
import { environment3dFor } from "@ludo/city-themes";
import { AERIAL_PITCH, clampPose, focusPose, isometricPose, ORBIT_LIMITS, poseToPosition, type Pose } from "../../../cameraMath";
import { avoidObstacles, inside, segmentHitsBox, toAabb } from "../../../sightlines";
import { BOARD_CLEAR, FERRY_LOOPS, GROUND_Y, LAMPS, LANDMARKS, RIVER, TAXI_LANES, TRAM_LOOP, TREES, WALK_LOOPS, loopLength, loopPoint, obstacles, type Loop } from "../layout";

const FOV = (34 * Math.PI) / 180;
const onBoard = (x: number, z: number, margin = 0) => Math.abs(x) < BOARD_CLEAR + margin && Math.abs(z) < BOARD_CLEAR + margin;
const boxOverlapsBoard = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => b.maxX > -BOARD_CLEAR && b.minX < BOARD_CLEAR && b.maxZ > -BOARD_CLEAR && b.minZ < BOARD_CLEAR;
const inWater = (x: number, z: number) => [RIVER.west, RIVER.north].some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
// Every cell's top, and the token tops in the bases.
const cells = [...CLASSIC_TRACK, ...CLASSIC_HOME_LANES.flat()].map((c) => ({ ...cellToWorld(c.row, c.col), y: 0.2 }));
const boxes = obstacles().map((b) => toAabb(b, GROUND_Y));

describe("Kolkata layout", () => {
  it("keeps every landmark, tree and lamp off the board and its border", () => {
    for (const l of LANDMARKS) expect(boxOverlapsBoard(l.box), l.id).toBe(false);
    for (const t of TREES) expect(onBoard(t.x, t.z, 0.7 * t.scale), `tree ${t.x},${t.z}`).toBe(false);
    for (const lamp of LAMPS) expect(onBoard(lamp.x, lamp.z), `lamp ${lamp.x},${lamp.z}`).toBe(false);
  });

  it("puts each district's landmarks in that player's corner of the city", () => {
    const quadrant = (seat: number) => [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ][seat]!;
    for (const l of LANDMARKS.filter((x) => x.seat !== null)) {
      const [sx, sz] = quadrant(l.seat!);
      // Each lies on its corner's side of the board in at least one direction (districts run along the edges).
      expect(Math.sign(l.at.x) === sx || Math.sign(l.at.z) === sz, l.id).toBe(true);
    }
  });

  it("registers every asset of the city environment, and places each one", () => {
    const spec = environment3dFor("kolkata")!;
    const placed = new Set([...LANDMARKS.map((l) => l.id), "lamp-posts", "trees", "yellow-taxi", "tram", "ferry", "pedestrians", "skyline"]);
    for (const asset of spec.assets) expect(placed.has(asset.id), asset.id).toBe(true);
    expect(environment3dFor("delhi")).toBeNull();
    expect(environment3dFor("classic")).toBeNull();
  });

  it("hides no cell from the aerial 2.5D camera", () => {
    // The aerial camera is orthographic, looking along a fixed direction from the south.
    const toward = { x: 0, y: Math.sin(AERIAL_PITCH), z: Math.cos(AERIAL_PITCH) };
    for (const c of cells) {
      const far = { x: c.x + toward.x * 80, y: c.y + toward.y * 80, z: c.z + toward.z * 80 };
      for (const [i, b] of boxes.entries()) expect(segmentHitsBox(c, far, b), `cell ${c.x},${c.z} hidden by obstacle ${i}`).toBe(false);
    }
  });

  it("hides no cell from the 3D overview, at any screen shape", () => {
    for (const aspect of [0.6, 1, 1.78]) {
      const cam = poseToPosition(isometricPose(FOV, aspect));
      for (const c of cells) for (const [i, b] of boxes.entries()) expect(segmentHitsBox(cam, c, b), `aspect ${aspect}: cell ${c.x},${c.z} hidden by obstacle ${i}`).toBe(false);
    }
  });

  it("keeps the followed token in clear view, wherever it is on the board", () => {
    for (const c of cells.filter((_, i) => i % 3 === 0)) {
      const cam = poseToPosition(focusPose(c, FOV, 1));
      for (const [i, b] of boxes.entries()) expect(segmentHitsBox(cam, { ...c, y: 0.5 }, b), `token at ${c.x},${c.z} hidden by obstacle ${i}`).toBe(false);
    }
  });

  it("never lets the orbiting camera enter a building", () => {
    for (let yaw = -180; yaw < 180; yaw += 15)
      for (let pitch = ORBIT_LIMITS.minPitch; pitch <= ORBIT_LIMITS.maxPitch; pitch += (6 * Math.PI) / 180)
        for (const distance of [ORBIT_LIMITS.minDistance, 15, 20, 28, 40, ORBIT_LIMITS.maxDistance])
          for (const target of [
            { x: 0, y: 0, z: 0 },
            { x: 7, y: 0.3, z: -7 },
            { x: -7, y: 0.3, z: 7 },
            { x: 7, y: 0.3, z: 7 },
          ]) {
            const pose: Pose = clampPose({ target, yaw: (yaw * Math.PI) / 180, pitch, distance });
            const safe = poseToPosition(avoidObstacles(pose, boxes));
            for (const b of boxes) expect(inside(safe, b)).toBe(false);
          }
  });

  const sample = (l: Loop, n = 400) => Array.from({ length: n + 1 }, (_, i) => loopPoint(l, (i / n) * loopLength(l)));

  it("runs every route as a closed loop, outside the board, without jumps", () => {
    for (const l of [...TAXI_LANES, TRAM_LOOP, ...FERRY_LOOPS, ...WALK_LOOPS]) {
      const pts = sample(l);
      const step = loopLength(l) / 400;
      expect(pts[0]!.x, l.id).toBeCloseTo(pts[pts.length - 1]!.x, 6);
      expect(pts[0]!.z, l.id).toBeCloseTo(pts[pts.length - 1]!.z, 6);
      for (let i = 1; i < pts.length; i++) {
        expect(Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z), `${l.id} step ${i}`).toBeLessThanOrEqual(step * 1.0001);
        expect(onBoard(pts[i]!.x, pts[i]!.z), `${l.id} on the board`).toBe(false);
      }
    }
  });

  it("keeps boats on the water and traffic and walkers on land", () => {
    for (const l of FERRY_LOOPS) for (const p of sample(l)) expect(inWater(p.x, p.z), `${l.id} ${p.x},${p.z}`).toBe(true);
    for (const l of [...TAXI_LANES, TRAM_LOOP, ...WALK_LOOPS]) for (const p of sample(l)) expect(inWater(p.x, p.z), `${l.id} ${p.x},${p.z}`).toBe(false);
  });

  it("points each vehicle along its route", () => {
    const l = TAXI_LANES[0]!;
    const a = loopPoint(l, 3);
    const b = loopPoint(l, 3.05);
    // heading 0 faces +X; rotation about +Y by θ maps +X to (cos θ, −sin θ)
    expect(Math.cos(a.heading)).toBeCloseTo((b.x - a.x) / 0.05, 1);
    expect(-Math.sin(a.heading)).toBeCloseTo((b.z - a.z) / 0.05, 1);
  });
});
