// The tokens on the 3D board: placeholder resin pawns (lathe-turned, the
// seat's symbol on the flat top), in the seat colour, with the 2D states:
// movable (a ring on the board), selected (lifted, dark ring), unmovable
// (dimmed), finished (smaller, on the centre). Positions are the 2D board's
// placements (stacks included) converted to world units, so both renderers
// agree exactly. Travel uses the same motion descriptors as the 2D board:
// nothing moves until the playback (the server's state) says so, and a change
// without a motion is a jump.
//
// The visual is one component (PawnBody) behind a small interface, so an
// animated character can replace it later without touching the board or the
// rules: it receives the token's identity and state; Token3D places it,
// scales it and moves it along the motion sample.

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { Group} from "three";
import { CylinderGeometry, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, SpriteMaterial, type BufferGeometry, type Material } from "three";
import type { WorldPoint } from "@ludo/board-layouts";
import { INK, type PlayerIdentity } from "@ludo/design-tokens";
import type { BoardTokenState } from "../board/BoardToken";
import type { TokenMotion } from "../game/useBoardPlayback";
import { TOKEN_FLOOR } from "./BoardMesh3D";
import { PAWN, discGeometry, pawnGeometry, ringGeometry, type Detail } from "./geometry3d";
import { sampleMotion, type MotionSample } from "./motion3d";
import type { TextureCache } from "./textures";

export interface Token3DInput {
  key: string;
  identity: PlayerIdentity;
  step: number | null;
  at: WorldPoint;
  /** Relative size (1 = a lone token; smaller in stacks and when finished). */
  scale: number;
  state: BoardTokenState;
  motion: TokenMotion | undefined;
  badge: number | null;
  count: number | null;
  interactive: boolean;
}

/** The floor a token stands on for a step: raised bases, the cells, the centre. */
export function floorFor(step: number | null): number {
  if (step === null) return TOKEN_FLOOR.base;
  if (step === 56) return TOKEN_FLOOR.centre;
  return TOKEN_FLOOR.cell;
}

/** Shared geometry and materials for every token on the board. */
export class TokenKit {
  readonly pawn: BufferGeometry;
  readonly cap: BufferGeometry;
  readonly ring: BufferGeometry;
  readonly ringInner: BufferGeometry;
  readonly halo: BufferGeometry;
  readonly blob: BufferGeometry;
  readonly hit: BufferGeometry;
  readonly hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  readonly blobMaterial = new MeshBasicMaterial({ color: "#1B1712", transparent: true, opacity: 0.2, depthWrite: false });
  readonly darkRing = new MeshBasicMaterial({ color: INK.dark });
  readonly whiteRing = new MeshBasicMaterial({ color: "#FFFFFF" });
  private readonly materials = new Map<string, Material>();

  constructor(
    detail: Detail,
    private readonly physical: boolean,
  ) {
    this.pawn = pawnGeometry(detail);
    this.cap = discGeometry(PAWN.topRadius * 0.98, 0.004, detail);
    this.ring = ringGeometry(0.41, 0.53, detail);
    this.ringInner = ringGeometry(0.37, 0.41, detail);
    this.halo = ringGeometry(0.53, 0.6, detail);
    this.blob = ringGeometry(0, 0.36, detail);
    this.hit = new CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0);
  }

  private cached<T extends Material>(key: string, make: () => T): T {
    let m = this.materials.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.materials.set(key, m);
    }
    return m;
  }

  /** The pawn's resin: satin with a clear coat (physical on medium and high quality). */
  body(identity: PlayerIdentity, dim: boolean): Material {
    return this.cached(`body:${identity.id}:${dim}`, () => {
      const common = { color: identity.body, transparent: dim, opacity: dim ? 0.55 : 1 };
      return this.physical
        ? new MeshPhysicalMaterial({ ...common, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.22, sheen: 0.3, sheenColor: identity.highlight })
        : new MeshStandardMaterial({ ...common, roughness: 0.32 });
    });
  }

  top(identity: PlayerIdentity, textures: TextureCache, dim: boolean): Material {
    return this.cached(`top:${identity.id}:${dim}`, () => new MeshStandardMaterial({ map: textures.symbol(identity), roughness: 0.3, transparent: dim, opacity: dim ? 0.55 : 1 }));
  }

  badge(text: string, light: boolean, textures: TextureCache): SpriteMaterial {
    return this.cached(`badge:${text}:${light}`, () => new SpriteMaterial({ map: textures.badge(text, light), depthTest: false }));
  }

  ringMaterial(identity: PlayerIdentity): Material {
    // The seat's rim colour: darker than its body, so the ring reads on the light slot wells and cells.
    return this.cached(`ring:${identity.id}`, () => new MeshBasicMaterial({ color: identity.rim, transparent: true, opacity: 0.95 }));
  }

  dispose(): void {
    for (const g of [this.pawn, this.cap, this.ring, this.ringInner, this.halo, this.blob, this.hit]) g.dispose();
    for (const m of [this.hitMaterial, this.blobMaterial, this.darkRing, this.whiteRing, ...this.materials.values()]) m.dispose();
    this.materials.clear();
  }
}

interface Travel {
  from: WorldPoint;
  to: WorldPoint;
  fromFloor: number;
  toFloor: number;
  kind: TokenMotion["kind"];
  ms: number;
  start: number;
}

