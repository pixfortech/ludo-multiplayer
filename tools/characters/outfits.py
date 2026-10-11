# Outfits, hairstyles and accessories for the four characters.
#
# Team-coloured cloth uses the material "team" (the game tints it to the
# player's colour); everything else keeps its own colour.

from __future__ import annotations

import math

import numpy as np
from mathutils import Matrix, Vector

import garments as G
from assemble import Character


def _thickness(base: float, extra_down: float = 0.0, ref_top: float = 0.0, ref_bottom: float = 0.0, co: np.ndarray | None = None):
    def f(idx: np.ndarray) -> np.ndarray:
        t = np.full(len(idx), base)
        if extra_down and co is not None:
            d = np.clip((ref_top - co[idx, 2]) / max(1e-6, ref_top - ref_bottom), 0, 1)
            t += extra_down * d
        return t

    return f


def dress(c: Character) -> None:
    spec, R, co, sk = c.spec, c.reg, c.co, c.skel
    pal = spec["palette"]
    team = c.mats.get("team", c.team, 0.75, sheen=0.12, double=True)
    trim = c.mats.get("trim", pal["trim"], 0.6, sheen=0.25, double=True)
    lower = c.mats.get("lower", pal["lower"], 0.75, sheen=0.3, double=True)
    shoes = c.mats.get("shoes", pal["shoes"], 0.5)
    mats = {"team": team, "trim": trim, "lower": lower, "shoes": shoes}
    neck = sk.heads["neck_01"]
    pelvis = sk.heads["pelvis"]
    knee_z = (sk.heads["calf_l"][2] + sk.heads["calf_r"][2]) / 2
    outfit = spec["outfit"]

    if outfit == "panjabi":
        # Knee-length panjabi: round neck with a cream placket, full sleeves with cuffs; loose white pyjama.
        top = R.torso(neck_drop=0.0) | R.arm(upper_to=1.0, lower_to=0.93)

        def mat(face: np.ndarray) -> str:
            p = co[face]
            placket = (np.abs(p[:, 0]).max() < 0.014) & (p[:, 1].mean() < neck[1]) & (p[:, 2].min() > neck[2] - 0.2)
            cuff = any(R.dom[v] in ("lowerarm_l", "lowerarm_r") and sk.along(co[[v]], R.dom[v])[0] > 0.8 for v in face)
            return "trim" if placket or cuff else "team"

        c.region_shell("Panjabi", top, 0.009, mat, mats)
        c.skirt("PanjabiSkirt", knee_z - 0.02, 0.05, "team", mats, hem=(0.03, "trim"))
        c.region_shell("Pyjama", R.legs(thigh_to=1.0, calf_to=0.96), _thickness(0.012, 0.02, pelvis[2], 0.1, co), "lower", mats)
        c.region_shell("Shoes", R.feet(0.93), 0.006, "shoes", mats)
    elif outfit == "salwar":
        # Kameez with a gold border at neck, cuffs and hem; cream salwar gathered at the ankle; a draped dupatta.
        top = R.torso(neck_drop=0.0, v_neck=0.07) | R.arm(upper_to=1.0, lower_to=0.55)

        def mat(face: np.ndarray) -> str:
            p = co[face]
            near_neck = p[:, 2].max() > neck[2] - 0.035 or (p[:, 1].mean() < neck[1] and np.abs(p[:, 0]).max() < 0.075 and p[:, 2].min() > neck[2] - 0.13 and p[:, 2].max() > neck[2] - 0.12 + 0.0)
            cuff = any(R.dom[v] in ("lowerarm_l", "lowerarm_r") and sk.along(co[[v]], R.dom[v])[0] > 0.45 for v in face)
            return "trim" if cuff or (near_neck and p[:, 2].min() > neck[2] - 0.13 and p[:, 2].max() > neck[2] - 0.04) else "team"

        c.region_shell("Kameez", top, 0.008, mat, mats)
        c.skirt("KameezSkirt", knee_z + 0.02, 0.045, "team", mats, hem=(0.025, "trim"))
        c.region_shell("Salwar", R.legs(thigh_to=1.0, calf_to=0.97), _thickness(0.014, 0.03, pelvis[2], 0.12, co), "lower", mats)
        c.region_shell("Sandals", R.feet(0.97) & (co[:, 2] < 0.035), 0.004, "shoes", mats, all_vertices=False)
        dupatta(c)
    elif outfit == "shirt":
        # Half-sleeve shirt tucked into trousers with a belt; leather shoes.
        waist = pelvis[2] + 0.06
        top = R.torso(neck_drop=-0.005) & (co[:, 2] > waist) | R.arm(upper_to=0.55)

        def mat(face: np.ndarray) -> str:
            p = co[face]
            collar = p[:, 2].min() > neck[2] - 0.015
            buttons = (np.abs(p[:, 0]).max() < 0.008) & (p[:, 1].mean() < neck[1])
            return "trim" if collar or buttons else "team"

        c.region_shell("Shirt", top, 0.008, mat, mats)
        belt_mask = R.bones("pelvis", "spine_01") & (np.abs(co[:, 2] - waist) < 0.022)
        c.region_shell("Belt", belt_mask, 0.013, "belt", {"belt": c.mats.get("belt", pal["belt"], 0.4)}, all_vertices=True)
        trousers = R.legs(thigh_to=1.0, calf_to=0.97) | (R.bones("pelvis", "spine_01") & (co[:, 2] < waist + 0.01))
        c.region_shell("Trousers", trousers, _thickness(0.01, 0.006, pelvis[2], 0.1, co), "lower", mats)
        c.region_shell("Shoes", R.feet(0.93), 0.008, "shoes", mats)
    elif outfit == "tracksuit":
        # Zip-up track jacket with white stripes down the sleeves; dark joggers with a team-coloured side stripe; trainers.
        top = R.torso(neck_drop=-0.02) | R.arm(upper_to=1.0, lower_to=0.95)

        def mat(face: np.ndarray) -> str:
            p = co[face]
            zip_line = (np.abs(p[:, 0]).max() < 0.006) & (p[:, 1].mean() < neck[1])
            stripe = False
            for s in ("l", "r"):
                for bone in (f"upperarm_{s}", f"lowerarm_{s}"):
                    if all(R.dom[v] == bone for v in face):
                        out = sk.radial(p, bone)
                        # The stripe runs down the outside of the arm.
                        side = np.sign(sk.tails[bone][0] - sk.heads[bone][0]) or 1
                        stripe = stripe or (out[:, 0] * side).mean() > 0.82
            return "trim" if zip_line or stripe else "team"

        c.region_shell("Jacket", top, 0.012, mat, mats)
        joggers = R.legs(thigh_to=1.0, calf_to=0.96)

        def jmat(face: np.ndarray) -> str:
            p = co[face]
            for s in ("l", "r"):
                for bone in (f"thigh_{s}", f"calf_{s}"):
                    if all(R.dom[v] == bone for v in face):
                        out = sk.radial(p, bone)
                        side = 1 if s == "l" else -1
                        if (out[:, 0] * side).mean() > 0.9:
                            return "team"
            return "lower"

        c.region_shell("Joggers", joggers, _thickness(0.012, 0.01, pelvis[2], 0.1, co), jmat, mats)
        sole = c.mats.get("sole", pal["sole"], 0.8)

        def smat(face: np.ndarray) -> str:
            return "sole" if co[face, 2].max() < 0.022 else "shoes"

        c.region_shell("Trainers", R.feet(0.9), 0.011, smat, {"shoes": shoes, "sole": sole})
    else:
        raise ValueError(outfit)


