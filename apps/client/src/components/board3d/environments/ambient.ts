// Ambient life runs on its own clock. The board renders on demand (only while
// something changes), so the city asks for frames at a modest, capped rate:
// fewer while tokens are moving (the board's motion comes first), none while
// the tab is hidden, none under reduced motion, and less (or none) on a device
// that cannot afford it. Movers compute their position from the time, so a
// skipped frame never makes anything jump or drift.

import { useEffect, useRef, useState } from "react";
import { addAfterEffect, addEffect, useThree } from "@react-three/fiber";
import type { QualityLevel } from "../capabilities";

export interface EnvironmentQuality {
  taxis: number;
  trams: number;
  ferries: number;
  pedestrians: number;
  /** Trees sway (instance updates). */
  sway: boolean;
  /** Ambient frames per second (when nothing else is moving). */
  fps: number;
  /** Architectural detail: windows, balconies, rooftop details. */
  detail: "low" | "medium" | "high";
  /** Far skyline blocks. */
  skyline: number;
}

/** Environment budgets per graphics quality (docs/architecture/board-3d.md § Kolkata). */
export const ENV_QUALITY: Readonly<Record<QualityLevel, EnvironmentQuality>> = {
  low: { taxis: 2, trams: 1, ferries: 1, pedestrians: 4, sway: false, fps: 12, detail: "low", skyline: 18 },
  medium: { taxis: 5, trams: 2, ferries: 2, pedestrians: 12, sway: true, fps: 20, detail: "medium", skyline: 34 },
  high: { taxis: 8, trams: 3, ferries: 3, pedestrians: 22, sway: true, fps: 30, detail: "high", skyline: 52 },
};

/** Seconds since the page loaded: the shared time all movers follow. */
export const ambientTime = (): number => performance.now() / 1000;

/**
 * What the device can afford for ambient frames, from a measuring window in
 * which only the city asked for frames. Ambient life is decoration: it may use
 * at most about a third of the device's time. A frame's cost is the larger of
 * its main-thread work and, when fewer frames arrived than were asked for (the
 * GPU is the bottleneck, as with software WebGL), the window divided by the
 * frames delivered. Returns the asked rate when affordable, a lower rate when
 * not, or 0 (the city rests, standing still) below 3 frames a second.
 *
 * `floor` keeps a slow pulse instead of resting (the characters' idles), but
 * never more than a tenth of the device's time: frames that cost 300 ms (a
 * software renderer) get a frame every 3 seconds, not 2 a second.
 */
export function affordableFps(askedFps: number, windowMs: number, delivered: number, workMs: readonly number[], floor = 0): number {
  if (askedFps <= 0) return 0;
  if (windowMs <= 0) return askedFps;
  const cost = frameCost(askedFps, windowMs, delivered, workMs);
  if (cost <= 0) return askedFps;
  const affordable = Math.min(askedFps, Math.floor((1000 / 3 / cost) * 10) / 10);
  if (affordable >= 3) return affordable;
  return Math.min(askedFps, floor, Math.floor((1000 / 10 / cost) * 100) / 100);
}

/** A frame's cost (ms) as measured in a window: its main-thread work, or the window over the frames delivered when they arrived late. */
export function frameCost(askedFps: number, windowMs: number, delivered: number, workMs: readonly number[]): number {
  const asked = (askedFps * windowMs) / 1000;
  const work = [...workMs].sort((a, b) => a - b)[Math.floor(workMs.length / 2)] ?? 0;
  // Fewer than three-quarters of the asked frames arrived: each took about the window over the delivered count.
  const late = delivered < asked * 0.75;
  return Math.max(work, late ? windowMs / Math.max(1, delivered) : 0);
}

/**
 * Ambient life: "measuring" (live, while the governor checks what this device can afford), "live" at
 * its quality's rate, "eased" (slower, the device is slow), "resting" (stopped, the device cannot
 * afford it), "still" (reduced motion).
 */
export type AmbientState = "measuring" | "live" | "eased" | "resting" | "still";

