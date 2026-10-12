# Builds the playable human characters (GLB) from MakeHuman's CC0 assets and
# CMU motion capture, headlessly, with Blender's Python module (bpy 4.2 LTS).
#
#   python -I tools/characters/build.py --mh <mpfb2>/src/mpfb/data \
#       --cmu <cmu-mocap> --out apps/client/public/characters [--only adda] [--preview DIR]
#
# See tools/characters/README.md (sources, licences, steps) and
# docs/design/characters.md (art direction and the runtime).

from __future__ import annotations

import argparse
import math
import os
import sys

# -I (isolated mode) leaves this script's directory off sys.path; add it for the modules beside it.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import makehuman as mh  # noqa: E402


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mesh(name: str, verts: np.ndarray, faces: list[list[int]], uvs: np.ndarray | None = None, face_uvs: list[list[int]] | None = None) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces)
    if uvs is not None and face_uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        loop = 0
        data = layer.data
        for f in face_uvs:
            for t in f:
                data[loop].uv = uvs[t] if t >= 0 else (0.0, 0.0)
                loop += 1
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def sub_mesh(base: mh.BaseMesh, co_b: np.ndarray, vertex_ids: np.ndarray, name: str) -> tuple[bpy.types.Object, np.ndarray]:
    """A mesh made of the base mesh's faces whose vertices all lie in `vertex_ids` (keeps UVs); returns the old->new index map."""
    keep = np.zeros(len(co_b), dtype=bool)
    keep[vertex_ids] = True
    faces = [(f, t) for f, t in zip(base.faces, base.face_uvs) if all(keep[v] for v in f)]
    used = sorted({v for f, _ in faces for v in f})
    remap = -np.ones(len(co_b), dtype=np.int64)
    remap[used] = np.arange(len(used))
    ob = make_mesh(name, co_b[used], [[int(remap[v]) for v in f] for f, _ in faces], base.uvs, [t for _, t in faces])
    return ob, remap


