# Character build (C.3A, C.3B)

Builds the playable human characters as GLB files, headlessly, from CC0 and
free-to-use sources. The output is committed (`apps/client/public/characters/`
and `apps/client/src/components/board3d/characters/characters.json`), so
building the game never needs Blender.

## Sources

| Source | What it gives | Licence |
| --- | --- | --- |
| [MakeHuman / MPFB2](https://github.com/makehumancommunity/mpfb2) `src/mpfb/data` | Base mesh with UVs, body and face targets (gender, age, muscle, weight, height, proportions, ancestry blends; nose, mouth, eyes, chin, head), expression units, the 53-bone `game_engine` rig with skin weights, skin detail masks (lips, eyelids, face) | Assets: **CC0 1.0** (MakeHuman's LICENSE.ASSETS). Output from MakeHuman assets carries no restriction. The MPFB2 *code* is GPL and is **not** used or copied: these scripts read the data files only. |
| [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/), BVH conversion by B. Hahne (cgspeed), mirrored at [una-dinosauria/cmu-mocap](https://github.com/una-dinosauria/cmu-mocap) | Motion capture: walk, run, conversation, drinking, stretching, exercise, waving, jumping, looking around, cheering, being upset | "Free for use in research and commercial projects worldwide"; no restrictions on the BVH conversion. Acknowledgement requested (see `THIRD_PARTY_NOTICES.md`). |
| [gltfpack](https://github.com/zeux/meshoptimizer) (npm `gltfpack`, dev dependency) | Mesh simplification for the detail levels, quantisation, meshopt compression | MIT (a tool, nothing of it ships) |

Everything else (clothes, hair, glasses, props, the skin texture, the retargeting,
the poses layered with IK) is made by these scripts.

## Building

Requirements: Python 3.11, Blender's Python module `bpy` 4.2 LTS (pip), Node 24.

```sh
# 1. Sources (shallow clones; about 110 MB and a few MB of BVH files)
git clone --depth 1 https://github.com/makehumancommunity/mpfb2 ../mpfb2
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/una-dinosauria/cmu-mocap ../cmu-mocap
git -C ../cmu-mocap checkout HEAD -- data/002/02_03.bvh data/008/08_01.bvh data/013/13_26.bvh \
  data/014/14_06.bvh data/014/14_37.bvh data/018/18_08.bvh data/019/19_08.bvh data/042/42_01.bvh \
  data/049/49_02.bvh data/077/77_05.bvh data/079/79_69.bvh data/079/79_74.bvh

# 2. Blender as a Python module (Linux, macOS and Windows wheels)
python3.11 -m venv .bpy && .bpy/bin/pip install bpy==4.2.23     # Windows: .bpy\Scripts\pip

# 3. Build the raw GLBs and characters.json (1-3 minutes a character; all sixteen, about 25 minutes)
.bpy/bin/python -I tools/characters/build.py --mh ../mpfb2/src/mpfb/data --cmu ../cmu-mocap/data --out build/characters [--only kaku didi] [--preview build/previews]

# 4. Levels of detail and compression, into the game
node tools/characters/optimize.mjs build/characters apps/client/public/characters apps/client/src/components/board3d/characters/characters.json
```

`optimize.mjs` merges into the game's manifest, so a team can be built and optimised on its own.

Run the Python from the repository root with `-I` (isolated mode). The
scripts read the downloaded data by path and never import code from it.

## Files

| File | Does |
| --- | --- |
| `makehuman.py` | Reads the base mesh, targets, rig and weights; mixes macro targets as MakeHuman's macro modifiers do; joint positions. |
| `identities.py` | The sixteen Kolkata characters (four teams of four): body, face, skin, hair, clothes, accessories, prop, number, idle role. |
| `garments.py` | Region tests on the skeleton; shells of the body (clothes keep the body's UVs and skin weights); edges laid onto the skin. |
| `outfits.py` | Panjabi, salwar kameez with dupatta, shirt and trousers, tracksuit; hairstyles (receding, short side, crop, bun, braid, ponytail); moustache, glasses, bindi, bangles, watch, headband; props; the number. |
| `skin.py` | The painted skin texture (tone, lips, lids, brows, stubble, hair, moustache) and the eyes. |
| `assemble.py` | Builds one character in Blender: armature, body, eyes, lashes, teeth, shells, ribbons (draped cloth), primitives. |
| `animation.py` | Retargets CMU BVH onto the game skeleton. |
| `clips.py` | The clip library and the IK-layered poses (reading, dismay). |
| `build.py` | Puts it together, places the newspaper, exports GLB and the manifest. |
| `optimize.mjs` | High, Medium and Low levels with gltfpack; triangle counts and sizes into the manifest. |