export interface Token3DProps {
  token: Token3DInput;
  kit: TokenKit;
  textures: TextureCache;
  shadows: boolean;
  reduced: boolean;
  register: (key: string, object: Group | null) => void;
  onActivate?: ((key: string) => void) | undefined;
  onPreview?: ((key: string | null) => void) | undefined;
}

/** What a token's visual receives. A GLB character (Batch C.3) implements the same props. */
export interface TokenBodyProps {
  identity: PlayerIdentity;
  state: BoardTokenState;
  kit: TokenKit;
  textures: TextureCache;
  shadows: boolean;
}

/** The placeholder token: a lathe-turned resin pawn with the seat symbol on its flat top. */
export function PawnBody({ identity, state, kit, textures, shadows }: TokenBodyProps) {
  const dim = state === "unmovable";
  return (
    <>
      <mesh geometry={kit.pawn} material={kit.body(identity, dim)} castShadow={shadows} receiveShadow={false} dispose={null} />
      <mesh geometry={kit.cap} material={kit.top(identity, textures, dim)} position={[0, PAWN.height, 0]} dispose={null} />
    </>
  );
}

export const Token3D = memo(function Token3D({ token, kit, textures, shadows, reduced, register, onActivate, onPreview }: Token3DProps) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const floor = floorFor(token.step);
  const previous = useRef({ at: token.at, floor });
  const travel = useRef<Travel | null>(null);
  const played = useRef<number | null>(null);

  // A new placement: travel there if the playback says how, otherwise jump.
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = { at: token.at, floor };
    const moved = from.at.x !== token.at.x || from.at.z !== token.at.z || from.floor !== floor;
    if (!moved) return;
    const m = token.motion;
    if (!m || m.id === played.current) {
      travel.current = null;
    } else {
      played.current = m.id;
      travel.current = { from: from.at, to: token.at, fromFloor: from.floor, toFloor: floor, kind: m.kind, ms: m.ms, start: performance.now() };
    }
    invalidate();
  }, [token.at, floor, token.motion, invalidate]);

  useEffect(() => {
    register(token.key, group.current);
    return () => register(token.key, null);
  }, [register, token.key]);

  const lifted = token.state === "selected" ? 0.08 : 0;
  const pulse = token.state === "movable" && !reduced;

  useFrame(() => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    let s: MotionSample = { ...token.at, lift: 0, scale: 1, squash: 1, tilt: 0, opacity: 1 };
    let y = floor;
    const t = travel.current;
    if (t) {
      const p = (performance.now() - t.start) / Math.max(1, t.ms);
      s = sampleMotion(t.kind, t.from, t.to, p);
      y = t.fromFloor + (t.toFloor - t.fromFloor) * Math.min(1, Math.max(0, p));
      if (p >= 1) travel.current = null;
      else invalidate();
    }
    g.position.set(s.x, y, s.z);
    b.position.y = s.lift + lifted;
    b.scale.set(token.scale * s.scale, token.scale * s.scale * s.squash, token.scale * s.scale);
    b.rotation.z = s.tilt;
    if (ring.current) {
      const k = pulse ? 1 + 0.08 * Math.sin(performance.now() / 260) : 1;
      ring.current.scale.setScalar(token.scale * k);
      if (pulse) invalidate();
    }
  });

  const hitRadius = Math.max(0.36, 0.55 * token.scale);
  const handlers = token.interactive
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta > 8) return; // a drag (orbiting the camera), not a tap
          onActivate?.(token.key);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          if (e.pointerType === "mouse") onPreview?.(token.key);
        },
        onPointerOut: (e: ThreeEvent<PointerEvent>) => {
          if (e.pointerType === "mouse") onPreview?.(null);
        },
      }
    : {};

  return (
    <group ref={group} position={[token.at.x, floor, token.at.z]} name={token.key}>
      {!shadows ? <mesh geometry={kit.blob} material={kit.blobMaterial} position={[0, 0.006, 0]} scale={token.scale} dispose={null} /> : null}
      {token.state === "movable" || token.state === "selected" ? (
        <group ref={ring} position={[0, 0.008, 0]}>
          <mesh geometry={kit.ring} material={token.state === "selected" ? kit.darkRing : kit.ringMaterial(token.identity)} dispose={null} />
          {/* A white halo outside the ring: it reads on the seat-coloured bases as well as on light cells. */}
          <mesh geometry={kit.halo} material={kit.whiteRing} dispose={null} />
          {token.state === "selected" ? <mesh geometry={kit.ringInner} material={kit.whiteRing} dispose={null} /> : null}
        </group>
      ) : null}
      <group ref={body}>
        <PawnBody identity={token.identity} state={token.state} kit={kit} textures={textures} shadows={shadows} />
      </group>
      {token.badge !== null ? (
        <sprite position={[0.32 * token.scale, 0.95, -0.32 * token.scale]} scale={0.34} material={kit.badge(String(token.badge), false, textures)} dispose={null} />
      ) : null}
      {token.count !== null ? (
        <sprite position={[-0.38, 0.9, -0.38]} scale={0.32} material={kit.badge(String(token.count), true, textures)} dispose={null} />
      ) : null}
      {/* The pick target gets its world position at once: a click right after the token becomes movable,
          before the next frame is drawn, must still find it. */}
      {token.interactive ? <mesh geometry={kit.hit} material={kit.hitMaterial} scale={[hitRadius / 0.5, 1, hitRadius / 0.5]} {...handlers} onUpdate={(m) => m.updateWorldMatrix(true, false)} dispose={null} /> : null}
    </group>
  );
});