def dupatta(c: Character) -> None:
    """A dupatta: draped from the front over both shoulders, its two ends falling down the back."""
    pal, sk = c.spec["palette"], c.skel
    mat = c.mats.get("dupatta", pal["dupatta"], 0.6, sheen=0.3, double=True)
    neck = Vector(sk.heads["neck_01"])
    chest = Vector(sk.heads["spine_03"])
    waist = Vector(sk.heads["spine_01"])
    for side, sgn in (("l", 1), ("r", -1)):
        shoulder = Vector(sk.heads[f"clavicle_{side}"]).lerp(Vector(sk.heads[f"upperarm_{side}"]), 0.6)
        pts = [
            Vector((0.0, chest.y - 0.2, chest.z - 0.06)),
            Vector((sgn * 0.07, chest.y - 0.2, chest.z + 0.07)),
            Vector((shoulder.x * 0.85, shoulder.y - 0.05, shoulder.z + 0.06)),
            Vector((shoulder.x * 0.8, shoulder.y + 0.08, shoulder.z)),
            Vector((sgn * 0.08, waist.y + 0.2, chest.z - 0.05)),
            Vector((sgn * 0.06, waist.y + 0.2, waist.z - 0.05)),
        ]
        c.ribbon(f"Dupatta_{side}", pts, 0.11, 0.022, mat)


