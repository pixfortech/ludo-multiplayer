// Camera poses and framing for the 3D board, as plain math (no three.js), so
// the rules that keep the board readable are tested directly:
//  - 2.5D: a fixed orthographic aerial view, steep enough that every cell and
//    path reads unambiguously, fitted so the whole board is always in view.
//  - Immersive (3D preview): an isometric overview, a constrained orbit, a
//    focus on the active token, and smooth transitions between them.
// The camera never moves anything on the board: it only looks at it.

import { WORLD_BOARD_SIZE, type WorldPoint } from "@ludo/board-layouts";

const DEG = Math.PI / 180;

/** The aerial camera's angle above the board plane. Steep, so the board reads like a flat Ludo board with depth. */
export const AERIAL_PITCH = 62 * DEG;
/** The board's outer edge (grid plus border), half-width in world units. */
export const BOARD_HALF = WORLD_BOARD_SIZE / 2 + 0.55;
/** The tallest thing on the board (a raised token), for framing. */
export const BOARD_TOP = 0.95;

export interface Pose {
  /** What the camera looks at. */
  target: { x: number; y: number; z: number };
  /** Angle above the board plane, radians. */
  pitch: number;
  /** Rotation about +Y, radians; 0 looks from the bottom edge (+Z) toward the top. */
  yaw: number;
  /** Distance from the target (perspective). */
  distance: number;
}

/** Camera position for a pose. */
export function poseToPosition(p: Pose): { x: number; y: number; z: number } {
  const horizontal = Math.cos(p.pitch) * p.distance;
  return { x: p.target.x + Math.sin(p.yaw) * horizontal, y: p.target.y + Math.sin(p.pitch) * p.distance, z: p.target.z + Math.cos(p.yaw) * horizontal };
}

/**
 * Orthographic framing for the aerial view: the visible half-height (world
 * units) and the vertical offset of the target, so the whole board (including
 * its height) fits a viewport of `aspect` (width / height) with `margin`.
 */
export function fitAerial(aspect: number, margin = 0.04, pitch = AERIAL_PITCH): { halfHeight: number; offsetY: number } {
  // Seen from the camera (yaw 0), board x maps to screen x; board z and height y map to screen y.
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  const top = BOARD_HALF * sin + BOARD_TOP * cos;
  const bottom = -BOARD_HALF * sin;
  const halfWidthNeeded = BOARD_HALF;
  const halfHeightNeeded = (top - bottom) / 2;
  const halfHeight = Math.max(halfHeightNeeded, halfWidthNeeded / aspect) * (1 + margin);
  return { halfHeight, offsetY: (top + bottom) / 2 };
}

/** The aerial pose (target on the board centre; ortho distance only places the camera above the board). */
export function aerialPose(): Pose {
  return { target: { x: 0, y: 0, z: 0 }, pitch: AERIAL_PITCH, yaw: 0, distance: 40 };
}

export const ORBIT_LIMITS = { minPitch: 24 * DEG, maxPitch: 84 * DEG, minDistance: 11, maxDistance: 34 } as const;

/** The distance at which a perspective camera with vertical `fov` (radians) shows the whole board. */
export function fitDistance(fov: number, aspect: number, pitch: number): number {
  // The whole board's bounding circle (corners included) plus the height of a raised token.
  const radius = Math.hypot(BOARD_HALF, BOARD_HALF) + BOARD_TOP * Math.cos(pitch);
  const fovH = 2 * Math.atan(Math.tan(fov / 2) * aspect);
  const limiting = Math.min(fov, fovH);
  return Math.min(ORBIT_LIMITS.maxDistance, Math.max(ORBIT_LIMITS.minDistance, radius / Math.sin(limiting / 2)));
}

/** The immersive overview: three-quarter view from the bottom-right corner, whole board in frame. */
export function isometricPose(fov: number, aspect: number): Pose {
  const pitch = 40 * DEG;
  return { target: { x: 0, y: 0, z: 0 }, pitch, yaw: 32 * DEG, distance: fitDistance(fov, aspect, pitch) };
}

/** Follows a token: closer, lower, looking at it. */
export function focusPose(point: WorldPoint, fov: number, aspect: number, yaw = 32 * DEG): Pose {
  const pitch = 48 * DEG;
  return { target: { x: point.x, y: 0.3, z: point.z }, pitch, yaw, distance: Math.max(ORBIT_LIMITS.minDistance, fitDistance(fov, aspect, pitch) * 0.55) };
}

/** Keeps an orbit inside its limits: never under the board, never too close or too far, target on the board. */
export function clampPose(p: Pose): Pose {
  const limit = WORLD_BOARD_SIZE / 2;
  return {
    target: { x: Math.max(-limit, Math.min(limit, p.target.x)), y: p.target.y, z: Math.max(-limit, Math.min(limit, p.target.z)) },
    pitch: Math.max(ORBIT_LIMITS.minPitch, Math.min(ORBIT_LIMITS.maxPitch, p.pitch)),
    yaw: ((((p.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI,
    distance: Math.max(ORBIT_LIMITS.minDistance, Math.min(ORBIT_LIMITS.maxDistance, p.distance)),
  };
}

/** Applies a drag (pixels) and a zoom factor to an orbit pose. */
export function orbit(p: Pose, dx: number, dy: number, zoom = 1): Pose {
  return clampPose({ ...p, yaw: p.yaw - dx * 0.008, pitch: p.pitch + dy * 0.006, distance: p.distance * zoom });
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The shortest way round between two angles. */
const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

/** A point along a smooth transition between two poses (t in 0..1). */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const k = smooth(Math.max(0, Math.min(1, t)));
  return {
    target: { x: lerp(a.target.x, b.target.x, k), y: lerp(a.target.y, b.target.y, k), z: lerp(a.target.z, b.target.z, k) },
    pitch: lerp(a.pitch, b.pitch, k),
    yaw: lerpAngle(a.yaw, b.yaw, k),
    distance: lerp(a.distance, b.distance, k),
  };
}
