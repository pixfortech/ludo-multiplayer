// The 3D die's rules: a standard die; a throw from any orientation, anywhere,
// lands exactly on the server's value at its resting spot (the variation never
// changes the value); and the resting spot in each base is clear of the
// characters and of every path out of the base.
import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { baseSlotToWorld, tokenPositionToWorld } from "@ludo/board-layouts";
import { dieGeometry } from "../dice/dieGeometry";
import { BOX_FACE_VALUES, FACE_NORMALS, UP, bounceHeight, dieSize, faceUp, handSpot, mountedDie, planThrow, restSpot, sampleThrow, valueUp, variation } from "../dice/dieMath";

const randomQuaternion = (rnd: () => number) => {
  // Uniform random rotation (Shoemake).
  const u1 = rnd();
  const u2 = rnd() * Math.PI * 2;
  const u3 = rnd() * Math.PI * 2;
  return new Quaternion(Math.sqrt(1 - u1) * Math.sin(u2), Math.sqrt(1 - u1) * Math.cos(u2), Math.sqrt(u1) * Math.sin(u3), Math.sqrt(u1) * Math.cos(u3));
};

describe("the die's faces", () => {
  it("is a standard die: opposite faces sum to seven, and 1, 2, 3 run counter-clockwise round their corner", () => {
    for (let v = 1; v <= 6; v++) expect(FACE_NORMALS[v]!.clone().add(FACE_NORMALS[7 - v]!).length(), `${v} opposite ${7 - v}`).toBeCloseTo(0, 9);
    // Seen from outside the shared corner, 1 → 2 → 3 turns counter-clockwise (a right-handed triple).
    const [n1, n2, n3] = [FACE_NORMALS[1]!, FACE_NORMALS[2]!, FACE_NORMALS[3]!];
    expect(new Vector3().crossVectors(n1, n2).dot(n3)).toBeCloseTo(1, 9);
    expect([...BOX_FACE_VALUES].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("shows each value on top for its face-up orientation, at any turn about the vertical", () => {
    for (let v = 1; v <= 6; v++) {
      for (const yaw of [0, 0.7, 2, -2.9]) {
        const q = faceUp(v, yaw);
        expect(valueUp(q)).toBe(v);
        expect(FACE_NORMALS[v]!.clone().applyQuaternion(q).dot(UP)).toBeCloseTo(1, 9);
      }
    }
    expect(() => faceUp(7)).toThrow();
  });
});

describe("the die's mesh", () => {
  it("maps each face onto exactly one atlas cell, and that cell is the one painted with the face's value", () => {
    for (const segments of [2, 4]) {
      const geo = dieGeometry(segments);
      const uv = geo.attributes.uv!;
      const normal = geo.attributes.normal!;
      const perFace = uv.count / 6;
      expect(Number.isInteger(perFace)).toBe(true);
      for (let face = 0; face < 6; face++) {
        const [u0, v0] = [(face % 3) / 3, 1 - (Math.floor(face / 3) + 1) / 2];
        // The direction this face points: the average of its normals.
        const dir = new Vector3();
        for (let i = face * perFace; i < (face + 1) * perFace; i++) {
          expect(uv.getX(i), `segments ${segments}, face ${face}: u inside its cell`).toBeGreaterThanOrEqual(u0 - 1e-6);
          expect(uv.getX(i)).toBeLessThanOrEqual(u0 + 1 / 3 + 1e-6);
          expect(uv.getY(i), `segments ${segments}, face ${face}: v inside its cell`).toBeGreaterThanOrEqual(v0 - 1e-6);
          expect(uv.getY(i)).toBeLessThanOrEqual(v0 + 1 / 2 + 1e-6);
          dir.add(new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)));
        }
        // Cell `face` is painted with BOX_FACE_VALUES[face]: it must sit on that value's face.
        const value = BOX_FACE_VALUES[face]!;
        expect(dir.normalize().dot(FACE_NORMALS[value]!), `segments ${segments}: cell ${face} on the ${value} face`).toBeGreaterThan(0.99);
      }
      geo.dispose();
    }
  });
});

describe("a throw", () => {
  it("lands exactly on the server's value, from any orientation and any seed (the variation never changes it)", () => {
    const rnd = variation(42);
    for (let i = 0; i < 300; i++) {
      const value = 1 + (i % 6);
      const q0 = randomQuaternion(rnd);
      const from = new Vector3(rnd() * 4 - 2, 0.6 + rnd(), rnd() * 4 - 2);
      const hand = new Vector3(-4.5, 1.9, -7.2);
      const to = new Vector3(-4.5, 0.66, -5.9);
      const plan = planThrow({ value, from, q0, hand, to, size: 0.62, seed: i * 7 + 1 });
      const end = { position: new Vector3(), quaternion: new Quaternion() };
      sampleThrow(plan, 1, end);
      expect(valueUp(end.quaternion), `throw ${i}`).toBe(value);
      expect(end.position.distanceTo(to)).toBeLessThan(1e-9);
      // Just before the end it is already turned onto the value (it rolls to a stop, no snap at the end).
      const near = { position: new Vector3(), quaternion: new Quaternion() };
      sampleThrow(plan, 0.995, near);
      expect(Math.abs(near.quaternion.angleTo(end.quaternion)), `throw ${i}: no snap`).toBeLessThan(0.05);
      // It starts exactly where the die was.
      const start = { position: new Vector3(), quaternion: new Quaternion() };
      sampleThrow(plan, 0, start);
      expect(start.position.distanceTo(from)).toBeLessThan(1e-9);
      expect(start.quaternion.angleTo(q0)).toBeLessThan(1e-6);
    }
  });

  it("tumbles: at least two whole turns, rolling the way it travels", () => {
    const plan = planThrow({ value: 4, from: new Vector3(0, 2, 0), q0: faceUp(1), hand: new Vector3(0, 2, 0), to: new Vector3(0, 0.6, 1.5), size: 0.62, seed: 9 });
    expect(plan.angle).toBeGreaterThan(4 * Math.PI);
    // The roll axis is horizontal-ish and across the direction of travel (+z): mostly along ±x.
    expect(Math.abs(plan.axis.x)).toBeGreaterThan(0.5);
  });

  it("bounces: above its resting height through the throw, ending on the ground", () => {
    const plan = planThrow({ value: 2, from: new Vector3(0, 2, 0), q0: faceUp(6), hand: new Vector3(0, 2, 0), to: new Vector3(0, 0.6, 1.5), size: 0.62, seed: 3 });
    for (let u = 0; u <= 1.0001; u += 0.01) expect(bounceHeight(plan, u)).toBeGreaterThanOrEqual(0);
    expect(bounceHeight(plan, 0.25)).toBeGreaterThan(0.6);
    expect(bounceHeight(plan, 0.62)).toBeGreaterThan(0.05); // the first bounce
    expect(bounceHeight(plan, 0.95)).toBe(0);
  });

  it("is the same throw for the same seed (repeatable), and varies between seeds", () => {
    const opts = { value: 5, from: new Vector3(1, 1, 1), q0: faceUp(3, 1), hand: new Vector3(0, 2, 0), to: new Vector3(0, 0.6, 1.5), size: 0.7 };
    const a = planThrow({ ...opts, seed: 77 });
    const b = planThrow({ ...opts, seed: 77 });
    const c = planThrow({ ...opts, seed: 78 });
    expect(a.q1.equals(b.q1) && a.wobble === b.wobble).toBe(true);
    expect(a.q1.equals(c.q1) && a.wobble === c.wobble).toBe(false);
  });
});

describe("where the die rests and is held", () => {
  const segmentDistance = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz)));
    return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
  };

  it("rests inside each base, clear of the four people and of every walk from a slot to the start cell", () => {
    for (let seat = 0; seat < 4; seat++) {
      const { at, out } = restSpot(seat);
      const slots = [0, 1, 2, 3].map((s) => baseSlotToWorld(seat, s));
      const centre = { x: slots.reduce((a, s) => a + s.x, 0) / 4, z: slots.reduce((a, s) => a + s.z, 0) / 4 };
      // On the inner square (half-size 1.88): its edge within it.
      expect(Math.max(Math.abs(at.x - centre.x), Math.abs(at.z - centre.z)) + dieSize(100) / 2, `seat ${seat}: inside the base`).toBeLessThan(1.91);
      const start = tokenPositionToWorld(seat, 0);
      for (const slot of slots) {
        // A person's plinth has radius 0.3; the die's half-size is at most 0.5.
        expect(Math.hypot(slot.x - at.x, slot.z - at.z), `seat ${seat}: clear of the slot`).toBeGreaterThan(0.8 + 0.25);
        expect(segmentDistance(at, slot, start), `seat ${seat}: clear of the walk out from ${slot.x},${slot.z}`).toBeGreaterThan(0.75);
      }
      // `out` points away from the start cell, toward the board's edge.
      expect(out.x * (start.x - centre.x) + out.z * (start.z - centre.z)).toBeLessThan(0);
      const hand = handSpot(seat, 0.35, 0.62);
      expect(Math.max(Math.abs(hand.x), Math.abs(hand.z)), `seat ${seat}: held over the board`).toBeLessThan(7.6);
      expect(hand.y).toBeGreaterThan(1.2);
    }
  });

  it("is a little under a cell on large boards, and up to a cell on small screens so it stays legible", () => {
    expect(dieSize(1000)).toBeCloseTo(0.78, 2);
    expect(dieSize(360)).toBe(1);
    expect(dieSize(200)).toBe(1);
  });
});

