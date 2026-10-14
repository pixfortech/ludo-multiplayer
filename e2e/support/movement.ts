// Measures token movement as the player sees it, recorded inside the page:
//  - the pointer release, the gameplay request leaving the page, the presentation events (the die thrown and
//    landed, the move starting from the server's state);
//  - every display frame (requestAnimationFrame) and every frame the board actually drew, with the watched
//    token's on-screen position, its logical step and its character's state.
// From these: how long from the click to the first visible motion and to the arrival, how many frames the
// board drew while the token travelled, and whether it ever stood still before arriving (a freeze).

import type { Page } from "@playwright/test";
import { classicStepCell, gridToWorld, type WorldPoint } from "@ludo/board-layouts";

export interface MoveFrame {
  t: number;
  /** Frames the board has drawn since it was created (unchanged on display frames it did not draw). */
  boardFrames: number;
  x: number | null;
  y: number | null;
  /** On the 3D board: where the token stands in board units (the cells' frame), whatever the camera does. */
  wx: number | null;
  wz: number | null;
  step: string | null;
  state: string | null;
  /** The 3D board's own measurements (its last drawn frame): the frame's work and the characters' share (ms). */
  workMs: number | null;
  characterMs: number | null;
}

/** A long animation frame (Chromium's long-animation-frame entry): where the main thread's time went. */
export interface LongFrame {
  t: number;
  ms: number;
  blockingMs: number;
  /** When rendering (rAF callbacks, then style and layout) began, relative to the frame's start. */
  renderAtMs: number;
  layoutAtMs: number;
  scripts: { invoker: string; fn: string; src: string; ms: number; t: number }[];
}

export interface MoveRecording {
  marks: { name: string; t: number }[];
  frames: MoveFrame[];
  log: { type: string; t: number; to?: string; tokens?: string }[];
  longFrames: LongFrame[];
}