def hair(c: Character) -> None:
    spec, co, sk, R = c.spec, c.co, c.skel, c.reg
    style = spec["hair"]["style"]
    # The hair shell shows the hair painted into the skin texture (strand grain, a soft hairline); it is set once the texture exists.
    mat = c.mats.get("hair", spec["hair"]["colour"], 0.55, sheen=0.08)
    c.textured_with_skin.append("hair")
    head = R.bones("head")
    eye = co[c.base.group_vertices("helper-l-eye")].mean(axis=0)
    head_c = sk.heads["head"]
    z = co[:, 2]
    rel = co - head_c
    ang = np.arctan2(rel[:, 0], -rel[:, 1])  # 0 = front, +-pi = back
    front = np.cos(ang)  # 1 front .. -1 back
    # Hairline height above the eye line, by direction: low at the nape, above and behind the ears, high on the forehead.
    h = z - eye[2]
    hairline = np.interp(front, [-1.0, -0.55, -0.25, 0.25, 0.6, 1.0], [-0.085, -0.06, 0.035, 0.04, 0.05, 0.062])
    scalp = head & (h > hairline)
    colour = spec["hair"]["colour"]
    soft = np.clip((h - hairline) / 0.012, 0, 1) * head  # fades in over a centimetre at the hairline
    if style == "receding":
        # Close-cropped grey hair in a horseshoe round the back and sides; the crown and forehead are bare.
        keep = (h < 0.072 - 0.025 * np.clip(front, 0, 1)) & (front < 0.4)
        fade = np.clip((0.072 - 0.025 * np.clip(front, 0, 1) - h) / 0.015, 0, 1) * np.clip((0.4 - front) / 0.15, 0, 1)
        c.paint.append({"values": (soft * fade * keep).astype(np.float32), "colour": colour, "strength": 0.95, "grain": 0.5, "blur": 2})
        c.region_shell("Hair", scalp & keep, lambda idx: 0.0015 + 0.0025 * soft[idx] * fade[idx], "hair", {"hair": mat}, cover=False, all_vertices=False, taper=0.0)
    elif style == "short_side":
        c.paint.append({"values": soft.astype(np.float32), "colour": colour, "strength": 1.0, "grain": 0.35, "blur": 1})
        c.region_shell("Hair", scalp, lambda idx: 0.004 + 0.011 * np.clip((h[idx] - hairline[idx]) / 0.06, 0, 1) * (1 + 0.25 * np.clip(-front[idx] + 0.5, 0, 1)), "hair", {"hair": mat}, cover=False, all_vertices=False, taper=0.0)
    elif style in ("braid", "ponytail"):
        c.paint.append({"values": soft.astype(np.float32), "colour": colour, "strength": 1.0, "grain": 0.3, "blur": 1})
        c.region_shell("Hair", scalp, lambda idx: 0.003 + 0.011 * np.clip((h[idx] - hairline[idx]) / 0.05, 0, 1), "hair", {"hair": mat}, cover=False, all_vertices=False, taper=0.0)
        back = Vector(head_c) + Vector((0, 0.085, 0.03 if style == "braid" else 0.11))
        mat = c.mats.get("hairlock", spec["hair"]["colour"], 0.5, sheen=0.1)
        if style == "braid":
            # A long plait down the back: overlapping lobes, alternating, tapering.
            for i in range(9):
                t = i / 8
                p = back + Vector((0.006 * (1 if i % 2 else -1), 0.03 + 0.012 * t, -0.04 - i * 0.045))
                r = 0.032 - 0.014 * t
                bone = "head" if i < 2 else ("neck_01" if i < 4 else "spine_03")
                c.primitive("sphere", f"Braid{i}", mat, bone, Matrix.Translation(p), radius=r, segments=10, rings=6, scale=(1.0, 0.85, 1.25))
        else:
            # A high ponytail: a tie, then a tapering tail swinging down behind.
            tie = c.mats.get("band", spec["palette"].get("band", "#F5F3EE"), 0.5)
            c.primitive("torus", "PonyTie", tie, "head", Matrix.Translation(back) @ Matrix.Rotation(math.radians(80), 4, "X"), major=0.02, minor=0.006, segments=14)
            for i in range(6):
                t = i / 5
                p = back + Vector((0, 0.02 + 0.03 * t, -0.03 - i * 0.04))
                c.primitive("sphere", f"Pony{i}", mat, "head" if i < 3 else "neck_01", Matrix.Translation(p), radius=0.028 - 0.012 * t, segments=10, rings=6, scale=(0.9, 0.8, 1.5))
    else:
        raise ValueError(style)


