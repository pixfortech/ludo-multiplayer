# Human characters (Batch C.3A prototype)

Status: **prototype**. Four characters play the Crimson team in Kolkata's 3D
and 2.5D board. Everything here is presentation: the server, the rules, the
board geometry, the move tray and the 2D board are unchanged. Other seats and
other cities keep the pawns.

## 1. Pipeline decision

| Option | Verdict |
| --- | --- |
| **MakeHuman (MPFB2 data, CC0) + CMU motion capture, built headlessly in Blender** | **Chosen.** CC0 body, face and expression targets, a 53-bone game skeleton with skin weights, UVs and skin masks; free mocap for walk, run, conversation, drinking, stretching, exercise, waving, looking round. Reproducible from scripts (`tools/characters`), no paid service, no account, licences that allow a public repository. |
| Rigged bases from asset stores (Quaternius, Mixamo, Sketchfab, Ready Player Me) | Not used. The container could not reach most of them, Mixamo's terms forbid redistributing its characters as files, and per-asset licences vary (CC-BY attribution, "no AI", "no redistribution in source form"). |
| Higgsfield 3D (Meshy image-to-3D with rigging) | **Optional upgrade, not used.** Needs approval and credits. See section 8. |
| Hand-modelled characters in Blender | The long-term route for final art; the generated people here are a stand-in that already uses the final skeleton, clip names and runtime. |

Licences are recorded in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)
and [`tools/characters/README.md`](../../tools/characters/README.md). No
MakeHuman or MPFB2 code (GPL/AGPL) is used: the scripts only read data files.

## 2. Build

`tools/characters/build.py` (Python with `bpy` 4.2) builds each character:
body shape from MakeHuman macro and face targets; clothes as shells of the
body (so they keep its UVs and skin weights); hair, glasses, bangles, props and
the back number as rigid or weighted meshes; a painted skin texture; then the
13 clips retargeted from CMU BVH onto the game skeleton. The GLB goes through
`tools/characters/optimize.mjs` (gltfpack: quantised, meshopt-compressed, three
levels of detail). The output is committed, so building the game never needs
Blender. Rebuilding everything takes about 15 minutes on a laptop CPU.

| Level | Triangles | File |
| --- | --- | --- |
| High | about 30,000 | 364–382 KB |
| Medium | about 17,000 | 292–306 KB |
| Low | about 8,400 | 246–255 KB |

The quality switch picks the level. Textures are WebP inside the GLB. Each file
holds one skinned mesh with two materials (`skin`, `team`) plus a few small
ones (hair locks, eyes, glasses), and the prop meshes.

## 3. The four characters

All four wear the seat's colour, so the team reads from any camera. The
material named `team` is tinted at runtime with the seat's identity colour, so
no personality is tied to crimson: the same people can play any seat colour,
and the mapping from a seat to its people is configuration
(`CHARACTER_TEAMS` in `characters/catalog.ts`).

| Token | Number | Who | Look | Waiting at the base |
| --- | --- | --- | --- | --- |
| 1 | 1 | **Adda**, the storyteller | Older man, grey receding hair, moustache, round glasses; panjabi and pyjama | Holds forth: talks to Cha, listens to her in turn |
| 2 | 2 | **Cha**, the tea lover | Young woman, braid, bindi; salwar kameez with dupatta, bangles | Listens to Adda, sips tea (the cup appears only while drinking) |
| 3 | 3 | **Kagoj**, the newspaper reader | Middle-aged man, short side-parted hair, glasses, stubble; shirt, trousers, belt, watch | Reads the paper, looks up now and then |
| 4 | 4 | **Byayam**, the exerciser | Young athletic woman, ponytail, headband; tracksuit | Stretches, light exercise, rests |

They differ in face, hair, gender presentation, age, build, height (1.54 to
1.86 m before scaling), clothing cut and accessories. The number is on the
back of each outfit.

## 4. Rig and animation

- Skeleton: MakeHuman's `game_engine` rig (53 bones, Unreal-style names).
- Clips (30 fps, baked per character): `idle`, `talk`, `listen`, `drink`,
  `read`, `look_around`, `stretch`, `exercise`, `wave`, `excited`, `dismay`,
  `walk`, `run`. `read` and `dismay` are layered over `idle` with IK
  (newspaper held at reading distance; hands to the head).
- Retargeting: each mapped source bone's world rotation since its rest pose is
  applied to the target bone after turning the target's rest direction onto
  the source's (limbs only; the torso keeps its rest). Hip travel is removed
  (the game moves the character); standing clips have their slow turns
  removed, so the game controls which way a character faces. Loops are blended
  over their last third of a second.
- Walk and run carry their measured ground speed (`characters.json`), so the
  runtime plays them at the speed the character actually moves over the board:
  no foot sliding.
