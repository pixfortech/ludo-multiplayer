// Sightlines between the camera and the board, as plain math: whether a
// building stands between the camera and a cell, and keeping an orbiting
// camera out of buildings. Environments describe their buildings as boxes
// (footprint and height above the ground); nothing here knows any city.

import { clampPose, poseToPosition, ORBIT_LIMITS, type Pose } from "./cameraMath";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** An axis-aligned box in world space. */
export interface Aabb {
  min: Vec3;
  max: Vec3;
}

/** A footprint with a height, standing on the ground at `groundY`. */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export const toAabb = (b: Footprint, groundY: number, grow = 0): Aabb => ({
  min: { x: b.minX - grow, y: groundY - grow, z: b.minZ - grow },
  max: { x: b.maxX + grow, y: groundY + b.height + grow, z: b.maxZ + grow },
});

/** Whether the segment from `a` to `b` passes through the box (slab method). */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Aabb): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const k of ["x", "y", "z"] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < box.min[k] || a[k] > box.max[k]) return false;
      continue;
    }
    let near = (box.min[k] - a[k]) / d;
    let far = (box.max[k] - a[k]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

export const inside = (p: Vec3, box: Aabb): boolean => p.x > box.min.x && p.x < box.max.x && p.y > box.min.y && p.y < box.max.y && p.z > box.min.z && p.z < box.max.z;

/**
 * Keeps an orbiting camera out of buildings: if the camera would be inside
 * one (or within `margin` of it), it rises (steeper pitch) until it is clear.
 * The board is never hidden by this: the camera only goes higher.
 */
export function avoidObstacles(pose: Pose, boxes: readonly Aabb[], margin = 0.6): Pose {
  if (boxes.length === 0) return pose;
  const grown = boxes.map((b) => ({ min: { x: b.min.x - margin, y: b.min.y - margin, z: b.min.z - margin }, max: { x: b.max.x + margin, y: b.max.y + margin, z: b.max.z + margin } }));
  let p = clampPose(pose);
  for (let i = 0; i < 40 && grown.some((b) => inside(poseToPosition(p), b)); i++) p = { ...p, pitch: Math.min(ORBIT_LIMITS.maxPitch, p.pitch + (2 * Math.PI) / 180) };
  return p;
}
