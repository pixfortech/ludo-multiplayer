# Assembles one character: shaped body, skin, eyes, hair, clothes,
# accessories, prop and number, rigged to the shared game skeleton.
#
# Every part is a Blender mesh skinned to the same armature. Parts made from
# base-mesh vertices (body, garments, hair, moustache) take their weights from
# MakeHuman's weights by vertex index; rigid parts (glasses, bangles, props)
# follow one bone.

from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

import garments as G
import makehuman as mh
import skin as S


def srgb(hexstr: str) -> tuple[float, float, float]:
    out = []
    for i in (1, 3, 5):
        c = int(hexstr[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2])


class Materials:
    def __init__(self, prefix: str):
        self.prefix = prefix
        self.cache: dict[str, bpy.types.Material] = {}

    def get(self, name: str, colour: str = "#808080", roughness: float = 0.6, metallic: float = 0.0, sheen: float = 0.0, image=None, double: bool = False) -> bpy.types.Material:
        if name in self.cache:
            return self.cache[name]
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mat.use_backface_culling = not double
        nt = mat.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*srgb(colour), 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if sheen:
            bsdf.inputs["Sheen Weight"].default_value = sheen
        if image is not None:
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = image
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        self.cache[name] = mat
        return mat


def mesh_from(name: str, verts: np.ndarray, faces: list[list[int]], uvs: list[list[tuple[float, float]]] | None, face_mats: list[int], mats: list[bpy.types.Material], smooth: bool = True) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces)
    for m in mats:
        me.materials.append(m)
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        loop = 0
        for f in uvs:
            for uv in f:
                layer.data[loop].uv = uv
                loop += 1
    for p, mi in zip(me.polygons, face_mats):
        p.material_index = mi
        p.use_smooth = smooth
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def skin_object(ob: bpy.types.Object, rig: bpy.types.Object, groups: dict[str, list[tuple[int, float]]]) -> None:
    for bone, pairs in groups.items():
        vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
        for v, w in pairs:
            vg.add([v], w, "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    ob.parent = rig


class Character:
    """Builds the parts of one character into Blender objects."""

    def __init__(self, base: mh.BaseMesh, data: str, spec: dict, team_preview: str):
        self.base, self.data, self.spec = base, data, spec
        co = mh.shape(base, data, spec["person"])
        co_b = mh.to_blender(co)
        co_b[:, 2] -= co_b[base.group_vertices("body"), 2].min()
        self.co = co_b
        self.rig_spec = mh.load_rig(data)
        self.weights = mh.load_weights(data)
        self.skel = G.Skeleton.from_rig(base, co_b, self.rig_spec)
        self.dom = G.dominant_bones(self.weights, len(co_b))
        self.normals = G.vertex_normals(co_b, base.faces)
        self.reg = G.Regions(base, co_b, self.skel, self.dom)
        self.mats = Materials(spec["role"])
        self.team = team_preview
        self.parts: list[bpy.types.Object] = []
        # base vertex -> [(bone, w)]
        self.vweights: dict[int, list[tuple[str, float]]] = {}
        for bone, pairs in self.weights.items():
            for v, w in pairs:
                if w > 1e-4:
                    self.vweights.setdefault(v, []).append((bone, w))
        # The skirt helper follows both legs equally (a skirt swings between the legs instead of splitting).
        lo, hi = base.groups["helper-skirt"][0]
        for v in range(lo, hi + 1):
            w = dict(self.vweights.get(v, []))
            for a, b in (("thigh_l", "thigh_r"), ("calf_l", "calf_r")):
                if a in w or b in w:
                    avg = (w.get(a, 0.0) + w.get(b, 0.0)) / 2
                    w[a] = w[b] = avg
            self.vweights[v] = list(w.items())
        self.covered = np.zeros(len(base.faces), dtype=bool)
        # Layers the outfit paints into the skin texture (hair, moustache): per-vertex values and a colour.
        self.paint: list[dict] = []
        self.textured_with_skin: list[str] = []
        self.rig = self._armature()

    # Skeleton --------------------------------------------------------------
    def _armature(self) -> bpy.types.Object:
        arm = bpy.data.armatures.new("Rig")
        ob = bpy.data.objects.new("Rig", arm)
        bpy.context.scene.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode="EDIT")
        for name, spec in self.rig_spec.items():
            eb = arm.edit_bones.new(name)
            eb.head = Vector(self.skel.heads[name])
            eb.tail = Vector(self.skel.tails[name])
            if (eb.tail - eb.head).length < 1e-4:
                eb.tail = eb.head + Vector((0, 0, 0.02))
            eb.roll = spec.get("roll", 0.0)
        for name, spec in self.rig_spec.items():
            if spec.get("parent"):
                arm.edit_bones[name].parent = arm.edit_bones[spec["parent"]]
                arm.edit_bones[name].use_connect = bool(spec.get("use_connect", False))
        bpy.ops.object.mode_set(mode="OBJECT")
        return ob

    # Parts from base-mesh faces ---------------------------------------------
    def add_shell(self, sh: G.Shell, materials: dict[str, bpy.types.Material], smooth: bool = True) -> bpy.types.Object:
        used = sorted(sh.positions)
        remap = {v: i for i, v in enumerate(used)}
        verts = np.array([sh.positions[v] for v in used])
        faces = [[remap[v] for v in self.base.faces[fi]] for fi in sh.faces]
        uvs = [[tuple(self.base.uvs[t]) if t >= 0 else (0.0, 0.0) for t in self.base.face_uvs[fi]] for fi in sh.faces]
        names = sorted(set(sh.materials))
        order = {n: i for i, n in enumerate(names)}
        ob = mesh_from(sh.name, verts, faces, uvs, [order[m] for m in sh.materials], [materials[n] for n in names], smooth)
        groups: dict[str, list[tuple[int, float]]] = {}
        for v in used:
            for bone, w in self.vweights.get(v, []):
                groups.setdefault(bone, []).append((remap[v], w))
        skin_object(ob, self.rig, groups)
        if sh.cover_body:
            covered_vertices = set(used)
            for fi, f in enumerate(self.base.faces):
                if f[0] < 13380 and all(v in covered_vertices for v in f):
                    self.covered[fi] = True
        self.parts.append(ob)
        return ob

    def rigid(self, ob: bpy.types.Object, bone: str) -> bpy.types.Object:
        vg = ob.vertex_groups.new(name=bone)
        vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = self.rig
        ob.parent = self.rig
        self.parts.append(ob)
        return ob

    def primitive(self, kind: str, name: str, mat: bpy.types.Material, bone: str, matrix: Matrix, **kw) -> bpy.types.Object:
        """A primitive mesh (torus, cylinder, sphere, cube) placed by `matrix`, following one bone."""
        if kind == "torus":
            bpy.ops.mesh.primitive_torus_add(major_radius=kw.get("major", 0.03), minor_radius=kw.get("minor", 0.004), major_segments=kw.get("segments", 20), minor_segments=kw.get("minor_segments", 6))
        elif kind == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(radius=kw.get("radius", 0.02), depth=kw.get("depth", 0.05), vertices=kw.get("segments", 14))
        elif kind == "cone":
            bpy.ops.mesh.primitive_cone_add(radius1=kw.get("r1", 0.02), radius2=kw.get("r2", 0.015), depth=kw.get("depth", 0.05), vertices=kw.get("segments", 14))
        elif kind == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(radius=kw.get("radius", 0.02), segments=kw.get("segments", 16), ring_count=kw.get("rings", 8))
        elif kind == "cube":
            bpy.ops.mesh.primitive_cube_add(size=1.0)
        ob = bpy.context.active_object
        ob.name = name
        ob.data.transform(matrix @ Matrix.Diagonal((*kw.get("scale", (1, 1, 1)), 1.0)))
        ob.matrix_world = Matrix.Identity(4)
        ob.data.materials.append(mat)
        for p in ob.data.polygons:
            p.use_smooth = kw.get("smooth", True)
        return self.rigid(ob, bone)

    # The body ---------------------------------------------------------------
    def body(self, skin_image) -> None:
        mat = self.mats.get("skin", "#FFFFFF", 0.55, image=skin_image)
        for name in self.textured_with_skin:
            m = self.mats.cache[name]
            tex = m.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = skin_image
            m.node_tree.links.new(tex.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
        faces = [fi for fi, f in enumerate(self.base.faces) if f[0] < 13380 and all(v < 13380 for v in f) and not self.covered[fi]]
        sh = G.Shell("Body", faces, {v: self.co[v] for fi in faces for v in self.base.faces[fi]}, ["skin"] * len(faces), cover_body=False)
        self.add_shell(sh, {"skin": mat})

    def eyes(self, iris: str) -> None:
        img = S.to_image(f"{self.spec['role']}-eye", S.paint_eye(128, iris))
        mat = self.mats.get("eye", "#FFFFFF", 0.15, image=img)
        for side in ("l", "r"):
            pts = self.co[self.base.group_vertices(f"helper-{side}-eye")]
            c = pts.mean(axis=0)
            r = np.linalg.norm(pts - c, axis=1).max() * 0.97
            # UV sphere with its +Z pole (the iris, v = 1) turned to face forward (-Y).
            m = Matrix.Translation(Vector(c)) @ Matrix.Rotation(math.radians(90), 4, "X")
            self.primitive("sphere", f"Eye_{side}", mat, "head", m, radius=r, segments=20, rings=12)
        lash = self.mats.get("lash", "#140F0C", 0.7, double=True)
        for side in ("l", "r"):
            for part in ("1", "2"):
                ids = self.base.group_vertices(f"helper-{side}-eyelashes-{part}")
                mask = np.zeros(len(self.co), dtype=bool)
                mask[ids] = True
                faces = G.faces_where(self.base, mask)
                if faces:
                    sh = G.Shell(f"Lash_{side}{part}", faces, {int(v): self.co[v] for v in ids}, ["lash"] * len(faces), cover_body=False)
                    self.add_shell(sh, {"lash": lash})
        teeth = self.mats.get("teeth", "#E9E2D2", 0.35)
        for part in ("upper", "lower"):
            ids = self.base.group_vertices(f"helper-{part}-teeth")
            mask = np.zeros(len(self.co), dtype=bool)
            mask[ids] = True
            faces = G.faces_where(self.base, mask)
            sh = G.Shell(f"Teeth_{part}", faces, {int(v): self.co[v] for v in ids}, ["teeth"] * len(faces), cover_body=False)
            self.add_shell(sh, {"teeth": teeth})

    # Pieces made from regions -------------------------------------------------
    def region_shell(self, name: str, vmask: np.ndarray, thickness, material, mats: dict, within=(0, 13379), cover: bool = True, all_vertices: bool = True, taper: float = 0.18) -> bpy.types.Object | None:
        faces = G.faces_where(self.base, vmask, within, all_vertices)
        if not faces:
            return None
        sh = G.shell(self.base, self.co, self.normals, faces, thickness if callable(thickness) else (lambda idx, t=thickness: np.full(len(idx), t)), name, material, cover, taper)
        return self.add_shell(sh, mats)

    def ribbon(self, name: str, points: list[Vector], width: float, offset: float, mat: bpy.types.Material, samples: int = 40, segments_across: int = 4) -> bpy.types.Object:
        """Cloth draped along a path over the body: the path is projected onto the skin and lifted by `offset`."""
        from mathutils.kdtree import KDTree

        body_ids = self.base.group_vertices("body")
        tree = KDTree(len(body_ids))
        for i, v in enumerate(body_ids):
            tree.insert(Vector(self.co[v]), i)
        tree.balance()
        # Catmull-Rom through the control points.
        pts = [points[0]] + points + [points[-1]]
        path = []
        for k in range(1, len(pts) - 2):
            p0, p1, p2, p3 = pts[k - 1], pts[k], pts[k + 1], pts[k + 2]
            for j in range(samples // (len(points) - 1)):
                t = j / (samples // (len(points) - 1))
                path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
        path.append(points[-1])
        verts, vw = [], []
        rows = []
        # Surface points and normals under the path, smoothed along it (the skin's normals are noisy).
        surf, norms = [], []
        for p in path:
            near = tree.find_n(p, 6)
            w = [1 / max(1e-4, d) for _, _, d in near]
            sp = sum((Vector(self.co[int(body_ids[i])]) * wi for (_, i, _), wi in zip(near, w)), Vector()) / sum(w)
            sn = sum((Vector(self.normals[int(body_ids[i])]) * wi for (_, i, _), wi in zip(near, w)), Vector()).normalized()
            surf.append(sp)
            norms.append(sn)
        for _ in range(4):
            surf = [surf[0]] + [(surf[i - 1] + surf[i] * 2 + surf[i + 1]) / 4 for i in range(1, len(surf) - 1)] + [surf[-1]]
            norms = [norms[0]] + [(norms[i - 1] + norms[i] * 2 + norms[i + 1]).normalized() for i in range(1, len(norms) - 1)] + [norms[-1]]
        prev_side = None
        for i, p in enumerate(path):
            n = norms[i]
            centre = surf[i] + n * offset
            tangent = (surf[min(i + 1, len(surf) - 1)] - surf[max(i - 1, 0)]).normalized()
            side = n.cross(tangent).normalized()
            if prev_side is not None and side.dot(prev_side) < 0:
                side = -side
            prev_side = side
            row = []
            for a in range(segments_across + 1):
                u = a / segments_across - 0.5
                q = centre + side * (u * width)
                # Keep each point of the cloth above the skin under it.
                _, nj, _ = tree.find(q)
                vj = int(body_ids[nj])
                depth = (q - Vector(self.co[vj])).dot(n)
                if depth < offset:
                    q = q + n * (offset - depth)
                row.append(len(verts))
                verts.append(q)
                vw.append(vj)
            rows.append(row)
        faces = [[rows[i][a], rows[i][a + 1], rows[i + 1][a + 1], rows[i + 1][a]] for i in range(len(rows) - 1) for a in range(segments_across)]
        uvs = [[(a / segments_across, i / len(rows)), ((a + 1) / segments_across, i / len(rows)), ((a + 1) / segments_across, (i + 1) / len(rows)), (a / segments_across, (i + 1) / len(rows))] for i in range(len(rows) - 1) for a in range(segments_across)]
        ob = mesh_from(name, np.array([tuple(v) for v in verts]), faces, uvs, [0] * len(faces), [mat])
        groups: dict[str, list[tuple[int, float]]] = {}
        for i, v in enumerate(vw):
            for bone, w in self.vweights.get(v, []):
                groups.setdefault(bone, []).append((i, w))
        skin_object(ob, self.rig, groups)
        self.parts.append(ob)
        return ob

    def skirt(self, name: str, length_z: float, flare: float, mat_name: str, mats: dict, hem: tuple[float, str] | None = None) -> bpy.types.Object:
        """The skirt helper, cut at height `length_z` (from the ground), flared outward toward the hem."""
        lo, hi = self.base.groups["helper-skirt"][0]
        ids = np.arange(lo, hi + 1)
        mask = np.zeros(len(self.co), dtype=bool)
        mask[ids] = self.co[ids, 2] >= length_z
        faces = G.faces_where(self.base, mask, (lo, hi))
        top = self.co[ids, 2].max()

        def thick(idx: np.ndarray) -> np.ndarray:
            depth = np.clip((top - self.co[idx, 2]) / max(1e-6, top - length_z), 0, 1)
            return 0.004 + flare * depth**1.5

        def material(face: np.ndarray) -> str:
            if hem and self.co[face, 2].min() < length_z + hem[0]:
                return hem[1]
            return mat_name

        sh = G.shell(self.base, self.co, self.normals, faces, thick, name, material, cover_body=False)
        return self.add_shell(sh, mats)
