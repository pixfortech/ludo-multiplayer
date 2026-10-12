// The die's mesh: a unit rounded cube whose six faces each map onto one cell
// of the face atlas (3 × 2 cells, in the box's face order +x, −x, +y, −y, +z,
// −z), so the whole die is one draw call (no material groups).

import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export function dieGeometry(segments: number): RoundedBoxGeometry {
  const geo = new RoundedBoxGeometry(1, 1, 1, segments, 0.15);
  // The rounded box is non-indexed and split evenly by face, in the box's face order; each face's own UVs run 0 → 1.
  const uv = geo.attributes.uv!;
  const perFace = uv.count / 6;
  for (let face = 0; face < 6; face++) {
    const col = face % 3;
    const row = Math.floor(face / 3);
    for (let i = face * perFace; i < (face + 1) * perFace; i++) {
      uv.setXY(i, (col + uv.getX(i)) / 3, 1 - (row + 1) / 2 + uv.getY(i) / 2);
    }
  }
  uv.needsUpdate = true;
  geo.clearGroups();
  return geo;
}
