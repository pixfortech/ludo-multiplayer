# The clip library: which CMU take and frames each clip comes from (120 fps
# source frames), and the poses layered on top with inverse kinematics.
#
# Clips (names are what the game plays):
#   idle         standing at ease, small shifts              19_08 (conversation, subject B, listening)
#   talk         explaining with hand gestures (adda)        18_08 (conversation, subject A)
#   listen       listening, small nods and gestures          18_08 (conversation, subject A, before he speaks)
#   drink        lifting a cup to drink (tea)                14_37 (drink soda)
#   stretch      neck, shoulder and arm stretches            42_01 (stretch)
#   exercise     side twists (light exercise)                14_06 (exercise: side twists)
#   look_around  turning to look (the turn alert)            77_05 (look around)
#   wave         a big wave                                  13_26 (direct traffic, wave)
#   excited      jumping up and down (a six; reaching home)  49_02 (jump up and down)
#   walk         one walking cycle, in place                 08_01 (walk)
#   run          one jogging cycle, in place (long moves)    02_03 (run/jog)
#   read         holding a newspaper open, head bowed        idle + IK hands + head aim
#   dismay       hands to the head (a capture)               idle + IK hands

from __future__ import annotations

import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

import animation as A

CLIPS = [
    # name, take, start, end, in-place mode, loop
    ("idle", "019/19_08.bvh", 300, 1150, "all", True),
    ("talk", "018/18_08.bvh", 1150, 1800, "all", True),
    ("listen", "018/18_08.bvh", 300, 1100, "all", True),
    ("drink", "014/14_37.bvh", 60, 500, "all", False),
    ("stretch", "042/42_01.bvh", 120, 1060, "all", True),
    ("exercise", "014/14_06.bvh", 3300, 3900, "all", True),
    ("look_around", "077/77_05.bvh", 30, 330, "all", False),
    ("wave", "013/13_26.bvh", 430, 640, "all", False),
    ("excited", "049/49_02.bvh", 150, 480, "all", False),
]


def walk_cycle(src: bpy.types.Object, shortest: int = 90, longest: int = 170) -> tuple[int, int]:
    """One gait cycle: from a left heel strike to the next (after the first second)."""
    n = int(src.animation_data.action.frame_range[1])
    z = A.foot_contacts(src, 1, n, 1)
    lows = [i for i in range(121, len(z) - 1) if z[i] <= z[i - 1] and z[i] <= z[i + 1] and z[i] < z.min() + (z.max() - z.min()) * 0.15]
    # Merge nearby minima (a foot rests for a while), keep the first of each.
    strikes: list[int] = []
    for i in lows:
        if not strikes or i - strikes[-1] > 40:
            strikes.append(i)
    for a, b in zip(strikes, strikes[1:]):
        if shortest <= b - a <= longest:
            return a + 1, b + 1
    return 121, 121 + (shortest + longest) // 2


def bake_all(rig: bpy.types.Object, cmu: str) -> dict[str, dict]:
    """Bakes every clip onto the rig as actions; returns per-clip info (frames, loop, speed)."""
    info: dict[str, dict] = {}
    for name, take, start, end, mode, loop in CLIPS:
        src = A.load_bvh(os.path.join(cmu, take))
        act, _ = A.retarget(src, rig, start, end, name, in_place=mode, loop=loop)
        A.remove(src)
        info[name] = {"frames": int(act.frame_range[1]) + 1, "loop": loop}
    src = A.load_bvh(os.path.join(cmu, "008/08_01.bvh"))
    a, b = walk_cycle(src)
    act, speed = A.retarget(src, rig, a, b, "walk", in_place="walk", loop=True)
    A.remove(src)
    info["walk"] = {"frames": int(act.frame_range[1]) + 1, "loop": True, "speed": round(speed, 3)}
    src = A.load_bvh(os.path.join(cmu, "002/02_03.bvh"))
    a, b = walk_cycle(src, 50, 110)
    act, speed = A.retarget(src, rig, a, b, "run", in_place="walk", loop=True)
    A.remove(src)
    info["run"] = {"frames": int(act.frame_range[1]) + 1, "loop": True, "speed": round(speed, 3)}
    info["read"] = {"frames": layered(rig, "idle", "read", reading_targets), "loop": True}
    info["dismay"] = {"frames": layered(rig, "idle", "dismay", dismay_targets, length=45), "loop": False}
    return info


def reading_targets(rig: bpy.types.Object) -> dict:
    """Hands holding an open newspaper in front of the chest; the head looks down at it."""
    b = rig.data.bones
    chest = b["spine_03"].head_local
    front = Vector((0, -0.32, 0.02))
    return {
        "hand_l": chest + front + Vector((0.13, 0, 0.0)),
        "hand_r": chest + front + Vector((-0.13, 0, 0.0)),
        "look": chest + Vector((0, -0.4, 0.05)),
    }


def dismay_targets(rig: bpy.types.Object) -> dict:
    """Both hands raised to the sides of the head."""
    b = rig.data.bones
    head = b["head"].head_local
    return {"hand_l": head + Vector((0.11, -0.02, 0.08)), "hand_r": head + Vector((-0.11, -0.02, 0.08))}


def layered(rig: bpy.types.Object, base: str, name: str, targets_fn, length: int | None = None) -> int:
    """A clip made of a base clip with the hands (and the gaze) pinned by IK, baked."""
    scene = bpy.context.scene
    base_act = bpy.data.actions[base]
    n = int(base_act.frame_range[1]) + 1 if length is None else length
    rig.animation_data_create()
    rig.animation_data.action = base_act
    targets = targets_fn(rig)
    empties = []
    bpy.context.view_layer.objects.active = rig
    for key, pos in targets.items():
        e = bpy.data.objects.new(f"T_{key}", None)
        scene.collection.objects.link(e)
        # Follow the chest, so the hands move with the body's sway.
        e.parent = rig
        e.parent_type = "BONE"
        e.parent_bone = "spine_03"
        scene.frame_set(0)
        e.matrix_world = Matrix.Translation(rig.matrix_world @ pos)
        empties.append(e)
        if key.startswith("hand"):
            side = key[-1]
            c = rig.pose.bones[f"lowerarm_{side}"].constraints.new("IK")
            c.target = e
            c.chain_count = 2
        else:
            c = rig.pose.bones["head"].constraints.new("DAMPED_TRACK")
            c.target = e
            c.track_axis = "TRACK_Y"
            c.influence = 0.55
    bpy.ops.object.mode_set(mode="POSE")
    for pb in rig.pose.bones:
        pb.bone.select = True
    bpy.ops.nla.bake(frame_start=0, frame_end=n - 1, only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=False, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    act = rig.animation_data.action
    act.name = name
    act.use_fake_user = True
    rig.animation_data.action = None
    for e in empties:
        bpy.data.objects.remove(e, do_unlink=True)
    return n
