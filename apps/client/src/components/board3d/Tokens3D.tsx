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

import { Suspense, lazy, memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
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
import type { QualityLevel } from "./capabilities";
import { decide, groundSpeed, turnToward, walkPosition, yawToward, type CharacterPose, type IdleBehaviour } from "./characters/brain";
import type { CharacterController } from "./characters/CharacterBody";

// The character code (glTF loader, meshopt decoder, skeleton cloning) is its own chunk: only cities with characters fetch it.
const CharacterBody = lazy(() => import("./characters/CharacterBody").then((m) => ({ default: m.CharacterBody })));
import { CHARACTERS, characterScale } from "./characters/catalog";

/** A token shown as a human character (C.3A). */
export interface TokenCharacter {
  key: string;
  behaviour: IdleBehaviour;
  quality: QualityLevel;
  /** Where the rest of the team stands (for facing a partner in a chat). */
  partners: Partial<Record<IdleBehaviour, WorldPoint>>;
  /** When this seat's turn began (performance.now), or null when it is not this seat's turn. */
  turnStartedAt: number | null;
}

/** A character's plinth (world units). */
export const PLINTH = { radius: 0.3, height: 0.05 } as const;

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
  /** Shown as a human character instead of a pawn. */
  character?: TokenCharacter | null;
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
  /** The plinth a character stands on (a miniature's base, in the seat colour). */
  readonly plinth: BufferGeometry;
  readonly plinthRim: BufferGeometry;
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
    this.plinth = new CylinderGeometry(PLINTH.radius, PLINTH.radius * 1.06, PLINTH.height, detail.radial).translate(0, PLINTH.height / 2, 0);
    this.plinthRim = new CylinderGeometry(PLINTH.radius * 1.075, PLINTH.radius * 1.1, PLINTH.height * 0.45, detail.radial).translate(0, PLINTH.height * 0.225, 0);
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
    for (const g of [this.pawn, this.cap, this.ring, this.ringInner, this.halo, this.blob, this.hit, this.plinth, this.plinthRim]) g.dispose();
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
  /** A character has loaded (its key and level of detail). */
  onCharacterLoaded?: ((key: string, level: string) => void) | undefined;
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

export const Token3D = memo(function Token3D({ token, kit, textures, shadows, reduced, register, onActivate, onPreview, onCharacterLoaded }: Token3DProps) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const floor = floorFor(token.step);
  const previous = useRef({ at: token.at, floor });
  const travel = useRef<Travel | null>(null);
  // A character still walking a cell when the next arrives walks that one after it: never a skipped cell or a jump.
  const queued = useRef<Travel[]>([]);
  const played = useRef<number | null>(null);
  const character = token.character ?? null;
  const isCharacter = character !== null;
  const controller = useRef<CharacterController | null>(null);
  const yaw = useRef<number | null>(null);
  const lastPose = useRef<CharacterPose | null>(null);
  const onCharacterReady = useCallback(
    (info: { team: string; clips: string[]; level: string }) => {
      // The token mirror reports it (data-character-ready): the person has replaced the pawn.
      if (group.current) Object.assign(group.current.userData, { characterReady: true, characterTeam: info.team, characterClips: info.clips, characterLevel: info.level });
      onCharacterLoaded?.(token.key, info.level);
      invalidate();
    },
    [invalidate, onCharacterLoaded, token.key],
  );

  // A new placement: travel there if the playback says how, otherwise jump.
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = { at: token.at, floor };
    const moved = from.at.x !== token.at.x || from.at.z !== token.at.z || from.floor !== floor;
    if (!moved) return;
    const m = token.motion;
    if (!m || m.id === played.current) {
      travel.current = null;
      queued.current = [];
    } else {
      played.current = m.id;
      const next: Travel = { from: from.at, to: token.at, fromFloor: from.floor, toFloor: floor, kind: m.kind, ms: m.ms, start: performance.now() };
      const walking = travel.current;
      if (isCharacter && walking && walking.kind !== "capture" && next.kind !== "capture" && performance.now() - walking.start < walking.ms) queued.current.push(next);
      else {
        travel.current = next;
        queued.current = [];
      }
    }
    invalidate();
  }, [token.at, floor, token.motion, isCharacter, invalidate]);

  useEffect(() => {
    register(token.key, group.current);
    return () => register(token.key, null);
  }, [register, token.key]);

  const lifted = token.state === "selected" ? 0.08 : 0;
  const pulse = token.state === "movable" && !reduced;

  useFrame((state, delta) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    let s: MotionSample = { ...token.at, lift: 0, scale: 1, squash: 1, tilt: 0, opacity: 1 };
    let y = floor;
    let t = travel.current;
    if (t && queued.current.length > 0 && performance.now() - t.start >= t.ms) {
      // On to the next cell, one cell a frame at most if the walk has fallen behind.
      const next = queued.current.shift()!;
      next.start = t.start + t.ms;
      t = travel.current = next;
    }
    let progress = 1;
    if (t) {
      progress = (performance.now() - t.start) / Math.max(1, t.ms);
      s = sampleMotion(t.kind, t.from, t.to, progress);
      y = t.fromFloor + (t.toFloor - t.fromFloor) * Math.min(1, Math.max(0, progress));
      if (progress >= 1 && queued.current.length === 0) travel.current = null;
      else invalidate();
    }
    if (character && controller.current) {
      // A person walks: straight from cell to cell at a steady pace (no hop, no squash), turning to face the way.
      const live = t && progress < 1 ? t : null;
      if (live && live.kind !== "capture") {
        const w = walkPosition(live.kind, live.from, live.to, progress);
        s = { ...s, ...w, lift: 0, scale: 1, squash: 1, tilt: 0 };
      } else if (!live || live.kind !== "capture") {
        s = { ...s, lift: 0, scale: 1, squash: 1, tilt: 0 };
      }
      const entry = CHARACTERS[character.key];
      const pose = decide(
        {
          behaviour: character.behaviour,
          where: token.step === null ? "base" : token.step === 56 ? "home" : "board",
          token: token.state === "finished" ? "finished" : token.state === "movable" ? "movable" : token.state === "selected" ? "selected" : token.state === "unmovable" ? "unmovable" : "idle",
          travel: live ? { kind: live.kind, progress, groundSpeed: groundSpeed(live.kind, live.from, live.to, live.ms) } : null,
          turnAge: character.turnStartedAt === null ? null : (performance.now() - character.turnStartedAt) / 1000,
          time: performance.now() / 1000,
        },
        { walkSpeed: entry?.clips.walk?.speed ?? 1.6, runSpeed: entry?.clips.run?.speed ?? 3, scale: characterScale(character.key) },
      );
      const here = { x: s.x, z: s.z };
      let target: number | null = null;
      if (pose.face === "travel" && live) target = yawToward(live.from, live.to);
      else if (pose.face === "partner" && pose.partner && character.partners[pose.partner]) target = yawToward(here, character.partners[pose.partner]!);
      else if (pose.face === "centre") target = yawToward(here, { x: 0, z: 0 });
      if (yaw.current === null) yaw.current = target ?? 0;
      if (target !== null) yaw.current = reduced ? target : turnToward(yaw.current, target, Math.max(0.05, delta) * 7);
      controller.current.root.rotation.y = yaw.current;
      controller.current.update(pose, delta);
      // One-off reactions play at full rate even when the city's ambient life is resting.
      if (["turnAlert", "excited", "celebrating", "captured", "returningToBase", "leavingBase", "reachingHome", "walking"].includes(pose.state) || (target !== null && Math.abs(target - yaw.current) > 0.01)) invalidate();
      lastPose.current = pose;
      // For the token mirror (tests and tooling): what the character is doing.
      g.userData.characterState = pose.state;
      g.userData.characterClip = pose.clip;
    }
    g.position.set(s.x, y, s.z);
    b.position.y = s.lift + (character ? 0 : lifted);
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
        {character ? (
          <Suspense fallback={<PawnBody identity={token.identity} state={token.state} kit={kit} textures={textures} shadows={shadows} />}>
            {/* A miniature on its plinth: the seat colour reads from any camera, and the base is the obvious thing to pick. */}
            <mesh geometry={kit.plinth} material={kit.body(token.identity, token.state === "unmovable")} dispose={null} />
            <mesh geometry={kit.plinthRim} material={kit.whiteRing} dispose={null} />
            <group position={[0, PLINTH.height, 0]}>
              <CharacterBody ref={controller} characterKey={character.key} quality={character.quality} teamColour={token.identity.body} onReady={onCharacterReady} />
            </group>
          </Suspense>
        ) : (
          <PawnBody identity={token.identity} state={token.state} kit={kit} textures={textures} shadows={shadows} />
        )}
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
