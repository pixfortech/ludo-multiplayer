# Clothes, hair and accessories for the characters, built on the shaped body.
#
# A garment is a shell of the body: the body's own faces (or MakeHuman's skirt
# and tights helper geometry) pushed out along the normals by the cloth's
# thickness. Because a shell vertex *is* a base-mesh vertex, it keeps that
# vertex's UVs and skin weights, so clothes bend exactly with the body. Body
# faces fully covered by a garment are removed (no poke-through, fewer
# triangles). Regions are chosen with the skeleton: which bone a vertex mostly
# follows, and how far along that bone it lies.

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

import makehuman as mh


@dataclass
class Skeleton:
    heads: dict[str, np.ndarray]
    tails: dict[str, np.ndarray]

    @staticmethod
    def from_rig(base: mh.BaseMesh, co_b: np.ndarray, rig: dict) -> "Skeleton":
        return Skeleton(
            {b: mh.joint_position(base, co_b, s["head"]) for b, s in rig.items()},
            {b: mh.joint_position(base, co_b, s["tail"]) for b, s in rig.items()},
        )

    def along(self, p: np.ndarray, bone: str) -> np.ndarray:
        """0 at the bone's head, 1 at its tail (projection of points p onto the bone)."""
        a, b = self.heads[bone], self.tails[bone]
        d = b - a
        return ((p - a) @ d) / max(1e-9, d @ d)

    def radial(self, p: np.ndarray, bone: str) -> np.ndarray:
        """Unit vectors from the bone's axis out to points p."""
        a, b = self.heads[bone], self.tails[bone]
        d = (b - a) / max(1e-9, np.linalg.norm(b - a))
        rel = p - a
        perp = rel - np.outer(rel @ d, d)
        return perp / np.maximum(1e-9, np.linalg.norm(perp, axis=1))[:, None]


def vertex_normals(co: np.ndarray, faces: list[list[int]]) -> np.ndarray:
    n = np.zeros_like(co)
    for f in faces:
        p = co[f]
        for i in range(1, len(f) - 1):
            fn = np.cross(p[i] - p[0], p[i + 1] - p[0])  # area-weighted
            n[f[0]] += fn
            n[f[i]] += fn
            n[f[i + 1]] += fn
    return n / np.maximum(1e-12, np.linalg.norm(n, axis=1))[:, None]


def dominant_bones(weights: dict[str, list[tuple[int, float]]], count: int) -> list[str]:
    best = [("", 0.0)] * count
    for bone, pairs in weights.items():
        for v, w in pairs:
            if v < count and w > best[v][1]:
                best[v] = (bone, w)
    return [b for b, _ in best]


@dataclass
class Shell:
    """A piece of a character: base-mesh faces, per-vertex positions, and a material per face."""

    name: str
    faces: list[int]  # indices into base.faces
    positions: dict[int, np.ndarray]  # base vertex index -> position (only the vertices used)
    materials: list[str]  # material name per face
    cover_body: bool = True  # hide the body faces this garment covers


def boundary_rings(base: mh.BaseMesh, face_ids: list[int]) -> tuple[set[int], set[int]]:
    """The vertices on the open edge of a set of faces, and the ring just inside it."""
    count: dict[tuple[int, int], int] = {}
    for fi in face_ids:
        f = base.faces[fi]
        for i in range(len(f)):
            e = (min(f[i], f[(i + 1) % len(f)]), max(f[i], f[(i + 1) % len(f)]))
            count[e] = count.get(e, 0) + 1
    edge = {v for e, n in count.items() if n == 1 for v in e}
    ring: set[int] = set()
    for fi in face_ids:
        f = base.faces[fi]
        if any(v in edge for v in f):
            ring.update(v for v in f if v not in edge)
    return edge, ring


