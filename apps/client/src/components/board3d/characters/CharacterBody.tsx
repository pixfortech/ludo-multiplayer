// A human character in place of a pawn (C.3A prototype).
//
// Loads the character's GLB for the graphics level (meshopt-compressed,
// skinned, with its clips), clones it per token (its own skeleton), tints the
// team-coloured clothing to the seat's colour, and plays clips through an
// AnimationMixer with short crossfades. The token (Token3D) drives it every
// frame through a small controller: what to play comes from brain.ts, which
// only reads the token's state and the playback's motions. Nothing here takes
// pointer events (the token's own pick target does), casts shadows or touches
// game state.

import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { AnimationMixer, Color, LoopOnce, LoopRepeat, type AnimationAction, type Group, type Material, type Mesh, type Object3D, type Skeleton, type SkinnedMesh } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { QualityLevel } from "../capabilities";
import type { CharacterPose, ClipName } from "./brain";
import { characterScale, characterUrl } from "./catalog";

const noRaycast = (): void => undefined;

export interface CharacterController {
  /** Plays the pose's clip (crossfading from the last one) and advances the animation by dt seconds. */
  update(pose: CharacterPose, dt: number): void;
  /** The character's root (turned by the token to face its way). */
  root: Group;
}

export interface CharacterBodyProps {
  characterKey: string;
  quality: QualityLevel;
  /** The seat's colour, for the team-coloured clothing. */
  teamColour: string;
  /** The character is loaded and shown (it replaced the pawn): its tint, clips and level of detail. */
  onReady?: (info: { team: string; clips: string[]; level: string }) => void;
}

const FADE = 0.25;

/** Main-thread time spent animating characters (skinning poses), for the board's frame statistics. */
export const characterWork = { ms: 0 };

/**
 * One skeleton per character. A character is one skinned mesh with a primitive per material, and
 * SkeletonUtils.clone gives each primitive its own copy of the skeleton: each would compute its bone
 * matrices and upload its own bone texture every frame. The copies drive the same bones, so they are
 * bound to one. Returns the skeletons in use (to dispose with the character).
 */
export function shareSkeletons(root: Object3D): Skeleton[] {
  const kept: Skeleton[] = [];
  root.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const same = kept.find((k) => k.bones.length === mesh.skeleton.bones.length && k.bones.every((b, i) => b === mesh.skeleton.bones[i]));
    if (same) mesh.bind(same, mesh.bindMatrix);
    else kept.push(mesh.skeleton);
  });
  return kept;
}

export const CharacterBody = forwardRef<CharacterController, CharacterBodyProps>(function CharacterBody({ characterKey, quality, teamColour, onReady }, ref) {
  const gltf = useLoader(GLTFLoader, characterUrl(characterKey, quality), (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  }) as GLTF;

  const rig = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as Group;
    const scale = characterScale(characterKey);
    root.scale.setScalar(scale);
    const owned: Material[] = [];
    const tint = new Color(teamColour);
    root.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // Skinned bounds follow the bind pose: never cull a character that has stepped out of them.
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        if (m.name !== "team") return m;
        const own = m.clone();
        (own as unknown as { color: Color }).color.copy(tint);
        owned.push(own);
        return own;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
    });
    const skeletons = shareSkeletons(root);
    const mixer = new AnimationMixer(root);
    const actions = new Map<string, AnimationAction>();
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    const props = ["Prop_cup", "Prop_newspaper"].map((n) => root.getObjectByName(n)).filter((o): o is Object3D => Boolean(o));
    return { root, mixer, actions, owned, props, skeletons };
  }, [gltf, characterKey, teamColour]);

  useEffect(() => onReady?.({ team: `#${new Color(teamColour).getHexString()}`, clips: [...rig.actions.keys()].sort(), level: quality }), [rig, onReady, teamColour, quality]);
  useEffect(
    () => () => {
      rig.mixer.stopAllAction();
      rig.mixer.uncacheRoot(rig.root);
      for (const m of rig.owned) m.dispose();
      // The bone textures are this character's own (geometry and textures are shared with the loader's cache).
      for (const s of rig.skeletons) s.dispose();
    },
    [rig],
  );

  useImperativeHandle(
    ref,
    () => {
      let current: { clip: ClipName; action: AnimationAction } | null = null;
      return {
        root: rig.root,
        update(pose: CharacterPose, dt: number) {
          const action = rig.actions.get(pose.clip) ?? rig.actions.get("idle");
          if (!action) return;
          if (!current || current.clip !== pose.clip) {
            action.reset();
            action.setLoop(pose.loop ? LoopRepeat : LoopOnce, pose.loop ? Infinity : 1);
            action.clampWhenFinished = !pose.loop;
            action.play();
            if (current) current.action.crossFadeTo(action, FADE, false);
            current = { clip: pose.clip, action };
          }
          action.timeScale = pose.timeScale;
          for (const p of rig.props) p.visible = pose.prop;
          // A long gap (the tab was hidden, the city rested) must not jump the animation.
          const t0 = performance.now();
          rig.mixer.update(Math.min(dt, 0.1));
          characterWork.ms += performance.now() - t0;
        },
      };
    },
    [rig],
  );

  return <primitive object={rig.root} />;
});
