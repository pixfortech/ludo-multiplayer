# Skin and eye textures, painted in the base mesh's UV layout.
#
# The face, lip and eyelid masks are MakeHuman/MPFB's CC0 textures (they are
# already in the base mesh's UV space). Brows, stubble and beard shading are
# painted here: the face's 3D surface is measured (distance from the brow
# line, from the mouth and the jaw), and those values are rasterised into UV
# space triangle by triangle.

from __future__ import annotations

import os

import numpy as np

import makehuman as mh


def load_mask(path: str, size: int) -> np.ndarray:
    """A greyscale mask (0..1) at size x size, rows from the bottom (UV v = 0) up."""
    import bpy

    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, img.channels)[..., 0]
    bpy.data.images.remove(img)
    ys = (np.arange(size) + 0.5) / size * h
    xs = (np.arange(size) + 0.5) / size * w
    return px[ys.astype(int).clip(0, h - 1)][:, xs.astype(int).clip(0, w - 1)]


def rasterize(base: mh.BaseMesh, face_ids: list[int], values: np.ndarray, size: int) -> np.ndarray:
    """Per-vertex values (by base vertex index) painted into UV space; 0 elsewhere. Rows from v = 0 up."""
    out = np.zeros((size, size), dtype=np.float32)
    for fi in face_ids:
        f = base.faces[fi]
        t = base.face_uvs[fi]
        if min(t) < 0:
            continue
        for i in range(1, len(f) - 1):
            tri = (0, i, i + 1)
            uv = base.uvs[[t[j] for j in tri]] * size
            val = values[[f[j] for j in tri]]
            if val.max() <= 0:
                continue
            lo = np.floor(uv.min(axis=0)).astype(int).clip(0, size - 1)
            hi = np.ceil(uv.max(axis=0)).astype(int).clip(0, size - 1)
            xs, ys = np.meshgrid(np.arange(lo[0], hi[0] + 1) + 0.5, np.arange(lo[1], hi[1] + 1) + 0.5)
            p = np.stack([xs.ravel(), ys.ravel()], axis=1)
            a, b, c = uv
            v0, v1, v2 = b - a, c - a, p - a
            d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
            d20, d21 = v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01
            if abs(den) < 1e-12:
                continue
            wb = (d11 * d20 - d01 * d21) / den
            wc = (d00 * d21 - d01 * d20) / den
            wa = 1 - wb - wc
            inside = (wa >= -1e-4) & (wb >= -1e-4) & (wc >= -1e-4)
            vals = wa * val[0] + wb * val[1] + wc * val[2]
            px = p[inside].astype(int)
            out[px[:, 1].clip(0, size - 1), px[:, 0].clip(0, size - 1)] = np.maximum(out[px[:, 1].clip(0, size - 1), px[:, 0].clip(0, size - 1)], vals[inside])
    return out


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blur(img: np.ndarray, r: int = 2) -> np.ndarray:
    out = img.copy()
    for axis in (0, 1):
        acc = np.zeros_like(out)
        for d in range(-r, r + 1):
            acc += np.roll(out, d, axis=axis)
        out = acc / (2 * r + 1)
    return out


def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)


