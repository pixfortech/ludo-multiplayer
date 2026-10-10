// Procedural geometry for the 3D board and tokens. Everything is built in
// code from the layout's sizes (one cell = one unit), shared between meshes,
// and disposed by the renderer when it unmounts.

import type { BufferGeometry} from "three";
import { CylinderGeometry, ExtrudeGeometry, LatheGeometry, RingGeometry, Shape, Vector2 } from "three";
import { SAFE_STAR_PATH } from "@ludo/design-tokens";

export interface Detail {
  /** Bevel and curve segments: fewer on low quality. */
  curve: number;
  radial: number;
}


export const DETAIL: Record<"low" | "medium" | "high", Detail> = {
  low: { curve: 2, radial: 20 },
  medium: { curve: 3, radial: 28 },
  high: { curve: 4, radial: 48 },
};

export function roundedRect(width: number, depth: number, radius: number): Shape {
  const w = width / 2;
  const d = depth / 2;
  const r = Math.min(radius, w, d);
  const s = new Shape();
  s.moveTo(-w + r, -d);
  s.lineTo(w - r, -d);
  s.quadraticCurveTo(w, -d, w, -d + r);
  s.lineTo(w, d - r);
  s.quadraticCurveTo(w, d, w - r, d);
  s.lineTo(-w + r, d);
  s.quadraticCurveTo(-w, d, -w, d - r);
  s.lineTo(-w, -d + r);
  s.quadraticCurveTo(-w, -d, -w + r, -d);
  return s;
}

/**
 * Extrudes a shape up along +Y, from y = 0 to y = `height`, with soft bevels.
 * A pure rotation (no mirroring, so faces keep their winding): shape x is
 * world x and shape y is world −z. Shapes that are not symmetric pass −z.
 */
export function extrudeUp(shape: Shape, height: number, bevel: number, detail: Detail): BufferGeometry {
  // The bevel adds its thickness at both ends: the straight part is what remains, so the total is exactly `height`.
  const b = Math.max(0, Math.min(bevel, height / 2 - 0.0005));
  const g = new ExtrudeGeometry(shape, { depth: Math.max(0.001, height - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: detail.curve, curveSegments: detail.curve * 2 });
  // Extrusion runs along +Z; a quarter turn about X makes it run up +Y.
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * Small pieces (cells, inlays) are a few dozen pixels across: two segments per
 * rounded corner and per bevel are indistinguishable from more, and keep the
 * board's 72 cells to ~10k triangles.
 */
const small = (detail: Detail): Detail => ({ curve: Math.min(detail.curve, 2), radial: detail.radial });

/** A tile: a softly bevelled square block. */
export function tileGeometry(size: number, height: number, detail: Detail): BufferGeometry {
  return extrudeUp(roundedRect(size, size, size * 0.12), height, Math.min(0.045, height * 0.4), small(detail));
}

/** The board frame: a rounded square ring (outer edge to the grid edge). */
export function frameShape(outer: number, inner: number, radius: number): Shape {
  const shape = roundedRect(outer, outer, radius);
  const hole = roundedRect(inner, inner, 0.08);
  shape.holes.push(hole);
  return shape;
}

/** Parses an absolute/relative polygon path (M, L, l, z only), as used for the safe star. */
export function polygonFromPath(d: string): Vector2[] {
  const tokens = d.match(/[MLlz]|-?\d*\.?\d+/g) ?? [];
  const points: Vector2[] = [];
  let cmd = "M";
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i]!;
    if (/[MLlz]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "z") break;
      continue;
    }
    const a = Number(t);
    const b = Number(tokens[i + 1]);
    i += 2;
    if (cmd === "l") {
      x += a;
      y += b;
    } else {
      x = a;
      y = b;
      if (cmd === "M") cmd = "l";
    }
    points.push(new Vector2(x, y));
  }
  return points;
}

/** The safe-cell star (the 2D board's path), one unit across, as a thin raised inlay. */
export function starGeometry(size: number, height: number, detail: Detail): BufferGeometry {
  // SVG y grows down (toward +z); shape y is −z.
  const pts = polygonFromPath(SAFE_STAR_PATH).map((p) => new Vector2(((p.x - 12) / 24) * size, (-(p.y - 12) / 24) * size));
  return extrudeUp(new Shape(pts), height, height * 0.4, small(detail));
}

/** A chevron ">" pointing along +X, `size` long, as a thin raised inlay (the 2D stroke, mitred). */
export function chevronGeometry(size: number, width: number, height: number, detail: Detail): BufferGeometry {
  const a = size * 0.35;
  const b = size * 0.5;
  const line = [new Vector2(-a, -b), new Vector2(a, 0), new Vector2(-a, b)];
  const h = width / 2;
  const normal = (p: Vector2, q: Vector2) => {
    const d = q.clone().sub(p).normalize();
    return new Vector2(-d.y, d.x);
  };
  const n1 = normal(line[0]!, line[1]!);
  const n2 = normal(line[1]!, line[2]!);
  const miter = n1.clone().add(n2).normalize();
  const miterLength = h / miter.dot(n1);
  const outer = [line[0]!.clone().addScaledVector(n1, h), line[1]!.clone().addScaledVector(miter, miterLength), line[2]!.clone().addScaledVector(n2, h)];
  const inner = [line[2]!.clone().addScaledVector(n2, -h), line[1]!.clone().addScaledVector(miter, -miterLength), line[0]!.clone().addScaledVector(n1, -h)];
  return extrudeUp(new Shape([...outer, ...inner]), height, height * 0.4, small(detail));
}

/** A triangle on the board plane (world x, z corners), raised. */
export function triangleGeometry(corners: readonly { x: number; z: number }[], height: number, detail: Detail): BufferGeometry {
  return extrudeUp(new Shape(corners.map((c) => new Vector2(c.x, -c.z))), height, 0.03, detail);
}

/** The placeholder pawn: a lathe-turned piece, base Ø 0.78, 0.62 tall, flat top for its symbol. */
export const PAWN = { height: 0.62, topRadius: 0.17, baseRadius: 0.39 } as const;

export function pawnGeometry(detail: Detail): BufferGeometry {
  const profile = [
    [0, 0],
    [0.37, 0],
    [0.39, 0.025],
    [0.39, 0.075],
    [0.36, 0.11],
    [0.27, 0.15],
    [0.2, 0.22],
    [0.18, 0.3],
    [0.21, 0.36],
    [0.26, 0.43],
    [0.265, 0.5],
    [0.24, 0.56],
    [0.2, 0.605],
    [PAWN.topRadius, PAWN.height],
    [0, PAWN.height],
  ].map(([r, y]) => new Vector2(r, y));
  const g = new LatheGeometry(profile, detail.radial);
  g.computeVertexNormals();
  return g;
}

export const ringGeometry = (inner: number, outer: number, detail: Detail) => new RingGeometry(inner, outer, detail.radial).rotateX(-Math.PI / 2);
export const discGeometry = (radius: number, height: number, detail: Detail) => new CylinderGeometry(radius, radius, height, detail.radial).translate(0, height / 2, 0);