/** Installs the recorder (call once per page, after it has loaded). */
export async function installMoveRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    type W = { __mv?: { key: string | null; frames: unknown[]; marks: { name: string; t: number }[]; on: boolean } };
    const w = window as unknown as W;
    if (w.__mv) return;
    const mv = { key: null as string | null, frames: [] as unknown[], marks: [] as { name: string; t: number }[], long: [] as unknown[], on: false };
    w.__mv = mv;
    try {
      new PerformanceObserver((list) => {
        if (!mv.on) return;
        for (const e of list.getEntries() as unknown as {
          startTime: number;
          duration: number;
          blockingDuration: number;
          renderStart: number;
          styleAndLayoutStart: number;
          scripts: { invoker: string; sourceFunctionName: string; sourceURL: string; duration: number; startTime: number }[];
        }[]) {
          mv.long.push({
            t: e.startTime,
            ms: e.duration,
            blockingMs: e.blockingDuration,
            renderAtMs: e.renderStart ? e.renderStart - e.startTime : 0,
            layoutAtMs: e.styleAndLayoutStart ? e.styleAndLayoutStart - e.startTime : 0,
            scripts: e.scripts.map((x) => ({ invoker: x.invoker, fn: x.sourceFunctionName, src: x.sourceURL.split("/").pop() ?? "", ms: x.duration, t: x.startTime })),
          });
        }
      }).observe({ type: "long-animation-frame", buffered: false });
    } catch {
      // Not supported: no long-frame breakdown.
    }
    addEventListener("pointerup", () => mv.on && mv.marks.push({ name: "pointerup", t: performance.now() }), true);
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
      if (mv.on && typeof data === "string") {
        const m = /"game:(roll|move)"/.exec(data);
        if (m) mv.marks.push({ name: `send:${m[1]}`, t: performance.now() });
      }
      return send.call(this, data);
    };
    const tick = () => {
      if (mv.on) {
        const board = document.querySelector<HTMLElement>('[data-testid="game-board"]');
        let x: number | null = null;
        let y: number | null = null;
        let wx: number | null = null;
        let wz: number | null = null;
        let step: string | null = null;
        let state: string | null = null;
        if (mv.key) {
          const li = document.querySelector<HTMLElement>(`[data-testid="board-mirror"] li[data-key="${mv.key}"]`);
          if (li) {
            x = li.dataset.cx ? Number(li.dataset.cx) : null;
            y = li.dataset.cy ? Number(li.dataset.cy) : null;
            wx = li.dataset.wx ? Number(li.dataset.wx) : null;
            wz = li.dataset.wz ? Number(li.dataset.wz) : null;
            step = li.dataset.step ?? null;
            state = li.dataset.characterState ?? null;
          } else {
            // The 2D board: the token element itself.
            const el = document.querySelector<SVGGraphicsElement>(`[data-testid="token-${mv.key}"]`);
            if (el) {
              const r = el.getBoundingClientRect();
              x = r.x + r.width / 2;
              y = r.y + r.height / 2;
              step = el.getAttribute("data-step");
            }
          }
        }
        const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
        mv.frames.push({ t: performance.now(), boardFrames: Number(board?.dataset.frames ?? 0), x, y, wx, wz, step, state, workMs: num(board?.dataset.frameMs), characterMs: num(board?.dataset.characterMs) });
        if (mv.frames.length > 20_000) mv.frames.splice(0, 5_000);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Starts a fresh recording of `key` (playerId:tokenId). */
export async function startRecording(page: Page, key: string): Promise<void> {
  await page.evaluate((k) => {
    const mv = (window as unknown as { __mv: { key: string | null; frames: unknown[]; marks: unknown[]; long: unknown[]; on: boolean } }).__mv;
    mv.key = k;
    mv.frames = [];
    mv.marks = [];
    mv.long = [];
    mv.on = true;
  }, key);
}

export async function stopRecording(page: Page): Promise<MoveRecording> {
  return page.evaluate(() => {
    const mv = (window as unknown as { __mv: { frames: MoveFrame[]; marks: { name: string; t: number }[]; long: LongFrame[]; on: boolean } }).__mv;
    mv.on = false;
    const log = [...document.querySelectorAll<HTMLElement>('[data-testid="presentation-log"] li')].map((li) => ({
      type: li.dataset.type!,
      t: Number(li.dataset.t),
      ...(li.dataset.to ? { to: li.dataset.to } : {}),
      ...(li.dataset.tokens ? { tokens: li.dataset.tokens } : {}),
    }));
    return { marks: mv.marks, frames: mv.frames, log, longFrames: mv.long };
  });
}

export interface MoveMetrics {
  /** Page times (performance.now()): the click, the move's start on screen (its presentation event), the arrival. */
  clickAt: number;
  moveEventAt: number | null;
  arrivalAt: number | null;
  /** Click (pointer release) to the request leaving the page. */
  clickToSendMs: number | null;
  /** The request to the move starting on screen (the server's state arrived and the playback began it). */
  sendToMoveEventMs: number | null;
  /** Click to the first drawn frame where the token has visibly left its starting point. */
  clickToMotionMs: number | null;
  /** Click to the first drawn frame on its final position (logical step final, standing there for good). */
  clickToArrivalMs: number | null;
  /** First motion to arrival. */
  travelMs: number | null;
  /** Frames drawn while it travelled, and the longest gap between two of them. */
  drawnFrames: number;
  maxDrawnGapMs: number;
  /** Display frames (requestAnimationFrame) in the same time: the refresh the browser offered. */
  displayFrames: number;
  /** Drawn frames during travel on which the token had not moved since the previous drawn frame (stood still). */
  stalledFrames: number;
  /** The longest stretch it stood still while still on its way (ms). */
  longestStallMs: number;
  /** The frame-to-frame display interval: average, p95, p99 (ms). */
  frameAvgMs: number;
  frameP95Ms: number;
  frameP99Ms: number;
  /**
   * The main thread from the click to the first visible motion: time in long animation frames (over 50 ms),
   * how much of it was script, and the scripts that took most (invoker / function / file, ms).
   */
  waitLongFramesMs: number;
  waitScriptMs: number;
  waitTopScripts: { name: string; ms: number }[];
  /** The same while it travelled. */
  travelLongFramesMs: number;
  travelScriptMs: number;
  /** The 3D board's measured work per drawn frame while it travelled (average, worst) and the characters' share. */
  travelWorkAvgMs: number | null;
  travelWorkMaxMs: number | null;
  travelCharacterAvgMs: number | null;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]! : 0);

/** Computes the timings of one move from its recording: `finalStep` is where the server put the token. */
export function moveMetrics(rec: MoveRecording, key: string, finalStep: string, clickName = "pointerup"): MoveMetrics {
  // The click that sent the move (the last before its request), else the first click, else the start.
  const sentMove = rec.marks.find((m) => m.name === "send:move")?.t ?? null;
  const clicks = rec.marks.filter((m) => m.name === clickName);
  const click = (sentMove !== null ? clicks.filter((m) => m.t <= sentMove).at(-1)?.t : undefined) ?? clicks[0]?.t ?? rec.marks[0]?.t ?? rec.frames[0]?.t ?? 0;
  const send = sentMove ?? rec.marks.find((m) => m.name.startsWith("send:"))?.t ?? null;
  const moveEvent = rec.log.find((e) => e.type === "token-move" && e.tokens === key && e.t >= click - 5)?.t ?? null;
  const drawn: MoveFrame[] = [];
  for (const f of rec.frames) if (f.x !== null && (drawn.length === 0 || f.boardFrames !== drawn[drawn.length - 1]!.boardFrames || f.x !== drawn[drawn.length - 1]!.x || f.y !== drawn[drawn.length - 1]!.y)) drawn.push(f);
  const start = drawn.find((f) => f.t >= click) ?? drawn[0];
  const final = [...drawn].reverse().find((f) => f.step === finalStep);
  // Moving or standing: on the 3D board by where it stands on the board (a camera move shifts it on screen
  // without moving it), on the 2D board by its position on screen.
  const near = (a: MoveFrame, b: MoveFrame) =>
    a.wx !== null && b.wx !== null && a.wz !== null && b.wz !== null ? Math.hypot(a.wx - b.wx, a.wz - b.wz) < 0.01 : Math.hypot(a.x! - b.x!, a.y! - b.y!) < 1.5;
  let motion: MoveFrame | null = null;
  let arrival: MoveFrame | null = null;
  if (start && final) {
    motion = drawn.find((f) => f.t >= start.t && !near(f, start)) ?? null;
    // Arrival: the first drawn frame from which the position no longer changes (to the end of the recording).
    for (let i = drawn.length - 1; i >= 0; i--) {
      if (!near(drawn[i]!, final)) break;
      arrival = drawn[i]!;
    }
  }
  let stalled = 0;
  let longestStall = 0;
  let maxGap = 0;
  let drawnCount = 0;
  if (motion && arrival) {
    const travel = drawn.filter((f) => f.t >= motion.t && f.t <= arrival.t);
    drawnCount = travel.length;
    let stallStart: number | null = null;
    for (let i = 1; i < travel.length; i++) {
      maxGap = Math.max(maxGap, travel[i]!.t - travel[i - 1]!.t);
      if (near(travel[i]!, travel[i - 1]!)) {
        stalled++;
        stallStart ??= travel[i - 1]!.t;
        longestStall = Math.max(longestStall, travel[i]!.t - stallStart);
      } else stallStart = null;
    }
  }
  const windowFrames = rec.frames.filter((f) => f.t >= (motion?.t ?? click) && f.t <= (arrival?.t ?? click));
  const intervals = rec.frames.slice(1).map((f, i) => f.t - rec.frames[i]!.t).sort((a, b) => a - b);
  const round = (n: number | null) => (n === null ? null : Math.round(n));
  const busy = (from: number, to: number) => {
    const frames = (rec.longFrames ?? []).filter((f) => f.t + f.ms > from && f.t < to);
    const by = new Map<string, number>();
    let script = 0;
    for (const f of frames)
      for (const x of f.scripts) {
        script += x.ms;
        const name = `${x.invoker}|${x.fn}|${x.src}`;
        by.set(name, (by.get(name) ?? 0) + x.ms);
      }
    const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, ms]) => ({ name, ms: Math.round(ms) }));
    return { ms: Math.round(frames.reduce((a, f) => a + f.ms, 0)), script: Math.round(script), top };
  };
  const wait = busy(click, motion?.t ?? click);
  const during = motion && arrival ? drawn.filter((f) => f.t >= motion.t && f.t <= arrival.t) : [];
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const works = during.map((f) => f.workMs).filter((x): x is number => x !== null);
  const work = {
    travelWorkAvgMs: avg(works),
    travelWorkMaxMs: works.length ? Math.round(Math.max(...works) * 10) / 10 : null,
    travelCharacterAvgMs: avg(during.map((f) => f.characterMs).filter((x): x is number => x !== null)),
  };
  const travelling = motion && arrival ? busy(motion.t, arrival.t) : { ms: 0, script: 0, top: [] };
  return {
    clickAt: round(click)!,
    moveEventAt: round(moveEvent),
    arrivalAt: arrival ? round(arrival.t) : null,
    clickToSendMs: send === null ? null : round(send - click),
    sendToMoveEventMs: send === null || moveEvent === null ? null : round(moveEvent - send),
    clickToMotionMs: motion ? round(motion.t - click) : null,
    clickToArrivalMs: arrival ? round(arrival.t - click) : null,
    travelMs: motion && arrival ? round(arrival.t - motion.t) : null,
    drawnFrames: drawnCount,
    maxDrawnGapMs: Math.round(maxGap),
    displayFrames: windowFrames.length,
    stalledFrames: stalled,
    longestStallMs: Math.round(longestStall),
    frameAvgMs: Math.round((intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length)) * 10) / 10,
    frameP95Ms: Math.round(pct(intervals, 0.95)),
    frameP99Ms: Math.round(pct(intervals, 0.99)),
    waitLongFramesMs: wait.ms,
    waitScriptMs: wait.script,
    waitTopScripts: wait.top,
    travelLongFramesMs: travelling.ms,
    travelScriptMs: travelling.script,
    ...work,
  };
}

