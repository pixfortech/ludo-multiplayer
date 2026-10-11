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
 * What the device can afford for ambient frames. Ambient life is decoration:
 * it may use at most about a third of the device's time. Two measures of a
 * frame's cost, taken from frames drawn while only the city was moving: the
 * main-thread work per frame, and, when frames arrive late (the GPU is the
 * bottleneck, as with software WebGL), the interval between them. Returns the
 * asked rate when it is affordable, a lower rate when not, or 0 (the city
 * rests, standing still) below 3 frames a second.
 */
export function affordableFps(askedFps: number, intervals: readonly number[], workMs: readonly number[]): number {
  if (askedFps <= 0 || intervals.length < 8) return askedFps;
  const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const interval = median(intervals);
  // Within a frame (vsync) and a quarter of the asked interval: frames arrive on time.
  const late = interval > (1000 / askedFps) * 1.25 + 17;
  const cost = Math.max(median(workMs), late ? interval : 0);
  if (cost <= 0) return askedFps;
  const affordable = Math.min(askedFps, Math.floor((1000 / 3 / cost) * 10) / 10);
  return affordable >= 3 ? affordable : 0;
}

/** Ambient life: "live" at its quality's rate, "eased" (slower, the device is slow), "resting" (stopped, the device cannot afford it), "still" (reduced motion). */
export type AmbientState = "live" | "eased" | "resting" | "still";

/**
 * Requests frames for the ambient life at the affordable rate (halved while
 * `busy`), only while the tab is visible, and returns that rate (0: the city
 * stands still). After a warm-up it watches the frames it asked for and lowers
 * the rate once if the device cannot keep up; it never raises it again (a
 * quality change or a new game starts afresh).
 */
export function useAmbientClock({ fps, busy, active, onState }: { fps: number; busy: boolean; active: boolean; onState?: ((state: AmbientState, fps: number) => void) | undefined }): number {
  const invalidate = useThree((s) => s.invalidate);
  const [rate, setRate] = useState(fps);
  useEffect(() => setRate(fps), [fps]);
  const live = active && rate > 0;
  useEffect(() => onState?.(!active ? "still" : rate === 0 ? "resting" : rate < fps ? "eased" : "live", active ? rate : 0), [active, rate, fps, onState]);

  // Frame timing, from frames drawn while only the city moves (not while tokens move, not in the warm-up).
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    if (!live) return;
    const since = performance.now();
    const intervals: number[] = [];
    const work: number[] = [];
    let start = 0;
    let last = 0;
    let decided = false;
    const before = addEffect(() => {
      start = performance.now();
    });
    const after = addAfterEffect(() => {
      const now = performance.now();
      const measuring = !decided && !busyRef.current && document.visibilityState !== "hidden" && now - since > 2500;
      if (measuring && last > 0) {
        intervals.push(now - last);
        work.push(now - start);
      }
      last = measuring ? now : 0;
      if (intervals.length >= 12) {
        decided = true;
        const next = affordableFps(rate, intervals, work);
        if (next < rate) setRate(next);
      }
    });
    return () => {
      before();
      after();
    };
  }, [live, rate]);

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
