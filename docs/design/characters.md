# Human characters (Batches C.3A and C.3B, prototype)

Status: **functional prototype; the visual design is not approved.** Sixteen
characters, four teams of four, play every seat of Kolkata's 3D and 2.5D board
(C.3A built the first team, C.3B the other three). Their looks are
provisional and will be replaced in the mandatory visual redesign; this batch
established that they work (identity, team colours, skeletons, clips,
routines, selection, movement, loading). Everything here is presentation: the
server, the rules, the board geometry, the move tray and the 2D board are
unchanged. Other cities keep the pawns.

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

## 3. The sixteen characters

Every character wears its player's colour, so a team reads from any camera.
The material named `team` is tinted at runtime with the player's identity
colour, so no personality is tied to a colour: any team can play any seat and
colour, and the mapping from a seat to its people is configuration
(`CHARACTER_TEAMS` in `characters/catalog.ts`). In every team, token 1 is the
storyteller, 2 the tea drinker (with a cup), 3 the reader (with a newspaper)
and 4 the active one, so each base runs the same coordinated routine with
different people; each team starts it at a different point (`routinePhase`),
so the four bases are not in step.

**Team 1 (seat 1)**

| Token | Number | Who | Look | Waiting at the base |
| --- | --- | --- | --- | --- |
| 1 | 1 | **Adda**, the storyteller | Older man, grey receding hair, moustache, round glasses; panjabi and pyjama | Holds forth: talks to Cha, listens to her in turn |
| 2 | 2 | **Cha**, the tea lover | Young woman, braid, bindi; salwar kameez with dupatta, bangles | Listens to Adda, sips tea (the cup appears only while drinking) |
| 3 | 3 | **Kagoj**, the newspaper reader | Middle-aged man, short side-parted hair, glasses, stubble; shirt, trousers, belt, watch | Reads the paper, looks up now and then |
| 4 | 4 | **Byayam**, the exerciser | Young athletic woman, ponytail, headband; tracksuit | Stretches, light exercise, rests |

**Teams 2-4 (seats 2-4, C.3B)**

| Seat | Token 1 (storyteller) | Token 2 (tea) | Token 3 (reader) | Token 4 (active) |
| --- | --- | --- | --- | --- |
| 2 | **Dida**, grandmother: white bun, round glasses, bindi; salwar kameez, bangles | **Rikshawala**, wiry rickshaw-puller: crop, moustache, stubble; panjabi | **Chhatro**, student: side-parted hair, glasses; shirt and trousers | **Khelowar**, footballer: crop, stubble; tracksuit, watch |
| 3 | **Kaku**, uncle with opinions: grey receding hair, heavy build; shirt, watch | **Didi**, office-goer: ponytail; salwar kameez, bangles, watch | **Adhyapika**, retired professor: grey bun, glasses; salwar kameez | **Yoga Mashi**, homemaker: bun, bindi; tracksuit, bangles |
| 4 | **Kobi**, poet: dark beard, side-parted hair; panjabi | **Boudi**, the neighbourhood's news: braid, bindi; salwar kameez, bangles | **Dokandar**, sweet-shop owner: moustache; panjabi, watch | **Kishore**, schoolboy: crop; tracksuit |

They differ in face, hair, gender presentation, age (a schoolboy to a
grandmother), build, height, clothing cut and accessories. The number (1-4)
is on the back of each outfit. All sixteen carry the same 13 clips, baked to
their own bodies.

## 4. Rig and animation

- Skeleton: MakeHuman's `game_engine` rig (53 bones, Unreal-style names).
- Clips (30 fps, baked per character): `idle`, `talk`, `listen`, `drink`,
  `read`, `look_around`, `stretch`, `exercise`, `wave`, `excited`, `dismay`,
  `cheer`, `upset`, `walk`, `run` (`cheer` and `upset`, CMU subject 79, were
  added in C.3C.1 for the gameplay reactions). `read` and `dismay` are layered over `idle` with IK
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
| Selected | The player has picked them | `wave` once (1.1 s, an excited acknowledgement), then `idle`, lifted ring |
| Cheering / Noticing / Upset | A reaction to a game event (§ 5a), for the cue's length | `excited`, `cheer`, `wave` / `look_around` / `upset`, facing the board |
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

## 5a. Reactions to game events (C.3C.1)

The characters react to what the server's history says happened, never to
what they appear to be near. The playback turns each committed event into a
**cue** (`game/presentation.ts`): a kind, the player, the tokens it is about,
when it was shown and how long it lasts. Each character asks
`characters/reactions.ts` what it does for the latest active cue; the brain
plays that above its routine and below travel (a walking, captured or
returning character never stops to react). Reactions are short, varied
(rotated by token and cue), and end on their own: nothing waits on them.

