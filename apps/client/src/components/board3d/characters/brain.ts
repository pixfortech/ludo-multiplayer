// What a character token is doing, decided from the game's presentation only.
//
// Gameplay stays server-authoritative: a character never moves, leaves its
// base or celebrates on its own. Its state comes from the token's placement
// and state (base, board, home; movable, selected) and from the playback's
// motions (open, hop, land, home, capture), which only start once the server
// has accepted a move. Everything here is pure (tested in
// __tests__/brain.test.ts): given the inputs and the time, the same answer.

export type CharacterState =
  | "idle"
  | "interacting"
  | "turnAlert"
  | "selectable"
  | "selected"
  | "excited"
  | "leavingBase"
  | "walking"
  | "captured"
  | "returningToBase"
  | "reachingHome"
  | "celebrating"
  | "finished";

/** The clips every character file carries (tools/characters/clips.py). */
export type ClipName = "idle" | "talk" | "listen" | "drink" | "stretch" | "exercise" | "look_around" | "wave" | "excited" | "walk" | "run" | "read" | "dismay";

/** Each character's own way of waiting. */
export type IdleBehaviour = "adda" | "tea" | "newspaper" | "exercise";

export type TravelKind = "hop" | "land" | "open" | "home" | "capture" | "slide";

export interface Travel {
  kind: TravelKind;
  /** 0..1 progress through the playback's motion. */
  progress: number;
  /** World units per second along the ground (for the walk's playback speed). */
  groundSpeed: number;
}

export interface CharacterInputs {
  behaviour: IdleBehaviour;
  where: "base" | "board" | "home";
  token: "idle" | "movable" | "selected" | "unmovable" | "finished";
  travel: Travel | null;
  /** Seconds since this seat's turn began (null when it is not this seat's turn). */
  turnAge: number | null;
  /** Seconds on the shared ambient clock (for the waiting routine). */
  time: number;
  /** The base scene's partner to face, if any (resolved by the caller to a direction). */
}

export interface CharacterPose {
  state: CharacterState;
  clip: ClipName;
  /** Playback speed of the clip (walk and run follow the ground speed: no foot sliding). */
  timeScale: number;
  loop: boolean;
  /** Which way to face: along the travel, toward a partner character, toward the board's centre, or keep. */
  face: "travel" | "partner" | "centre" | "keep";
  /** The partner for an interaction (a behaviour), when face is "partner". */
  partner: IdleBehaviour | null;
  /** The character's prop (cup, newspaper) is in hand. */
  prop: boolean;
}

/** Clip speeds (world metres per second) and the character's scale turn ground speed into a clip speed. */
export interface Gait {
  walkSpeed: number;
  runSpeed: number;
  /** World units per metre of the character (its scale on the board). */
  scale: number;
}

/** Above this ground speed (units per second) a character runs instead of walking briskly. */
export const RUN_ABOVE = 1.9;

const TURN_ALERT_SECONDS = 1.6;

// The base routine: a team of four shares one schedule of scenes, so their
// activities fit together (a chat has a talker and a listener at once).
type Scene = "chat" | "tea" | "quiet" | "chat2";
const SCENES: { scene: Scene; seconds: number }[] = [
  { scene: "chat", seconds: 9 },
  { scene: "quiet", seconds: 6 },
  { scene: "tea", seconds: 7 },
  { scene: "chat2", seconds: 8 },
  { scene: "quiet", seconds: 5 },
  { scene: "tea", seconds: 6 },
];
const CYCLE = SCENES.reduce((s, x) => s + x.seconds, 0);

/** The base scene at time t (seconds). */
export function sceneAt(t: number): Scene {
  let u = ((t % CYCLE) + CYCLE) % CYCLE;
  for (const s of SCENES) {
    if (u < s.seconds) return s.scene;
    u -= s.seconds;
  }
  return "quiet";
}

/** A character's waiting activity in its base, by scene: who talks, who listens, who reads or warms up. */
export function waiting(behaviour: IdleBehaviour, t: number): { state: CharacterState; clip: ClipName; partner: IdleBehaviour | null } {
  const scene = sceneAt(t);
  switch (behaviour) {
    case "adda":
      if (scene === "chat" || scene === "chat2") return { state: "interacting", clip: "talk", partner: "tea" };
      if (scene === "tea") return { state: "interacting", clip: "listen", partner: "tea" };
      return { state: "idle", clip: "idle", partner: null };
    case "tea":
      if (scene === "chat") return { state: "interacting", clip: "listen", partner: "adda" };
      if (scene === "chat2") return { state: "interacting", clip: "drink", partner: "adda" };
      if (scene === "tea") return { state: "idle", clip: "drink", partner: null };
      return { state: "idle", clip: "idle", partner: null };
    case "newspaper":
      // Reads; looks up now and then.
      return scene === "quiet" && Math.floor(t / 5) % 3 === 0 ? { state: "idle", clip: "look_around", partner: null } : { state: "idle", clip: "read", partner: null };
    case "exercise":
      return scene === "chat" || scene === "tea" ? { state: "idle", clip: "stretch", partner: null } : scene === "chat2" ? { state: "idle", clip: "exercise", partner: null } : { state: "idle", clip: "idle", partner: null };
  }
}