def face_extras(c: Character) -> None:
    spec, co, sk, R = c.spec, c.co, c.skel, c.reg
    if spec.get("moustache"):
        # A neat moustache painted on the upper lip, slightly drooping at the ends.
        teeth = co[c.base.group_vertices("helper-upper-teeth")]
        top = teeth[:, 2].max()
        x = np.abs(co[:, 0])
        low = top - 0.003 - 0.007 * np.clip((x - 0.012) / 0.016, 0, 1)
        high = top + 0.01 - 0.004 * np.clip((x - 0.01) / 0.02, 0, 1)
        inside = np.clip(np.minimum(co[:, 2] - low, high - co[:, 2]) / 0.003, 0, 1) * np.clip((0.027 - x) / 0.004, 0, 1)
        zone = R.bones("head") & (co[:, 1] < teeth[:, 1].min() + 0.004)
        c.paint.append({"values": (inside * zone).astype(np.float32), "colour": spec["moustache"], "strength": 0.95, "grain": 0.45, "blur": 1})
    if spec.get("glasses"):
        g = spec["glasses"]
        frame = c.mats.get("frame", g["frame"], 0.3, metallic=0.4)
        lens = c.mats.get("lens", "#DDE6EA", 0.05)
        for side, sgn in (("l", 1), ("r", -1)):
            pts = co[c.base.group_vertices(f"helper-{side}-eye")]
            e = pts.mean(axis=0)
            r = np.linalg.norm(pts - e, axis=1).max()
            centre = Vector((e[0], e[1] - r * 1.35, e[2]))
            ring = Matrix.Translation(centre) @ Matrix.Rotation(math.radians(90), 4, "X")
            c.primitive("torus", f"Rim_{side}", frame, "head", ring, major=r * 1.35, minor=0.0018, segments=20, scale=(1.0, 0.85 if g.get("round") else 0.72, 1.0))
            # The arm back to the ear.
            ear = Vector((e[0] + sgn * r * 1.6, e[1] + 0.085, e[2] + 0.003))
            mid = (centre + Vector((sgn * r * 1.35, 0, 0)) + ear) / 2
            length = (ear - (centre + Vector((sgn * r * 1.35, 0, 0)))).length
            arm = Matrix.Translation(mid) @ Matrix.Rotation(math.radians(90), 4, "X")
            c.primitive("cylinder", f"Temple_{side}", frame, "head", arm, radius=0.0016, depth=length, segments=6)
        eyes = [co[c.base.group_vertices(f"helper-{s}-eye")].mean(axis=0) for s in ("l", "r")]
        bridge = Vector(((eyes[0][0] + eyes[1][0]) / 2, min(eyes[0][1], eyes[1][1]) - 0.018, eyes[0][2] + 0.004))
        c.primitive("cylinder", "Bridge", frame, "head", Matrix.Translation(bridge) @ Matrix.Rotation(math.radians(90), 4, "Y"), radius=0.0016, depth=abs(eyes[0][0] - eyes[1][0]) * 0.3, segments=6)
    if spec["look"].get("bindi"):
        mat = c.mats.get("bindi", spec["look"]["bindi"], 0.4)
        eyes = [co[c.base.group_vertices(f"helper-{s}-eye")].mean(axis=0) for s in ("l", "r")]
        mid = (eyes[0] + eyes[1]) / 2
        # On the skin between the brows: the nearest forehead vertex in front.
        cand = R.bones("head") & (np.abs(co[:, 0]) < 0.004) & (co[:, 2] > mid[2] + 0.012) & (co[:, 2] < mid[2] + 0.028)
        idx = np.where(cand)[0]
        if len(idx):
            v = idx[np.argmin(co[idx, 1])]
            p = Vector(co[v] + c.normals[v] * 0.0015)
            c.primitive("cylinder", "Bindi", mat, "head", Matrix.Translation(p) @ Matrix.Rotation(math.radians(90), 4, "X"), radius=0.0035, depth=0.0012, segments=10)