- Runtime: three's `GLTFLoader` with the meshopt decoder, `SkeletonUtils.clone`
  per token, one `AnimationMixer` per character, 0.25 s crossfades. Clips are
  shared by all instances of a file.

## 5. State machine (presentation only)

`characters/brain.ts` decides each frame from the token's placement and state
and the playback's motion. Nothing in it can move a token.

| State | When | Clip |
| --- | --- | --- |
| Idle / Interacting | At the base, by the shared routine (a talker and a listener at once) | `talk`, `listen`, `drink`, `read`, `look_around`, `stretch`, `exercise`, `idle` |
| TurnAlert | The first 1.6 s of their seat's turn | `look_around`, facing the board |
| Selectable | Their token is movable | `idle`, facing the board, the movable ring on the plinth |
| Selected | The player has picked them | `idle`, lifted ring |
| Excited | The first 40% of an `open` motion (a six, after the server accepted the move) | `excited` |
| LeavingBase | The rest of the `open` motion: walking to the start cell | `walk` |
| Walking | A `hop` or `land` motion: one cell at a time | `walk`, or `run` above 1.9 units/s (long moves) |
| Captured / ReturningToBase | A `capture` motion | `dismay`, then back to the base slot |
| ReachingHome / Celebrating | A `home` motion | `walk`, then `excited` |
| Finished | At home | `idle` |

The playback (`useBoardPlayback`) starts motions only once the server's new
state has arrived and the die has been revealed; a refresh or reconnect takes
the server's state as it is (no motion), so nobody replays a celebration or a
walk.

## 6. Movement

Characters walk the same cell-by-cell path as the pawns (`hopSteps`): never a
shortcut, never a cell skipped. For a seat played by characters the playback
paces each cell at walking speed (`CHARACTER_PACE`: 700 ms a cell, 420 ms in
the middle of long moves, 1.5 s to leave the base, 1.3 s to reach home, 1.3 s
caught). The character turns toward its next cell (7 rad/s) and moves at a
constant speed in a straight line between cell centres. If the page is too
busy to render a cell in time, the next one waits for it (the character never
jumps), and each cell is committed to the page on its own render.

## 7. Cameras and picking

- 2.5D (aerial): characters stand 0.95 units tall on a 0.3-unit plinth in the
  seat's colour; the plinth is what you pick (mouse or touch) and it carries the
  movable and selected rings.
- 3D: the focus camera follows the walking character and can be interrupted
  (Overview). There is no free third-person control.
- Characters ignore raycasts (the plinth's hit disc is the pick target), cast no
  shadows and are never frustum-culled by mistake (skinned bounds).

## 8. Higgsfield (optional, needs approval)

If the generated people are not good enough for release, Higgsfield's 3D
models could produce textured, rigged characters from approved concept art:

1. Generate or draw one front-view concept per character (the four above).
2. `meshy_v7_image_to_3d` (standard model, about 20k triangles,
   symmetry on, texture on), then `meshy_rigging` (humanoid rig).
3. Retarget our 13 clips onto the generated rig with `tools/characters`
   (the runtime needs only the clip names), then run `optimize.mjs`.

**Cost**: unknown. Higgsfield shows no price for 3D jobs until a job is
prepared with its input image, so a quote needs a concept image uploaded first.
Nothing was uploaded, generated or spent in C.3A. The request (four images,
four 3D jobs, four rigging jobs) and a credit cap go through
[`credit-approval-checklist.md`](credit-approval-checklist.md) before any job.

## 9. Performance safeguards

- One mixer per character; the clips are shared; clones share geometry and
  textures; only the tinted `team` material is cloned.
- The characters' ambient clock runs at 8, 12 or 20 fps (Low, Medium, High),
  never faster than the city's governor allows (every frame draws the whole
  scene, so the city measures for both). Where the city would rest, the characters keep a
  slow pulse instead (at most 2 frames a second and a tenth of the device's
  time: a frame every 3 s with software WebGL). Walking and one-off reactions
  render at full rate.
- The ambient clock stops while the tab is hidden; under reduced motion the base
  routine does not animate and moves slide (no walk).
- No shadows, no per-frame React updates (the token mirror's attributes are
  written only when they change), and everything owned is disposed on unmount.
- Built for 16 characters (four seats): level Low is 8.4k triangles each.

Measurements: [performance budgets § Human characters](performance-budgets.md#human-characters-batch-c3a-2026-10-12); on a real GPU: [`docs/qa/gpu-performance.md`](../qa/gpu-performance.md).

## 10. Limitations

- Prototype art: generated MakeHuman bodies, simple clothes and hair, painted
  skin. The faces read at close range but are not portrait quality.
- Mocap retargeting is automatic: some poses (hands, shoulders) are rough, and
  fingers do not move.
- Only Kolkata's Crimson seat has characters; the other 12 are C.3B work.
- Not yet measured on a real GPU (see the GPU audit instructions).