function travelPose(i: CharacterInputs, gait: Gait): CharacterPose | null {
  const t = i.travel;
  if (!t) return null;
  const walkClip = (speed: number): { clip: ClipName; timeScale: number } => {
    const run = speed > RUN_ABOVE;
    const clipSpeed = (run ? gait.runSpeed : gait.walkSpeed) * gait.scale;
    return { clip: run ? "run" : "walk", timeScale: Math.max(0.3, speed / Math.max(1e-6, clipSpeed)) };
  };
  switch (t.kind) {
    case "open":
      // The six: an excited jump where it stands, then off to the start cell.
      if (t.progress < OPEN_EXCITED) return { state: "excited", clip: "excited", timeScale: 1, loop: false, face: "travel", partner: null, prop: false };
      return { state: "leavingBase", ...walkClip(t.groundSpeed), loop: true, face: "travel", partner: null, prop: false };
    case "hop":
    case "land":
      return { state: "walking", ...walkClip(t.groundSpeed), loop: true, face: "travel", partner: null, prop: false };
    case "home":
      if (t.progress < HOME_ARRIVE) return { state: "reachingHome", ...walkClip(t.groundSpeed), loop: true, face: "travel", partner: null, prop: false };
      return { state: "celebrating", clip: "excited", timeScale: 1, loop: false, face: "keep", partner: null, prop: false };
    case "capture":
      if (t.progress < CAPTURE_DISMAY) return { state: "captured", clip: "dismay", timeScale: 1, loop: false, face: "keep", partner: null, prop: false };
      return { state: "returningToBase", clip: "dismay", timeScale: 1, loop: false, face: "keep", partner: null, prop: false };
    case "slide":
      return { state: "walking", clip: "idle", timeScale: 1, loop: true, face: "keep", partner: null, prop: false };
  }
}

/** The share of an "open" motion spent in the excited jump before walking to the start cell. */
export const OPEN_EXCITED = 0.4;
/** The share of a "home" motion spent walking in before celebrating. */
export const HOME_ARRIVE = 0.62;
/** The share of a capture spent in dismay before being sent back. */
export const CAPTURE_DISMAY = 0.45;

/** The character's pose for this moment. */
export function decide(i: CharacterInputs, gait: Gait): CharacterPose {
  const moving = travelPose(i, gait);
  if (moving) return moving;
  if (i.token === "finished" || i.where === "home") return { state: "finished", clip: "idle", timeScale: 1, loop: true, face: "centre", partner: null, prop: false };
  if (i.token === "selected") return { state: "selected", clip: "idle", timeScale: 1, loop: true, face: "keep", partner: null, prop: false };
  if (i.turnAge !== null && i.turnAge < TURN_ALERT_SECONDS) {
    // Their turn: they notice (a look round), whatever they were doing.
    return { state: "turnAlert", clip: "look_around", timeScale: 1, loop: false, face: "centre", partner: null, prop: false };
  }
  if (i.token === "movable") return { state: "selectable", clip: "idle", timeScale: 1, loop: true, face: "centre", partner: null, prop: false };
  if (i.where === "board") return { state: "idle", clip: "idle", timeScale: 1, loop: true, face: "keep", partner: null, prop: false };
  const w = waiting(i.behaviour, i.time);
  const prop = (i.behaviour === "tea" && w.clip === "drink") || (i.behaviour === "newspaper" && w.clip === "read");
  return { state: w.state, clip: w.clip, timeScale: 1, loop: w.clip !== "look_around", face: w.partner ? "partner" : "centre", partner: w.partner, prop };
}

/** Where a character walks during a motion: straight between cells at a constant speed (feet match the ground). */
export function walkPosition(kind: TravelKind, from: { x: number; z: number }, to: { x: number; z: number }, p: number): { x: number; z: number } {
  const q = Math.max(0, Math.min(1, p));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const along = (t: number) => ({ x: lerp(from.x, to.x, t), z: lerp(from.z, to.z, t) });
  if (kind === "open") return q < OPEN_EXCITED ? from : along((q - OPEN_EXCITED) / (1 - OPEN_EXCITED));
  if (kind === "home") return q < HOME_ARRIVE ? along(q / HOME_ARRIVE) : to;
  return along(q);
}

/** Ground speed (units per second) of a motion's walking part. */
export function groundSpeed(kind: TravelKind, from: { x: number; z: number }, to: { x: number; z: number }, ms: number): number {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const share = kind === "open" ? 1 - OPEN_EXCITED : kind === "home" ? HOME_ARRIVE : 1;
  return d / Math.max(0.05, (ms / 1000) * share);
}

/** Turns `current` toward `target` (radians) by at most `maxStep`, the short way round. */
export function turnToward(current: number, target: number, maxStep: number): number {
  let d = target - current;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}

/** The yaw (about +Y) that faces from a toward b, with yaw 0 facing +Z (the characters' forward). */
export function yawToward(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}
