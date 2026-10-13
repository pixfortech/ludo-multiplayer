// The 3D die (C.3C.1): a rounded ivory die with recessed ink pips (gold rings
// on the six), thrown into the base of the player who rolled. It never decides
// a value: a throw comes from the playback with the server's value, and is
// planned (dieMath) to come to rest on that value at its spot in the base.
//
// Everything is time-based: at any frame the die is where its plan says, so
// dropped frames, a slow device or a remounted board (a quality change) never
// leave it mid-air; after the throw's time it rests on the value. Rendering is
// on demand: frames are asked for only while it moves (a lift, a throw, a toss
// to the next player), all of which are short.
//   - this player's roll is on its way: the die lifts into the hand, ready;
//   - the throw: from the hand, an arc and two bounces, rolling onto the value;
//   - the turn passes: a short toss to the next player's base;
//   - reduced motion: no lift, throw or toss; the die is simply there.
// A hidden mirror reports the value its actual orientation shows on top, its
// state and where it is on screen (for tests and tooling).

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, CircleGeometry, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3, type Group, type Mesh } from "three";
import { DIE, INK } from "@ludo/design-tokens";
import type { DieThrow } from "../../game/playbackPlan";
import { PIPS } from "../../game/Die";
import { TOKEN_FLOOR } from "../BoardMesh3D";
import type { StageViewport } from "../CameraRig";
import { dieGeometry } from "./dieGeometry";
import { BOX_FACE_VALUES, dieSize, faceUp, handSpot, planThrow, restSpot, sampleThrow, valueUp, type Throw } from "./dieMath";

export interface Die3DState {
  /** The value revealed last (the server's), or null before any roll. */
  value: number | null;
  /** The seat whose turn it is: the die waits in its base. Null when the game is over. */
  seat: number | null;
  /** This player's roll is on its way to the server: the die is lifted, ready to be thrown. */
  pending: boolean;
  /** The current or last throw, from the playback (null after a snapshot: nothing to replay). */
  throw: DieThrow | null;
}

const LIFT_MS = 260;
const TOSS_MS = 520;

