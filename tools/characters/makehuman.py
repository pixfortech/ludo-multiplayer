# MakeHuman data for the character build (pure Python + numpy; no Blender).
#
# Reads the CC0 assets of MakeHuman / MPFB2 (base mesh, targets, rig and
# weights; see tools/characters/README.md for where they come from and their
# licence) and shapes the base mesh into one person:
#
#   - macro targets (gender, age, muscle, weight, height, proportions and the
#     african / asian / caucasian blend), mixed the way MakeHuman's macro
#     modifiers mix them: each macro value splits between its two nearest
#     categories, and a target's weight is the product of its categories';
#   - detail targets (nose, mouth, eyes, chin, head, ...) by name and weight.
#
# Coordinates: MakeHuman's base mesh is Y-up in decimetres. Everything here
# returns metres, Z-up (Blender's convention), with the feet on z = 0.

from __future__ import annotations

import gzip
import json
import os
from dataclasses import dataclass, field

import numpy as np


@dataclass
class BaseMesh:
    coords: np.ndarray  # (V, 3) MakeHuman coordinates (Y-up, decimetres)
    uvs: np.ndarray  # (T, 2)
    faces: list[list[int]]  # vertex indices per face (quads and triangles)
    face_uvs: list[list[int]]  # uv indices per face
    groups: dict[str, list[tuple[int, int]]]  # vertex index ranges (inclusive) per named group

    def group_vertices(self, name: str) -> np.ndarray:
        idx: list[int] = []
        for lo, hi in self.groups[name]:
            idx.extend(range(lo, hi + 1))
        return np.array(idx, dtype=np.int64)