def accessories(c: Character) -> None:
    spec, co, sk = c.spec, c.co, c.skel
    for item in spec.get("accessories", []):
        if item == "bangles":
            gold = c.mats.get("gold", "#C99A2E", 0.25, metallic=0.9)
            for s in ("l", "r"):
                a, b = Vector(sk.heads[f"hand_{s}"]), Vector(sk.heads[f"lowerarm_{s}"])
                d = (a - b).normalized()
                for k, off in enumerate((0.02, 0.032)):
                    p = a - d * off
                    m = Matrix.Translation(p) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
                    c.primitive("torus", f"Bangle_{s}{k}", gold, f"lowerarm_{s}", m, major=0.03, minor=0.0028, segments=18, minor_segments=5)
        elif item == "watch":
            strap = c.mats.get("strap", "#2B211B", 0.5)
            face = c.mats.get("watchface", "#D9D5CC", 0.2, metallic=0.6)
            a, b = Vector(sk.heads["hand_l"]), Vector(sk.heads["lowerarm_l"])
            d = (a - b).normalized()
            p = a - d * 0.03
            m = Matrix.Translation(p) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
            c.primitive("torus", "WatchStrap", strap, "lowerarm_l", m, major=0.029, minor=0.004, segments=16, minor_segments=4, scale=(1.0, 0.85, 1.6))
            c.primitive("cylinder", "WatchFace", face, "lowerarm_l", Matrix.Translation(p + Vector((0.0, 0.0, 0.031))), radius=0.012, depth=0.006, segments=12)
        elif item == "headband":
            band = c.mats.get("band", spec["palette"].get("band", "#F5F3EE"), 0.6)
            eye = co[c.base.group_vertices("helper-l-eye")].mean(axis=0)
            z0 = eye[2] + 0.05
            ring = c.reg.bones("head") & (np.abs(co[:, 2] - z0) < 0.006)
            pts = co[ring]
            cx, cy = (pts[:, 0].max() + pts[:, 0].min()) / 2, (pts[:, 1].max() + pts[:, 1].min()) / 2
            rx, ry = (pts[:, 0].max() - pts[:, 0].min()) / 2, (pts[:, 1].max() - pts[:, 1].min()) / 2
            m = Matrix.Translation(Vector((cx, cy, z0))) @ Matrix.Rotation(math.radians(-8), 4, "X")
            avg = (rx + ry) / 2 + 0.006
            c.primitive("torus", "Headband", band, "head", m, major=avg, minor=0.007, segments=28, minor_segments=6, scale=((rx + 0.006) / avg, (ry + 0.006) / avg, 1.6))


def prop(c: Character) -> None:
    kind = c.spec.get("prop")
    sk = c.skel
    if kind == "cup":
        clay = c.mats.get("clay", "#A4532F", 0.85)
        tea = c.mats.get("chai", "#B07A4A", 0.3)
        h = Vector(sk.heads["hand_r"])
        d = (Vector(sk.tails["hand_r"]) - h).normalized()
        p = h + d * 0.06 + Vector((0, -0.03, 0))
        c.primitive("cone", "Prop_cup", clay, "hand_r", Matrix.Translation(p), r1=0.017, r2=0.024, depth=0.05, segments=14)
        c.primitive("cylinder", "Prop_cup_tea", tea, "hand_r", Matrix.Translation(p + Vector((0, 0, 0.022))), radius=0.021, depth=0.002, segments=14)
    elif kind == "newspaper":
        paper = c.mats.get("paper", "#E7E1D2", 0.9, double=True)
        h = Vector(sk.heads["hand_r"])
        p = h + Vector((-0.05, -0.08, 0.05))
        c.primitive("cube", "Prop_newspaper", paper, "hand_r", Matrix.Translation(p) @ Matrix.Rotation(math.radians(-15), 4, "Z"), scale=(0.26, 0.004, 0.32))


def number(c: Character) -> None:
    """The character's number on the back of its clothes (white on the team colour)."""
    import bpy

    sk = c.skel
    bpy.ops.object.text_add()
    t = bpy.context.active_object
    t.data.body = str(c.spec["number"])
    t.data.align_x = "CENTER"
    t.data.align_y = "CENTER"
    t.data.size = 0.11
    t.data.extrude = 0.0015
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.active_object
    ob.name = "Number"
    back = Vector(sk.heads["spine_03"]) + Vector((0, 0.0, 0.0))
    # Put the numeral just outside the back surface, facing backward (+Y).
    co = c.co
    ids = np.where(c.reg.bones("spine_02", "spine_03") & (np.abs(co[:, 0]) < 0.03))[0]
    surface_y = co[ids, 1].max() if len(ids) else back.y + 0.12
    m = Matrix.Translation(Vector((back.x, surface_y + 0.016, back.z - 0.02))) @ Matrix.Rotation(math.radians(90), 4, "X") @ Matrix.Rotation(math.radians(180), 4, "Y")
    ob.data.transform(m)
    ob.matrix_world = Matrix.Identity(4)
    ob.data.materials.append(c.mats.get("number", "#F7F4EE", 0.6))
    c.rigid(ob, "spine_03")