def build_armature(base: mh.BaseMesh, co_b: np.ndarray, rig: dict, name: str = "Rig") -> bpy.types.Object:
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, spec in rig.items():
        eb = arm.edit_bones.new(bone_name)
        eb.head = Vector(mh.joint_position(base, co_b, spec["head"]))
        eb.tail = Vector(mh.joint_position(base, co_b, spec["tail"]))
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, 0.02))
        eb.roll = spec.get("roll", 0.0)
    for bone_name, spec in rig.items():
        parent = spec.get("parent")
        if parent:
            arm.edit_bones[bone_name].parent = arm.edit_bones[parent]
            arm.edit_bones[bone_name].use_connect = bool(spec.get("use_connect", False))
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def skin(ob: bpy.types.Object, rig_ob: bpy.types.Object, weights: dict[str, list[tuple[int, float]]], remap: np.ndarray) -> None:
    """Vertex groups from MakeHuman's weights (base-mesh vertex indices, remapped to this mesh)."""
    for bone, pairs in weights.items():
        vg = ob.vertex_groups.new(name=bone)
        for v, w in pairs:
            if v < len(remap) and remap[v] >= 0 and w > 1e-4:
                vg.add([int(remap[v])], w, "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig_ob
    ob.parent = rig_ob


def rigid_to_bone(ob: bpy.types.Object, rig_ob: bpy.types.Object, bone: str) -> None:
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig_ob
    ob.parent = rig_ob


def material(name: str, colour: tuple[float, float, float], roughness: float = 0.6, sheen: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    return mat


def srgb(hexstr: str) -> tuple[float, float, float]:
    """A '#RRGGBB' colour as linear RGB (Blender's base colour is linear)."""
    out = []
    for i in (1, 3, 5):
        c = int(hexstr[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2])


def preview(path: str, target: tuple[float, float, float] = (0, 0, 0.9), distance: float = 3.2, height: float = 1.0, yaw_deg: float = 0.0) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.resolution_x = 640
    scene.render.resolution_y = 800
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.85, 0.82, 0.78, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = 70
    yaw = math.radians(yaw_deg)
    cam.location = (target[0] + math.sin(yaw) * distance, target[1] - math.cos(yaw) * distance, target[2] + height - 0.9)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build_character(base: mh.BaseMesh, data: str, key: str, skin_size: int = 1024):
    import assemble
    import identities
    import outfits
    import skin as S

    spec = identities.CHARACTERS[key]
    c = assemble.Character(base, data, spec, identities.TEAM_PREVIEW)
    outfits.dress(c)
    outfits.hair(c)
    outfits.face_extras(c)
    outfits.accessories(c)
    outfits.prop(c)
    outfits.number(c)
    tex = S.paint_skin(base, c.co, c.skel, data, skin_size, spec["look"], c.paint)
    c.body(S.to_image(f"{key}-skin", tex))
    c.eyes(spec["look"]["iris"])
    return c


def place_newspaper(c, info: dict) -> None:
    """Holds the newspaper open between both hands in the reading pose (placed there, then carried by the right hand)."""
    from mathutils import Matrix

    old = [o for o in c.parts if o.name == "Prop_newspaper"]
    if not old:
        return
    for o in old:
        c.parts.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    rig = c.rig
    rig.animation_data.action = bpy.data.actions["read"]
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    pb = rig.pose.bones
    hl, hr = pb["hand_l"].head, pb["hand_r"].head
    head = pb["head"].head
    centre = (hl + hr) / 2 + Vector((0, -0.03, 0.06))
    side = (hl - hr).normalized()
    towards = (head - centre)
    towards = (towards - side * towards.dot(side)).normalized()
    up = side.cross(towards).normalized()
    if up.z < 0:
        up = -up
    world = Matrix.Translation(centre) @ Matrix((side, towards, up)).transposed().to_4x4()
    # Skinned to the right hand: put it where the right hand's reading pose carries it.
    rest = rig.data.bones["hand_r"].matrix_local
    posed = pb["hand_r"].matrix
    to_rest = rest @ posed.inverted() @ world
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    ob = bpy.context.active_object
    ob.name = "Prop_newspaper"
    ob.data.transform(to_rest @ Matrix.Rotation(math.radians(90), 4, "X") @ Matrix.Diagonal((0.36, 0.26, 1.0, 1.0)))
    ob.matrix_world = Matrix.Identity(4)
    ob.data.materials.append(c.mats.get("paper", "#E7E1D2", 0.9, double=True))
    rig.animation_data.action = None
    c.rigid(ob, "hand_r")


def merge_flat_materials(ob: bpy.types.Object) -> int:
    """Draws every plain-colour part of the body with one material, its colours in a vertex colour attribute.

    The game draws one call per material of every character; most of them (clothes, shoes, glasses, bangles,
    the number) are plain colours. Merging those leaves the textured ones (skin, hair, eyes) and "team" (tinted
    by the game): about 5 draw calls a character instead of 11-16. Returns the materials left.
    """
    me = ob.data
    flat = [i for i, m in enumerate(me.materials) if m is not None and m.name != "team" and not any(n.type == "TEX_IMAGE" for n in m.node_tree.nodes)]
    if len(flat) < 2:
        return len(me.materials)
    colour = {}
    rough = []
    for i in flat:
        bsdf = me.materials[i].node_tree.nodes["Principled BSDF"]
        colour[i] = tuple(bsdf.inputs["Base Color"].default_value)
        rough.append(bsdf.inputs["Roughness"].default_value)
    merged = bpy.data.materials.new("plain")
    merged.use_nodes = True
    nt = merged.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = float(sum(rough) / len(rough))
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.append(merged)
    target = len(me.materials) - 1
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    values = np.ones((len(me.loops), 4), dtype=np.float32)
    indices = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("material_index", indices)
    starts = np.zeros(len(me.polygons), dtype=np.int32)
    totals = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("loop_start", starts)
    me.polygons.foreach_get("loop_total", totals)
    for i, rgba in colour.items():
        for p in np.where(indices == i)[0]:
            values[starts[p] : starts[p] + totals[p]] = rgba
        indices[indices == i] = target
    col.data.foreach_set("color", values.ravel())
    me.color_attributes.active_color = col
    me.polygons.foreach_set("material_index", indices)
    me.update()
    # Drop the slots no face uses any more.
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.material_slot_remove_unused()
    return len(ob.data.materials)


def finish(c, key: str, out: str) -> dict:
    """Joins the parts (props stay separate, so the game can show or hide them) and exports the GLB."""
    props: dict[str, list] = {}
    rest = []
    for o in c.parts:
        if o.name.startswith("Prop_"):
            props.setdefault("_".join(o.name.split("_")[:2]), []).append(o)
        else:
            rest.append(o)
    groups = [("Character", rest)] + list(props.items())
    for name, objs in groups:
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        bpy.context.active_object.name = name
    materials = merge_flat_materials(bpy.data.objects["Character"])
    tris = {}
    for name, _ in groups:
        ob = bpy.data.objects[name]
        tris[name] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    path = os.path.join(out, f"{key}.raw.glb")
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_optimize_animation_size=True,
        export_frame_range=False,
        export_morph=False,
        export_image_format="WEBP",
        export_image_quality=82,
    )
    return {"triangles": tris, "materials": materials, "raw": os.path.basename(path)}


def main() -> None:
    import json

    ap = argparse.ArgumentParser()
    ap.add_argument("--mh", required=True, help="MPFB2 data directory (src/mpfb/data)")
    ap.add_argument("--cmu", required=True, help="CMU mocap BVH directory (cmu-mocap/data)")
    ap.add_argument("--out", required=True, help="where the raw GLBs and characters.json go")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--preview")
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
    import clips
    import identities

    base = mh.load_base_mesh(args.mh)
    os.makedirs(args.out, exist_ok=True)
    manifest_path = os.path.join(args.out, "characters.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {"characters": {}}
    for key in args.only or list(identities.CHARACTERS):
        reset_scene()
        c = build_character(base, args.mh, key, skin_size=512)
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            preview(os.path.join(args.preview, f"{key}-front.png"), distance=4.0, yaw_deg=25)
            head_z = c.skel.heads["head"][2] + 0.06
            preview(os.path.join(args.preview, f"{key}-face.png"), target=(0, 0, head_z), distance=0.8, height=0.95, yaw_deg=20)
        info = clips.bake_all(c.rig, args.cmu)
        place_newspaper(c, info)
        result = finish(c, key, args.out)
        spec = identities.CHARACTERS[key]
        manifest["characters"][key] = {
            "number": spec["number"],
            "role": spec["role"],
            "idle": spec["idle"],
            "prop": spec.get("prop"),
            "height": round(float(c.skel.tails["head"][2]), 3),
            "clips": info,
            **result,
        }
        print(f"{key}: {result['triangles']}")
    manifest["fps"] = 30
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)


if __name__ == "__main__":
    main()
    # Blender's module can crash while tearing down at interpreter exit; everything is written by now.
    sys.stdout.flush()
    os._exit(0)