describe("a die mounting (a first load, another view or quality level)", () => {
  const thrown = { value: 6, seat: 0, ms: 1150, at: 10_000 };
  it("carries on a throw still in the air, to land on the server's value (never the value shown before it)", () => {
    expect(mountedDie({ seat: 0, value: null, throw: thrown }, 10_400)).toEqual({ seat: 0, value: 6, resumeMs: 750 });
    expect(mountedDie({ seat: 0, value: 3, throw: thrown }, 10_000)).toEqual({ seat: 0, value: 6, resumeMs: 1150 });
  });
  it("shows a throw that has ended at rest on its value, in the base of the seat whose turn it is (nothing replayed)", () => {
    expect(mountedDie({ seat: 1, value: 6, throw: thrown }, 20_000)).toEqual({ seat: 1, value: 6, resumeMs: null });
    expect(mountedDie({ seat: null, value: 6, throw: thrown }, 20_000)).toEqual({ seat: 0, value: 6, resumeMs: null });
  });
  it("before any roll: the last value or a 1, in the current player's base", () => {
    expect(mountedDie({ seat: 2, value: null, throw: null }, 0)).toEqual({ seat: 2, value: 1, resumeMs: null });
    expect(mountedDie({ seat: 3, value: 4, throw: null }, 0)).toEqual({ seat: 3, value: 4, resumeMs: null });
  });
});