def shell(base: mh.BaseMesh, co: np.ndarray, normals: np.ndarray, face_ids: list[int], thickness: Callable[[np.ndarray], np.ndarray], name: str, material: Callable[[np.ndarray], str] | str, cover_body: bool = True, taper: float = 0.18) -> Shell:
    used = sorted({v for fi in face_ids for v in base.faces[fi]})
    idx = np.array(used, dtype=np.int64)
    t = thickness(idx)
    if taper < 1:
        # Edges lie down onto the skin (no gap at collars, cuffs and hairlines).
        edge, ring = boundary_rings(base, face_ids)
        t = t * np.array([taper if v in edge else (0.55 if v in ring else 1.0) for v in used])
    pos = co[idx] + normals[idx] * t[:, None]
    mats = []
    for fi in face_ids:
        if isinstance(material, str):
            mats.append(material)
        else:
            mats.append(material(np.array(base.faces[fi], dtype=np.int64)))
    return Shell(name, list(face_ids), {int(v): p for v, p in zip(idx, pos)}, mats, cover_body)


def faces_where(base: mh.BaseMesh, vertex_mask: np.ndarray, within: tuple[int, int] | None = None, all_vertices: bool = True) -> list[int]:
    """Faces whose vertices pass the mask (all of them, or any), optionally only faces in a vertex range."""
    out = []
    for fi, f in enumerate(base.faces):
        if within and not (within[0] <= f[0] <= within[1]):
            continue
        ok = all(vertex_mask[v] for v in f) if all_vertices else any(vertex_mask[v] for v in f)
        if ok:
            out.append(fi)
    return out


class Regions:
    """Per-vertex region tests on the shaped base mesh."""

    def __init__(self, base: mh.BaseMesh, co: np.ndarray, skel: Skeleton, dominant: list[str]):
        self.base, self.co, self.skel = base, co, skel
        self.dom = np.array(dominant)
        self.n = len(co)
        self.body = np.zeros(self.n, dtype=bool)
        self.body[base.group_vertices("body")] = True

    def bones(self, *names: str) -> np.ndarray:
        return np.isin(self.dom, names) & self.body

    def along(self, bone: str) -> np.ndarray:
        return self.skel.along(self.co, bone)

    def side(self, *bones_lr: str) -> tuple[list[str], list[str]]:
        return [f"{b}_l" for b in bones_lr], [f"{b}_r" for b in bones_lr]

    # Common pieces -------------------------------------------------------
    def torso(self, neck_drop: float = 0.02, v_neck: float = 0.0) -> np.ndarray:
        m = self.bones("pelvis", "spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "neck_01")
        neck_base = self.skel.heads["neck_01"][2]
        z = self.co[:, 2]
        m &= z < neck_base - neck_drop + 0.035
        if v_neck > 0:
            front = self.co[:, 1] < self.skel.heads["neck_01"][1] - 0.02
            depth = (neck_base - z)
            m &= ~(front & (np.abs(self.co[:, 0]) < np.maximum(0.0, v_neck - depth * 0.9)) & (depth < v_neck * 1.6))
        return m

    def arm(self, upper_to: float = 1.0, lower_to: float = 0.0) -> np.ndarray:
        """Sleeves: the upper arm down to `upper_to` (0..1) and the forearm down to `lower_to`."""
        m = np.zeros(self.n, dtype=bool)
        for s in ("l", "r"):
            # Past the elbow when the forearm is covered too (vertices around a joint project beyond the bone's end).
            m |= self.bones(f"upperarm_{s}") & (self.along(f"upperarm_{s}") <= (1.3 if lower_to > 0 else upper_to))
            if lower_to > 0:
                m |= self.bones(f"lowerarm_{s}") & (self.along(f"lowerarm_{s}") >= -0.3) & (self.along(f"lowerarm_{s}") <= lower_to)
        return m

    def legs(self, thigh_to: float = 1.0, calf_to: float = 0.0) -> np.ndarray:
        m = np.zeros(self.n, dtype=bool)
        for s in ("l", "r"):
            m |= self.bones(f"thigh_{s}") & (self.along(f"thigh_{s}") <= (1.3 if calf_to > 0 else thigh_to))
            if calf_to > 0:
                m |= self.bones(f"calf_{s}") & (self.along(f"calf_{s}") >= -0.3) & (self.along(f"calf_{s}") <= calf_to)
        hips = self.bones("pelvis") & (self.co[:, 2] < self.skel.heads["pelvis"][2] + 0.02)
        return m | hips

    def feet(self, ankle: float = 0.95) -> np.ndarray:
        m = self.bones("foot_l", "foot_r", "ball_l", "ball_r")
        for s in ("l", "r"):
            m |= self.bones(f"calf_{s}") & (self.along(f"calf_{s}") > ankle)
        return m