/** One texture for all six faces (a 3 × 2 atlas, in the box's face order). */
function dieAtlas(cell: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = cell * 3;
  canvas.height = cell * 2;
  const g = canvas.getContext("2d")!;
  BOX_FACE_VALUES.forEach((value, i) => {
    const x0 = (i % 3) * cell;
    const y0 = Math.floor(i / 3) * cell;
    const body = g.createRadialGradient(x0 + cell * 0.42, y0 + cell * 0.38, cell * 0.1, x0 + cell / 2, y0 + cell / 2, cell * 0.78);
    body.addColorStop(0, DIE.ivoryLight);
    body.addColorStop(1, DIE.ivory);
    g.fillStyle = body;
    g.fillRect(x0, y0, cell, cell);
    // A soft shade toward the rounded edges.
    g.strokeStyle = "rgba(160, 145, 120, 0.18)";
    g.lineWidth = cell * 0.08;
    g.strokeRect(x0 + cell * 0.04, y0 + cell * 0.04, cell * 0.92, cell * 0.92);
    for (const [px, py] of PIPS[value]!) {
      const cx = x0 + (px / 100) * cell;
      const cy = y0 + (py / 100) * cell;
      const r = cell * 0.085;
      if (value === 6) {
        g.strokeStyle = DIE.gold;
        g.lineWidth = cell * 0.018;
        g.beginPath();
        g.arc(cx, cy, r * 1.32, 0, Math.PI * 2);
        g.stroke();
      }
      // Recessed: a light lip below, a dark well with a soft inner shade.
      g.fillStyle = "rgba(255, 255, 255, 0.85)";
      g.beginPath();
      g.arc(cx, cy + r * 0.12, r, 0, Math.PI * 2);
      g.fill();
      const pip = g.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
      pip.addColorStop(0, "#3a3f4b");
      pip.addColorStop(1, INK.dark);
      g.fillStyle = pip;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function shadowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, "rgba(27, 23, 18, 0.55)");
  grad.addColorStop(1, "rgba(27, 23, 18, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

type Motion = { kind: "throw" | "toss"; plan: Throw; start: number; ms: number } | { kind: "lift"; from: Vector3; to: Vector3; q0: Quaternion; start: number };

export interface Die3DProps {
  die: Die3DState;
  reduced: boolean;
  /** Higher quality rounds the edges more finely. */
  segments: number;
  /** The board's slot on a stage canvas (its size sets the die's), or null when the canvas is the board. */
  viewport: StageViewport | null;
  /** Hidden element the die reports to (value on top, state, screen position). */
  mirror: React.RefObject<HTMLSpanElement | null>;
}

export const Die3D = memo(function Die3D({ die, reduced, segments, viewport, mirror }: Die3DProps) {
  const invalidate = useThree((s) => s.invalidate);
  const canvasSize = useThree((s) => s.size);
  const size = dieSize(viewport ? viewport.size : Math.min(canvasSize.width, canvasSize.height));
  const floor = TOKEN_FLOOR.base;
  const restY = floor + size * 0.5 - 0.01;
  const res = useMemo(
    () => ({
      geometry: dieGeometry(segments),
      atlas: dieAtlas(segments > 2 ? 256 : 128),
      shadowGeo: new CircleGeometry(0.62, 24).rotateX(-Math.PI / 2),
      shadowTex: shadowTexture(),
    }),
    [segments],
  );
  const material = useMemo(() => new MeshStandardMaterial({ map: res.atlas, roughness: 0.38, metalness: 0 }), [res.atlas]);
  const shadowMat = useMemo(() => new MeshBasicMaterial({ map: res.shadowTex, transparent: true, depthWrite: false, opacity: 1 }), [res.shadowTex]);
  useEffect(
    () => () => {
      res.geometry.dispose();
      res.atlas.dispose();
      res.shadowGeo.dispose();
      res.shadowTex.dispose();
      material.dispose();
      shadowMat.dispose();
    },
    [res, material, shadowMat],
  );

  const body = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const rest3 = (seat: number) => {
    const { at } = restSpot(seat);
    return new Vector3(at.x, restY, at.z);
  };
  // Where the die is and how it is turned now (every motion starts from here: never a jump).
  // A remount (another view or quality) puts it straight in the base of the seat whose turn it is: no toss replayed.
  const startSeat = die.seat ?? die.throw?.seat ?? 0;
  const pose = useRef<{ position: Vector3; quaternion: Quaternion } | null>(null);
  if (pose.current === null) pose.current = { position: rest3(startSeat), quaternion: faceUp(die.value ?? 1, 0.35) };
  const motion = useRef<Motion | null>(null);
  const restSeat = useRef(startSeat);
  const thrown = useRef<number | null>(die.throw?.id ?? null);
  const wanted = useRef(die);
  wanted.current = die;

  /** Toss the die to the base of the seat whose turn it is (if it is not there and nothing else is happening). */
  const relocate = (now: number) => {
    const d = wanted.current;
    if (d.seat === null || d.seat === restSeat.current || d.pending || motion.current) return;
    const p = pose.current!;
    restSeat.current = d.seat;
    const to = rest3(d.seat);
    if (reduced) {
      p.position.copy(to);
      return;
    }
    const plan = planThrow({ value: valueUp(p.quaternion), from: p.position, q0: p.quaternion, hand: p.position, to, size, seed: d.seat * 7919 + Math.round(now), turns: 1, peak: size * 2.4 });
    motion.current = { kind: "toss", plan, start: now, ms: TOSS_MS };
    invalidate();
  };

  useLayoutEffect(() => {
    const now = performance.now();
    const p = pose.current!;
    const t = die.throw;
    if (t && t.id !== thrown.current) {
      // A throw (the server's roll): from wherever the die is to its resting spot, onto the value.
      thrown.current = t.id;
      restSeat.current = t.seat;
      const remaining = t.ms - (now - t.at);
      if (reduced || remaining <= 40) {
        motion.current = null;
        p.position.copy(rest3(t.seat));
        p.quaternion.copy(faceUp(t.value, 0.35 + t.id));
      } else {
        const plan = planThrow({ value: t.value, from: p.position, q0: p.quaternion, hand: handSpot(t.seat, floor, size), to: rest3(t.seat), size, seed: t.id * 2654435761 });
        motion.current = { kind: "throw", plan, start: now, ms: remaining };
      }
      invalidate();
      return;
    }
    if (die.pending && die.seat !== null && !reduced && motion.current?.kind !== "throw") {
      // Ready: lifted into the hand over the base, a small shake while the server draws the die.
      if (motion.current?.kind !== "lift") motion.current = { kind: "lift", from: p.position.clone(), to: handSpot(die.seat, floor, size), q0: p.quaternion.clone(), start: now };
      restSeat.current = die.seat;
      invalidate();
      return;
    }
    if (!die.pending && motion.current?.kind === "lift") {
      // The roll did not happen (an error): back down to its spot, showing what it showed.
      const plan = planThrow({ value: valueUp(p.quaternion), from: p.position, q0: p.quaternion, hand: p.position, to: rest3(restSeat.current), size, seed: 17, turns: 0, peak: 0 });
      motion.current = { kind: "toss", plan, start: now, ms: TOSS_MS };
      invalidate();
      return;
    }
    relocate(now);
    // relocate reads only refs and props captured above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [die.throw?.id, die.pending, die.seat, reduced, size]);

  // A size change (a resize, another screen) keeps the die on its spot, at its new height.
  useEffect(() => {
    const p = pose.current!;
    if (!motion.current) p.position.y = restY;
    invalidate();
  }, [restY, invalidate]);

  const reported = useRef("");
  const v = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    const p = pose.current!;
    const m = motion.current;
    const now = performance.now();
    let moving = false;
    if (m) {
      if (m.kind === "lift") {
        const k = Math.min(1, (now - m.start) / LIFT_MS);
        const e = k * k * (3 - 2 * k);
        p.position.lerpVectors(m.from, m.to, e);
        const shake = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0.4).normalize(), 0.22 * Math.sin(now / 55) * e);
        p.quaternion.copy(shake).multiply(m.q0);
        moving = true;
      } else {
        const k = (now - m.start) / m.ms;
        sampleThrow(m.plan, k, p);
        if (k >= 1) {
          motion.current = null;
          relocate(now);
        }
        moving = k < 1 || motion.current !== null;
      }
    }
    if (moving) invalidate();
    const g = body.current;
    if (g) {
      g.position.copy(p.position);
      g.quaternion.copy(p.quaternion);
      g.scale.setScalar(size);
    }
    const s = shadow.current;
    if (s) {
      const h = Math.max(0, p.position.y - restY);
      s.position.set(p.position.x, floor + 0.004, p.position.z);
      s.scale.setScalar(size * (1 + h * 0.35));
      shadowMat.opacity = Math.max(0.25, 1 - h * 0.45);
    }
    const el = mirror.current;
    if (el) {
      const stateName = motion.current ? motion.current.kind : "rest";
      v.copy(p.position).project(state.camera);
      const cx = (((v.x + 1) / 2) * state.size.width).toFixed(0);
      const cy = (((1 - v.y) / 2) * state.size.height).toFixed(0);
      const line = `${valueUp(p.quaternion)}|${stateName}|${restSeat.current}|${cx}|${cy}`;
      if (line !== reported.current) {
        reported.current = line;
        el.dataset.value = String(valueUp(p.quaternion));
        el.dataset.state = stateName;
        el.dataset.seat = String(restSeat.current);
        el.dataset.cx = cx;
        el.dataset.cy = cy;
        el.dataset.size = size.toFixed(2);
      }
    }
  });

  return (
    <group name="die-3d">
      <mesh ref={shadow} geometry={res.shadowGeo} material={shadowMat} renderOrder={1} dispose={null} />
      <group ref={body}>
        <mesh geometry={res.geometry} material={material} raycast={() => undefined} dispose={null} />
      </group>
    </group>
  );
});