def load_base_mesh(data: str) -> BaseMesh:
    coords: list[list[float]] = []
    uvs: list[list[float]] = []
    faces: list[list[int]] = []
    face_uvs: list[list[int]] = []
    with open(os.path.join(data, "3dobjs", "base.obj"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("v "):
                coords.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("f "):
                vs, ts = [], []
                for part in line.split()[1:]:
                    bits = part.split("/")
                    vs.append(int(bits[0]) - 1)
                    ts.append(int(bits[1]) - 1 if len(bits) > 1 and bits[1] else -1)
                faces.append(vs)
                face_uvs.append(ts)
    with open(os.path.join(data, "mesh_metadata", "basemesh_vertex_groups.json"), encoding="utf-8") as f:
        groups = {k: [tuple(r) for r in v] for k, v in json.load(f).items()}
    return BaseMesh(np.array(coords, dtype=np.float64), np.array(uvs, dtype=np.float64), faces, face_uvs, groups)


_target_cache: dict[str, tuple[np.ndarray, np.ndarray]] = {}


def read_target(path: str) -> tuple[np.ndarray, np.ndarray]:
    """A .target(.gz) file: lines of 'vertex dx dy dz' (MakeHuman coordinates)."""
    if path in _target_cache:
        return _target_cache[path]
    opener = gzip.open if path.endswith(".gz") else open
    idx: list[int] = []
    off: list[list[float]] = []
    with opener(path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            bits = line.split()
            idx.append(int(bits[0]))
            off.append([float(bits[1]), float(bits[2]), float(bits[3])])
    result = (np.array(idx, dtype=np.int64), np.array(off, dtype=np.float64).reshape(-1, 3))
    _target_cache[path] = result
    return result


def _split(value: float, parts: list[tuple[float, float, str, str]]) -> dict[str, float]:
    """Splits a macro value between its two nearest categories (MakeHuman's macro.json 'parts')."""
    for lo, hi, low_name, high_name in parts:
        if lo <= value <= hi:
            t = (value - max(lo, 0.0)) / (min(hi, 1.0) - max(lo, 0.0))
            t = min(1.0, max(0.0, t))
            out = {low_name: 1.0 - t}
            out[high_name] = out.get(high_name, 0.0) + t
            return {k: v for k, v in out.items() if v > 1e-6}
    raise ValueError(value)


GENDER = [(0.0, 1.0, "female", "male")]
AGE = [(0.0, 0.1875, "baby", "child"), (0.1875, 0.5, "child", "young"), (0.5, 1.0, "young", "old")]
MUSCLE = [(0.0, 0.5, "minmuscle", "averagemuscle"), (0.5, 1.0, "averagemuscle", "maxmuscle")]
WEIGHT = [(0.0, 0.5, "minweight", "averageweight"), (0.5, 1.0, "averageweight", "maxweight")]


@dataclass
class Macro:
    gender: float = 0.5  # 0 female .. 1 male
    age: float = 0.5  # 0.5 = 25 years, 1.0 = 90 years (MakeHuman's scale)
    muscle: float = 0.5
    weight: float = 0.5
    height: float = 0.5
    proportions: float = 0.5  # 0.5 average, 1 ideal, 0 uncommon
    african: float = 1 / 3
    asian: float = 1 / 3
    caucasian: float = 1 / 3


def macro_targets(m: Macro) -> list[tuple[str, float]]:
    """(relative target path, weight) for a set of macro values."""
    g = _split(m.gender, GENDER)
    a = _split(m.age, AGE)
    mu = _split(m.muscle, MUSCLE)
    w = _split(m.weight, WEIGHT)
    out: list[tuple[str, float]] = []
    for gn, gw in g.items():
        for an, aw in a.items():
            for mn, mw in mu.items():
                for wn, ww in w.items():
                    k = gw * aw * mw * ww
                    out.append((f"macrodetails/universal-{gn}-{an}-{mn}-{wn}.target.gz", k))
                    if m.height > 0.5:
                        out.append((f"macrodetails/height/{gn}-{an}-{mn}-{wn}-maxheight.target.gz", k * (m.height - 0.5) * 2))
                    elif m.height < 0.5:
                        out.append((f"macrodetails/height/{gn}-{an}-{mn}-{wn}-minheight.target.gz", k * (0.5 - m.height) * 2))
                    if an != "baby":
                        if m.proportions > 0.5:
                            out.append((f"macrodetails/proportions/{gn}-{an}-{mn}-{wn}-idealproportions.target.gz", k * (m.proportions - 0.5) * 2))
                        elif m.proportions < 0.5:
                            out.append((f"macrodetails/proportions/{gn}-{an}-{mn}-{wn}-uncommonproportions.target.gz", k * (0.5 - m.proportions) * 2))
            races = {"african": m.african, "asian": m.asian, "caucasian": m.caucasian}
            total = sum(races.values()) or 1.0
            for rn, rw in races.items():
                if rw > 0:
                    out.append((f"macrodetails/{rn}-{gn}-{an}.target.gz", gw * aw * rw / total))
    return [(p, k) for p, k in out if k > 1e-6]


@dataclass
class Person:
    macro: Macro
    # Detail targets: path relative to targets/ (without .target.gz) -> weight 0..1.
    details: dict[str, float] = field(default_factory=dict)


def shape(base: BaseMesh, data: str, person: Person) -> np.ndarray:
    """The base mesh's coordinates with the person's targets applied (MakeHuman coordinates)."""
    co = base.coords.copy()
    targets = macro_targets(person.macro) + [(f"{name}.target.gz", w) for name, w in person.details.items()]
    for rel, weight in targets:
        idx, off = read_target(os.path.join(data, "targets", rel))
        co[idx] += off * weight
    return co


def expression_target(data: str, unit: str, race_mix: dict[str, float]) -> tuple[np.ndarray, np.ndarray]:
    """An expression unit (e.g. 'eye-left-closure') as a dense offset, blended over the three races."""
    acc: dict[int, np.ndarray] = {}
    total = sum(race_mix.values()) or 1.0
    for race, w in race_mix.items():
        if w <= 0:
            continue
        idx, off = read_target(os.path.join(data, "targets", "expression", "units", race, f"{unit}.target.gz"))
        for i, o in zip(idx, off):
            acc[int(i)] = acc.get(int(i), np.zeros(3)) + o * (w / total)
    idx = np.array(sorted(acc), dtype=np.int64)
    return idx, np.array([acc[i] for i in idx]) if len(idx) else np.zeros((0, 3))


def to_blender(co: np.ndarray) -> np.ndarray:
    """MakeHuman (Y-up, dm) -> Blender (Z-up, m)."""
    return np.stack([co[:, 0], -co[:, 2], co[:, 1]], axis=1) * 0.1


def load_rig(data: str, name: str = "game_engine") -> dict:
    with open(os.path.join(data, "rigs", "standard", f"rig.{name}.json"), encoding="utf-8") as f:
        return json.load(f)


def load_weights(data: str, name: str = "game_engine") -> dict[str, list[tuple[int, float]]]:
    with open(os.path.join(data, "rigs", "standard", f"weights.{name}.json"), encoding="utf-8") as f:
        return {b: [(int(v), float(w)) for v, w in pairs] for b, pairs in json.load(f)["weights"].items()}


def joint_position(base: BaseMesh, co_b: np.ndarray, spec: dict) -> np.ndarray:
    """A bone end in Blender coordinates: the centre of a joint cube, or the mean of listed vertices."""
    if spec["strategy"] == "CUBE":
        return co_b[base.group_vertices(spec["cube_name"])].mean(axis=0)
    if spec["strategy"] == "MEAN":
        return co_b[np.array(spec["vertex_indices"], dtype=np.int64)].mean(axis=0)
    raise ValueError(spec["strategy"])
