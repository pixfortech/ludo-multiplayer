# Animation clips for the characters: CMU motion capture retargeted onto the
# game skeleton, plus poses layered on top with inverse kinematics (holding a
# newspaper, a short dismay). Clips are baked per character (bodies differ),
# at 30 frames a second, facing -Y (forward), with the hips' travel removed
# (locomotion is in place; the game moves the character).
#
# Retargeting, per frame: each mapped source bone's world rotation since its
# rest pose is applied to the target bone, after first turning the target's
# rest direction onto the source's (the CMU rest pose and MakeHuman's A-pose
# differ). Unmapped bones (fingers, toes) keep their rest pose. The hips'
# position follows the source's, scaled by leg length.
#
# The CMU data: "The data used in this project was obtained from
# mocap.cs.cmu.edu. The database was created with funding from NSF
# EIA-0196217." BVH conversion by B. Hahne (cgspeed). Free for any use.

from __future__ import annotations

import math
import os

import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

# Game skeleton bone <- CMU (cgspeed BVH) joint.
MAP = {
    "pelvis": "Hips",
    "spine_01": "LowerBack",
    "spine_02": "Spine",
    "spine_03": "Spine1",
    "neck_01": "Neck",
    "head": "Head",
    "clavicle_l": "LeftShoulder",
    "upperarm_l": "LeftArm",
    "lowerarm_l": "LeftForeArm",
    "hand_l": "LeftHand",
    "clavicle_r": "RightShoulder",
    "upperarm_r": "RightArm",
    "lowerarm_r": "RightForeArm",
    "hand_r": "RightHand",
    "thigh_l": "LeftUpLeg",
    "calf_l": "LeftLeg",
    "foot_l": "LeftFoot",
    "thigh_r": "RightUpLeg",
    "calf_r": "RightLeg",
    "foot_r": "RightFoot",
}

FPS = 30


def load_bvh(path: str) -> bpy.types.Object:
    bpy.ops.import_anim.bvh(filepath=path, axis_forward="-Z", axis_up="Y", rotate_mode="NATIVE", update_scene_fps=False, update_scene_duration=False)
    return bpy.context.active_object


def _world_rot(arm: bpy.types.Object, m: Matrix) -> Quaternion:
    return (arm.matrix_world @ m).to_quaternion()


def sample_source(src: bpy.types.Object, frames: list[int]) -> dict:
    """World rotations of every mapped source joint, and the hips' world position, at each frame."""
    scene = bpy.context.scene
    rot = {b: [] for b in MAP.values()}
    hips = []
    feet = {"l": [], "r": []}
    legs = {"l": [], "r": []}
    for f in frames:
        scene.frame_set(f)
        for b in MAP.values():
            rot[b].append(_world_rot(src, src.pose.bones[b].matrix))
        hips.append((src.matrix_world @ src.pose.bones["Hips"].head).copy())
        feet["l"].append((src.matrix_world @ src.pose.bones["LeftFoot"].head).copy())
        feet["r"].append((src.matrix_world @ src.pose.bones["RightFoot"].head).copy())
        legs["l"].append((src.matrix_world @ src.pose.bones["LeftUpLeg"].head).copy())
        legs["r"].append((src.matrix_world @ src.pose.bones["RightUpLeg"].head).copy())
    rest = {b: _world_rot(src, src.data.bones[b].matrix_local) for b in MAP.values()}
    dirs = {b: (src.matrix_world.to_3x3() @ (src.data.bones[b].tail_local - src.data.bones[b].head_local)).normalized() for b in MAP.values()}
    return {"rot": rot, "rest": rest, "dirs": dirs, "hips": hips, "feet": feet, "legs": legs}


def heading(left_hip: Vector, right_hip: Vector) -> float:
    """Yaw about +Z of the way a body faces (0 = facing -Y, the game's forward), from its hip joints."""
    across = left_hip - right_hip  # toward the body's left
    fwd = across.cross(Vector((0, 0, 1)))
    return math.atan2(fwd.x, -fwd.y)


