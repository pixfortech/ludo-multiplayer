// Building blocks for city environments. Static scenery is assembled from
// simple coloured parts (boxes, cylinders, domes, rings) and merged into one
// geometry with vertex colours: a whole landmark or district is one draw call.
// Repeated movers (taxis, trams, people) use the same merged geometry as an
// InstancedMesh. Nothing here is interactive: environments never handle
// pointer events, so they can never take a click meant for a token.

import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];

export class Builder {
  private readonly parts: BufferGeometry[] = [];
  private readonly colour = new Color();

  private add(g: BufferGeometry, colour: string, at: V3, rotation: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute("uv");
    geo.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale)));
    this.colour.set(colour);
    const n = geo.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([this.colour.r, this.colour.g, this.colour.b], i * 3);
    geo.setAttribute("color", new BufferAttribute(c, 3));
    this.parts.push(geo);
    return this;
  }

  /** A box by its size and its centre. */
  box(size: V3, at: V3, colour: string, rotation?: V3): this {
    return this.add(new BoxGeometry(...size), colour, at, rotation);
  }

  /** A box standing on y0, by footprint centre and size. */
  block(x: number, z: number, w: number, d: number, y0: number, h: number, colour: string, rotY = 0): this {
    return this.add(new BoxGeometry(w, h, d), colour, [x, y0 + h / 2, z], [0, rotY, 0]);
  }

  /** A cylinder (or frustum) standing on y0. */
  cylinder(x: number, z: number, rTop: number, rBottom: number, y0: number, h: number, colour: string, segments = 12): this {
    return this.add(new CylinderGeometry(rTop, rBottom, h, segments), colour, [x, y0 + h / 2, z]);
  }

  /** A dome (half sphere, optionally stretched upward) sitting on y0. */
  dome(x: number, z: number, r: number, y0: number, colour: string, stretch = 1, segments = 14): this {
    return this.add(new SphereGeometry(r, segments, Math.max(4, segments / 2), 0, Math.PI * 2, 0, Math.PI / 2), colour, [x, y0, z], [0, 0, 0], [1, stretch, 1]);
  }

  cone(x: number, z: number, r: number, y0: number, h: number, colour: string, segments = 8): this {
    return this.add(new ConeGeometry(r, h, segments), colour, [x, y0 + h / 2, z]);
  }

  sphere(at: V3, r: number, colour: string, segments = 10, scale: V3 = [1, 1, 1]): this {
    return this.add(new SphereGeometry(r, segments, Math.max(4, segments * 0.6)), colour, at, [0, 0, 0], scale);
  }

  torus(at: V3, radius: number, tube: number, colour: string, rotation: V3, segments = 40): this {
    return this.add(new TorusGeometry(radius, tube, 6, segments), colour, at, rotation);
  }

  /** A thin beam from a to b (a truss member, a rail, a leg). */
  beam(a: V3, b: V3, thickness: number, colour: string): this {
    const from = new Vector3(...a);
    const to = new Vector3(...b);
    const length = from.distanceTo(to);
    if (length < 1e-6) return this;
    const g = new BoxGeometry(length, thickness, thickness);
    const q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), to.clone().sub(from).normalize());
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const geo = g.toNonIndexed();
    g.dispose();
    geo.deleteAttribute("uv");
    geo.applyMatrix4(new Matrix4().compose(mid, q, new Vector3(1, 1, 1)));
    this.colour.set(colour);
    const n = geo.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([this.colour.r, this.colour.g, this.colour.b], i * 3);
    geo.setAttribute("color", new BufferAttribute(c, 3));
    this.parts.push(geo);
    return this;
  }

  /** Merges every part into one geometry (and disposes the parts). */
  build(): BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (!merged) throw new Error("nothing to build");
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** A stable pseudo-random number in [0, 1) from an integer seed (scenery variety without Math.random). */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Scenery never takes pointer events. */
export const noRaycast = (): void => undefined;