def paint_skin(base: mh.BaseMesh, co: np.ndarray, skel, data: str, size: int, look: dict, layers: list[dict] | None = None) -> np.ndarray:
    """RGB (size x size x 3, sRGB 0..1, rows from v = 0) skin texture for one person."""
    tex_dir = os.path.join(data, "textures")
    tone = hex_rgb(look["skin"])
    img = np.ones((size, size, 3), dtype=np.float32) * tone
    rng = np.random.default_rng(look.get("seed", 1))
    # A little low-frequency mottling so the skin is not flat plastic.
    noise = blur(rng.normal(0, 1, (size, size)).astype(np.float32), 6)
    noise /= max(1e-6, np.abs(noise).max())
    img *= 1 + noise[..., None] * 0.035
    face = blur(load_mask(os.path.join(tex_dir, "mpfb_face.jpg"), size), 2)
    lips = blur(load_mask(os.path.join(tex_dir, "mpfb_lips.jpg"), size), 1)
    lids = blur(load_mask(os.path.join(tex_dir, "mpfb_eyelids.jpg"), size), 1)
    # Warmer cheeks, then lips and lids.
    img = img * (1 - face[..., None] * 0.05) + face[..., None] * 0.05 * hex_rgb(look.get("blush", "#B9706A"))
    img = img * (1 - lips[..., None] * look.get("lip_strength", 0.55)) + lips[..., None] * look.get("lip_strength", 0.55) * hex_rgb(look["lips"])
    img *= 1 - lids[..., None] * look.get("lid_shadow", 0.22)

    # Brows (and optional stubble), measured on the face.
    head_ids = base.group_vertices("body")
    head_faces = [fi for fi, f in enumerate(base.faces) if f[0] < 13380 and co[f[0], 2] > skel.heads["neck_01"][2]]
    values = np.zeros(len(co), dtype=np.float32)
    eye_l = co[base.group_vertices("helper-l-eye")].mean(axis=0)
    eye_r = co[base.group_vertices("helper-r-eye")].mean(axis=0)
    eye_radius = np.linalg.norm(co[base.group_vertices("helper-l-eye")] - eye_l, axis=1).max()
    brow = np.zeros(len(co), dtype=np.float32)
    for eye, sign in ((eye_l, 1), (eye_r, -1)):
        dx = (co[:, 0] - eye[0]) * sign  # outward from the face's middle
        # From just inside the eye's inner corner (u = 0) to past its outer corner (u = 1).
        u = (dx + eye_radius * 1.15) / (eye_radius * 2.55)
        arch = look.get("brow_arch", 0.35)
        line_z = eye[2] + eye_radius * (1.12 + arch * np.sin(np.clip(u, 0, 1) * np.pi) * 0.35) - np.clip(u - 0.7, 0, 1) * eye_radius * 0.6
        half = eye_radius * look.get("brow_thickness", 0.45) * (0.42 - 0.22 * np.clip(u, 0, 1))
        dz = np.abs(co[:, 2] - line_z)
        front = co[:, 1] < eye[1] + eye_radius * 0.6
        ends = smoothstep(-0.05, 0.08, u) * (1 - smoothstep(0.92, 1.05, u))
        b = (1 - smoothstep(half * 0.6, half, dz)) * ends * front
        brow = np.maximum(brow, b.astype(np.float32))
    values[head_ids] = brow[head_ids]
    brow_tex = blur(rasterize(base, head_faces, values, size), 1)
    img = img * (1 - brow_tex[..., None] * look.get("brow_strength", 0.85)) + brow_tex[..., None] * look.get("brow_strength", 0.85) * hex_rgb(look["brow"])

    if look.get("stubble", 0) > 0:
        jaw = skel.heads["head"]
        mouth_z = (co[base.group_vertices("helper-upper-teeth")].mean(axis=0))[2]
        chin_zone = (co[:, 2] < mouth_z + 0.02) & (co[:, 2] > skel.heads["neck_01"][2] + 0.01) & (co[:, 1] < jaw[1] + 0.02)
        s = chin_zone.astype(np.float32) * look["stubble"]
        values = np.zeros(len(co), dtype=np.float32)
        values[head_ids] = s[head_ids]
        st = blur(rasterize(base, head_faces, values, size), 3)
        grain = (rng.random((size, size)) > 0.45).astype(np.float32)
        img = img * (1 - (st * grain)[..., None] * 0.35) + (st * grain)[..., None] * 0.35 * hex_rgb(look.get("stubble_colour", look["brow"]))
    # Layers painted by the outfit: hair on the scalp, a moustache.
    all_faces = [fi for fi, f in enumerate(base.faces) if f[0] < 13380 and all(v < 13380 for v in f)]
    for layer in layers or []:
        values = np.zeros(len(co), dtype=np.float32)
        values[: len(layer["values"])] = layer["values"]
        m = blur(rasterize(base, all_faces, values, size), layer.get("blur", 1))
        if layer.get("grain", 0):
            streaks = blur(rng.random((size, size)).astype(np.float32), 1)
            m = m * (1 - layer["grain"] + layer["grain"] * streaks * 1.6)
        m = np.clip(m * layer.get("strength", 1.0), 0, 1)[..., None]
        img = img * (1 - m) + m * hex_rgb(layer["colour"])
    return np.clip(img, 0, 1)


def paint_eye(size: int, iris_hex: str) -> np.ndarray:
    """An equirectangular eyeball texture (u around, v from the back pole to the front): sclera, iris, pupil."""
    v = (np.arange(size // 2) + 0.5) / (size // 2)  # 0 back .. 1 front (pole)
    u = (np.arange(size) + 0.5) / size
    vv, uu = np.meshgrid(v, u, indexing="ij")
    angle = (1 - vv) * np.pi  # angle from the front pole
    iris_r, pupil_r = 0.42, 0.18
    img = np.ones((size // 2, size, 3), dtype=np.float32) * hex_rgb("#EEE8E1")
    iris = hex_rgb(iris_hex)
    ring = np.clip((angle - iris_r * 0.75) / (iris_r * 0.25), 0, 1)[..., None]
    radial = 0.85 + 0.15 * np.sin(uu * np.pi * 2 * 24)[..., None]
    iris_col = iris * radial * (1 - ring * 0.45)
    img = np.where((angle < iris_r)[..., None], iris_col, img)
    img = np.where((angle < pupil_r)[..., None], hex_rgb("#0B0908"), img)
    return np.clip(img, 0, 1)


def to_image(name: str, rgb: np.ndarray):
    """A Blender image (packed) from an sRGB array with rows from the bottom."""
    import bpy

    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32), np.ones((h, w, 1), dtype=np.float32)], axis=2)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img
