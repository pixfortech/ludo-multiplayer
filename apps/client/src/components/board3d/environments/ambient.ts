// Ambient life runs on its own clock. The board renders on demand (only while
// something changes), so the city asks for frames at a modest, capped rate:
// fewer while tokens are moving (the board's motion comes first), none while
// the tab is hidden, none under reduced motion. Movers compute their position
// from the time, so a skipped frame never makes anything jump or drift.

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
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

/** Requests frames for the ambient life at `fps` (halved while `busy`), only while the tab is visible. */
export function AmbientClock({ fps, busy, active }: { fps: number; busy: boolean; active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active || fps <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer || document.visibilityState === "hidden") return;
      timer = setInterval(() => invalidate(), 1000 / (busy ? fps / 2 : fps));
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
  }, [fps, busy, active, invalidate]);
  return null;
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