/** What the city's governor decided: its state, its rate, and what a frame cost when it measured (ms). */
export interface AmbientReport {
  state: AmbientState;
  fps: number;
  frameMs: number | null;
}

/**
 * The rate of a clock that follows the city's governor (the characters): one scene, one measurement, so it
 * is never faster than the city; where the city rests, a slow pulse of at most `pulse` frames a second and
 * at most a tenth of the device's time, from the cost the city measured.
 */
export function followerFps(own: number, city: AmbientReport, pulse = 2): number {
  switch (city.state) {
    case "still":
      return 0;
    case "measuring":
      return own;
    case "live":
    case "eased":
      return Math.min(own, city.fps);
    case "resting":
      return city.frameMs !== null && city.frameMs > 0 ? Math.min(own, pulse, Math.floor((100 / city.frameMs) * 100) / 100) : 0;
  }
}

/**
 * Requests frames for the ambient life at the affordable rate (halved while
 * `busy`), only while the tab is visible, and returns that rate (0: the city
 * stands still). After a one-second warm-up it counts the frames delivered in
 * a two-second window and lowers the rate if the device cannot keep up; it
 * never raises it again (a quality change or a new game starts afresh).
 */
export function useAmbientClock({
  fps,
  busy,
  active,
  onState,
  floor = 0,
  measure = true,
}: {
  fps: number;
  busy: boolean;
  active: boolean;
  onState?: ((state: AmbientState, fps: number, frameMs: number | null) => void) | undefined;
  floor?: number;
  /** False: run at `fps` as given (a clock that follows another's governor). */
  measure?: boolean;
}): number {
  const invalidate = useThree((s) => s.invalidate);
  const [rate, setRate] = useState(fps);
  const [measured, setMeasured] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  useEffect(() => {
    setRate(fps);
    setMeasured(false);
    setCost(null);
  }, [fps]);
  const live = active && rate > 0;
  useEffect(
    () => onState?.(!active ? "still" : rate === 0 ? "resting" : rate < fps ? "eased" : measured ? "live" : "measuring", active ? rate : 0, cost),
    [active, rate, fps, measured, cost, onState],
  );

  // Frame timing, from frames drawn while only the city moves (not while tokens move, not in the warm-up).
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    if (!live || !measure) return;
    // A one-second warm-up skips the first frames (shader compilation, the scene's first upload); then a
    // two-second window counts the frames delivered against those asked for. Tokens moving or a hidden tab
    // restart the window (other frames would be counted, or none asked for).
    const WARM_UP = 1000;
    const WINDOW = 2000;
    let windowStart = performance.now() + WARM_UP;
    let delivered = 0;
    const work: number[] = [];
    let start = 0;
    let decided = false;
    const restart = () => {
      windowStart = performance.now();
      delivered = 0;
      work.length = 0;
    };
    const before = addEffect(() => {
      start = performance.now();
    });
    const after = addAfterEffect(() => {
      if (decided) return;
      const now = performance.now();
      if (busyRef.current || document.visibilityState === "hidden") return restart();
      if (now < windowStart) return;
      delivered++;
      work.push(now - start);
      if (now - windowStart >= WINDOW) {
        decided = true;
        const next = affordableFps(rate, now - windowStart, delivered, work, floor);
        setCost(frameCost(rate, now - windowStart, delivered, work));
        if (next < rate) setRate(next);
        setMeasured(true);
      }
    });
    return () => {
      before();
      after();
    };
  }, [live, rate, floor, measure]);

  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer || document.visibilityState === "hidden") return;
      timer = setInterval(() => invalidate(), 1000 / (busy ? rate / 2 : rate));
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live, rate, busy, invalidate]);
  return live ? rate : 0;
}

/** True when an ambient update is due: movers update at most `fps` times a second, however often the board renders. */
export function makeThrottle(fps: number): (now: number) => boolean {
  let last = -Infinity;
  const gap = 1 / Math.max(1, fps);
  return (now: number) => {
    if (now - last < gap * 0.9) return false;
    last = now;
    return true;
  };
}