| Cue (length) | Who reacts | Reaction |
| --- | --- | --- |
| Six (1.4 s) | The roller's team, not those home | A jump, a cheer, a wave or a look, varied across the four |
| Selected | The chosen character | A quick wave; it leaves only after the server has accepted the move |
| Capture (1.5 s) | The attacker | A cheer (the victim plays `dismay` and walks back to its own base slot: the `capture` motion) |
| Bonus (1.2 s) | One of the roller's team still in base | A wave |
| Three sixes (1.6 s) | The roller's team | One is upset, the others look |
| No legal move (1.2 s) | The roller's team in base | One is upset, the others look |
| Home (1.5 s) | The mover's teammates | A cheer or a wave (the mover plays its own arrival, `celebrating`) |
| Finished (2.2 s) | The finishing team | A jump or a cheer |
| Win (3.2 s) | The winning team, then everyone else | Cheer or jump; the other teams wave. The victory screen opens after it |

Cues are presented only for seats played by characters and never under
reduced motion. A refresh, a reconnect or a skipped version shows the
server's state as it is: no cue, no reaction, no replay.

## 5b. Loading, failures and diagnostics

Each character's status is reported, never assumed:

| Status | Meaning | On the board |
| --- | --- | --- |
| waiting | Its team's turn to load has not come (one team at a time, the player's own first) | A pawn stands in |
| loading | Its GLB is being fetched, decoded and compiled | A pawn stands in |
| ready | The person is drawn in place of the pawn | The person |
| failed | It could not load; the actual error is kept (a 404, a decoder or parse error, a failed code chunk) | A pawn keeps the game playable |

- The game screen shows one line under the board view controls: loading progress, "All 16
  characters are on the board.", or which characters failed and why, with **Retry** (it forgets the
  cached file and loads it again).
- A failure is caught per character (an error boundary round each one), so it never takes the 3D
  board down, and the next team still loads (a failed team no longer stalls the order).
- The token mirror reports each one: `data-character-status`, `data-character-error`, and
  `data-character-ready` only once the person is actually drawn.
- In development builds the console logs each failure (`[characters] adda (medium) could not load
  from …: …`) and when all have loaded.
- The 2D board uses pawns and says so; if the board fell back to 2D (a slow device, a 3D failure, no
  WebGL) the notice says which, and choosing 2.5D or 3D brings the characters back.
- The automatic quality governor no longer counts the frames spent loading characters (decoding and
  shader compilation), which used to push slower machines down to Low and then to the 2D board.
- React's development double effects no longer break the animation mixer (it is created and torn
  down with each mount); before, `npm run dev` threw `_cacheIndex` errors every frame.

## 6. Movement

Characters walk the same cell-by-cell path as the pawns (`hopSteps`): never a
shortcut, never a cell skipped. For a seat played by characters the playback
paces each cell at a brisk walk (`CHARACTER_PACE`: 340 ms a cell, so a six takes
about 2 s; 250 ms in the middle of moves longer than six cells; 0.8 s to leave
the base; 0.7 s to reach home; 0.8 s caught).

A move is one path (`MovePath`: every cell, its kind and time, and when it
started on the playback's clock). The 3D board follows the path by elapsed time
(`pathMotion.ts`): each frame asks where the move is now, not which cell is
next. A late frame lands part-way along a later segment, always on the path
between two cell centres; nothing queues, nothing waits for a frame, and the
character arrives when the move's time is up. The character turns toward its
next cell (12 rad/s) and moves at constant speed between cell centres. Its
walk or run clip plays at the speed that matches the ground (up to 3.2× the
clip's own speed; beyond that, in a long move's sprint or the dash out of the
base, the feet slide a little). No cell forces a render of its own: the board's
logical state advances by ordinary batched updates.

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
3. Retarget our 15 clips onto the generated rig with `tools/characters`
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
- Sixteen characters (four seats): level Low is about 8.4k triangles each.
- **Loading, one team at a time**: the player's own team first, then the
  others by seat (`loadOrder`, `loadableSeats`). Until a character has loaded
  (and its shaders have compiled) its token stands as a pawn, so the board is
  playable at once and decoding sixteen files never stalls the page in one go.
- **Off-screen characters do not animate**: in a close 3D view, a character
  outside the camera's view keeps its pose until it is back in view.

Measurements: [performance budgets § Human characters](performance-budgets.md#human-characters-batch-c3a-2026-10-12); on a real GPU: [`docs/qa/gpu-performance.md`](../qa/gpu-performance.md).

## 10. Limitations

- Prototype art: generated MakeHuman bodies, simple clothes and hair, painted
  skin. The faces read at close range but are not portrait quality.
- Mocap retargeting is automatic: some poses (hands, shoulders) are rough, and
  fingers do not move.
- The visual design is not approved: every character's face, hair, skin and
  clothing is provisional (see the list in the C.3B report) and will be
  replaced in the redesign phase.
- All four teams share the same four roles and routine (with offsets); more
  varied activities per team are future work.
- High and Ultra are not validated on a real GPU (see the GPU audit page).