def retarget(src: bpy.types.Object, tgt: bpy.types.Object, start: int, end: int, name: str, step: int = 4, in_place: str = "all", loop: bool = False) -> tuple[bpy.types.Action, float]:
    """Bakes source frames [start, end) onto the target armature as an action. Returns (action, forward speed m/s)."""
    frames = list(range(start, end, step))
    s = sample_source(src, frames)
    bones = tgt.data.bones
    order = [b.name for b in bones]  # parents come before children in Blender's list
    t0 = {b.name: b.matrix_local.to_quaternion() for b in bones}
    tdir = {b.name: (b.tail_local - b.head_local).normalized() for b in bones}
    # Limbs: turn the target's rest direction onto the source's (A-pose vs the CMU rest). The torso
    # (upright in both rest poses) keeps its rest: the imported hip and spine bones' directions are arbitrary.
    TORSO = {"pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"}
    align = {tb: (Quaternion() if tb in TORSO else tdir[tb].rotation_difference(s["dirs"][sb])) for tb, sb in MAP.items()}
    # Face forward (-Y): at the clip's start (walking), or all the time (standing clips: the slow turns of a
    # person waiting are taken out, so the character keeps facing where the game turns it).
    heads = np.unwrap(np.array([heading(l, r) for l, r in zip(s["legs"]["l"], s["legs"]["r"])]))
    if in_place == "all" and len(heads) > 2:
        w = max(1, int(FPS * 1.5))
        pad = np.pad(heads, (w, w), mode="edge")
        slow = np.convolve(pad, np.ones(w) / w, mode="same")[w:-w]
    else:
        slow = np.full(len(heads), heads[0])
    yaws = [Quaternion((0, 0, 1), -h) for h in slow]
    yaw = yaws[0]
    # Hips: scale by leg length; take the travel out.
    src_leg = _leg_length(src)
    tgt_leg = (bones["thigh_l"].head_local - bones["foot_l"].head_local).length
    scale = tgt_leg / src_leg
    hips = np.array([tuple(yaws[i] @ (h - s["hips"][0])) for i, h in enumerate(s["hips"])]) * scale
    speed = 0.0
    if in_place in ("all", "walk") and len(hips) > 1:
        t = np.arange(len(hips)) / (FPS)
        if in_place == "walk":
            # Steady travel: remove the straight-line trend (its slope is the walking speed).
            for axis in (0, 1):
                k, c = np.polyfit(t, hips[:, axis], 1)
                hips[:, axis] -= k * t + c
            k = np.polyfit(t, np.array([tuple(yaw @ (h - s["hips"][0])) for h in s["hips"]])[:, 1] * scale, 1)[0]
            speed = abs(k)
        else:
            # Wandering: keep only the small sway around a slowly moving centre.
            w = max(1, int(FPS * 1.0))
            kernel = np.ones(w) / w
            for axis in (0, 1):
                pad = np.pad(hips[:, axis], (w, w), mode="edge")
                hips[:, axis] -= np.convolve(pad, kernel, mode="same")[w:-w]
    action = bpy.data.actions.new(name)
    tgt.animation_data_create()
    tgt.animation_data.action = action
    curves = {}
    for b in order:
        pb = tgt.pose.bones[b]
        pb.rotation_mode = "QUATERNION"
        for i in range(4):
            curves[(b, "r", i)] = action.fcurves.new(f'pose.bones["{b}"].rotation_quaternion', index=i, action_group=b)
    for i in range(3):
        curves[("pelvis", "l", i)] = action.fcurves.new('pose.bones["pelvis"].location', index=i, action_group="pelvis")
    values: dict = {k: [] for k in curves}
    last: dict[str, Quaternion] = {}
    for fi in range(len(frames)):
        world: dict[str, Quaternion] = {}
        for b in order:
            parent = bones[b].parent
            if b in MAP:
                sb = MAP[b]
                delta = s["rot"][sb][fi] @ s["rest"][sb].inverted()
                world[b] = yaws[fi] @ delta @ align[b] @ t0[b]
            elif parent is not None:
                world[b] = world[parent.name] @ t0[parent.name].inverted() @ t0[b]
            else:
                world[b] = t0[b]
            if parent is not None:
                basis = t0[b].inverted() @ t0[parent.name] @ world[parent.name].inverted() @ world[b]
            else:
                basis = t0[b].inverted() @ world[b]
            if b in last and basis.dot(last[b]) < 0:
                basis = -basis
            last[b] = basis
            for i in range(4):
                values[(b, "r", i)].append(basis[i])
        loc = t0["pelvis"].inverted() @ Vector(hips[fi])
        for i in range(3):
            values[("pelvis", "l", i)].append(loc[i])
    n = len(frames)
    if loop:
        # Blend the last third of a second into the first frame so the loop has no seam.
        blend = min(n // 3, int(FPS / 3))
        for key, vals in values.items():
            for j in range(blend):
                a = (j + 1) / (blend + 1)
                vals[n - blend + j] = vals[n - blend + j] * (1 - a) + vals[0] * a
    for key, fc in curves.items():
        vals = values[key]
        fc.keyframe_points.add(n)
        co = np.zeros(n * 2)
        co[0::2] = np.arange(n)
        co[1::2] = vals
        fc.keyframe_points.foreach_set("co", co)
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
        fc.update()
    tgt.animation_data.action = None
    action.use_fake_user = True
    return action, speed


def _leg_length(src: bpy.types.Object) -> float:
    b = src.data.bones
    return (b["LeftUpLeg"].head_local - b["LeftFoot"].head_local).length * src.matrix_world.to_scale()[0]


def foot_contacts(src: bpy.types.Object, start: int, end: int, step: int = 4) -> np.ndarray:
    """Left-foot height over [start, end) (for finding gait cycles)."""
    s = sample_source(src, list(range(start, end, step)))
    return np.array([p.z for p in s["feet"]["l"]])


def remove(ob: bpy.types.Object) -> None:
    """Removes an imported source armature with its action (so the source take is never exported)."""
    data = ob.data
    action = ob.animation_data.action if ob.animation_data else None
    bpy.data.objects.remove(ob, do_unlink=True)
    if action is not None:
        bpy.data.actions.remove(action)
    if data and data.users == 0:
        bpy.data.armatures.remove(data)