/** A step's cell centre in board units (the frame of the 3D board's cells and tokens). */
export function cellWorld(seat: number, step: number): WorldPoint {
  const c = classicStepCell(seat, step);
  if (!c) throw new Error(`no cell for step ${step}`);
  return gridToWorld(c.col + 0.5, c.row + 0.5);
}

/** How far from a cell's centre a token sharing the cell can be drawn (stack offsets: up to 0.29 × √2), in board units. */
const STACK_SPREAD = 0.45;

export interface WalkedPath {
  /** Positions drawn (distinct consecutive board positions). */
  positions: number;
  /** The farthest any drawn position was from the path (board units; a cell is 1). */
  maxOffPath: number;
  /** The farthest it ever went back along the path. */
  maxBackwards: number;
  /** Where it ended, from the destination cell's centre. */
  endOff: number;
  /** How far along the path (0–1) the drawn positions reached before the last one. */
  coveredBeforeEnd: number;
}

/**
 * Checks a recorded move on the 3D board against the seat's path in board units: the polyline from where the
 * token stood through every cell from `from + 1` to `to` in order (for a departure: from its base slot to the
 * start). A cut corner or a skipped cell shows as a position off the polyline; a replay or a jump back as
 * movement backwards along it.
 */
export function walkedPath(rec: MoveRecording, seat: number, from: number | null, to: number): WalkedPath {
  const pts: WorldPoint[] = [];
  for (const f of rec.frames) {
    if (f.wx === null || f.wz === null) continue;
    const last = pts[pts.length - 1];
    if (!last || last.x !== f.wx || last.z !== f.wz) pts.push({ x: f.wx, z: f.wz });
  }
  if (pts.length === 0) return { positions: 0, maxOffPath: Infinity, maxBackwards: Infinity, endOff: Infinity, coveredBeforeEnd: 0 };
  const cells = from === null ? [to] : Array.from({ length: to - from }, (_, i) => from + 1 + i);
  const line = [from === null ? pts[0]! : cellWorld(seat, from), ...cells.map((s) => cellWorld(seat, s))];
  const lengths = line.slice(1).map((b, i) => Math.hypot(b.x - line[i]!.x, b.z - line[i]!.z));
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const place = (p: WorldPoint) => {
    let best = { d: Infinity, along: 0 };
    let start = 0;
    for (let i = 0; i < lengths.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const len = lengths[i]!;
      const u = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len)));
      const d = Math.hypot(a.x + (b.x - a.x) * u - p.x, a.z + (b.z - a.z) * u - p.z);
      if (d < best.d - 1e-9) best = { d, along: start + u * len };
      start += len;
    }
    return best;
  };
  let maxOff = 0;
  let furthest = 0;
  let maxBack = 0;
  const along: number[] = [];
  const end = line[line.length - 1]!;
  for (const p of pts) {
    const at = place(p);
    // On its destination cell, beside a token already there (a stack spreads tokens up to about 0.41 of a cell
    // from the centre), it has arrived: that is on the path.
    const onDestination = Math.hypot(p.x - end.x, p.z - end.z) < STACK_SPREAD;
    maxOff = Math.max(maxOff, onDestination ? 0 : at.d);
    if (!onDestination) maxBack = Math.max(maxBack, furthest - at.along);
    furthest = Math.max(furthest, at.along);
    along.push(at.along);
  }
  const lastPt = pts[pts.length - 1]!;
  return {
    positions: pts.length,
    maxOffPath: Math.round(maxOff * 1000) / 1000,
    maxBackwards: Math.round(maxBack * 1000) / 1000,
    endOff: Math.round(Math.hypot(lastPt.x - end.x, lastPt.z - end.z) * 1000) / 1000,
    coveredBeforeEnd: Math.round((Math.max(0, ...along.slice(0, -1)) / total) * 100) / 100,
  };
}
