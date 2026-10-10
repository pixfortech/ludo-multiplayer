// What this device can render, and which board view the player prefers.
// Kept tiny and free of three.js: it ships in the main bundle, while the 3D
// renderer itself is a lazily loaded chunk.

import { useCallback, useEffect, useState } from "react";
import { browserStorage } from "../../lib/session";

/** The board views. "2.5d" is the default; "3d" is the immersive camera preview; "2d" is the lightweight SVG board. */
export type BoardViewMode = "2.5d" | "3d" | "2d";
export type QualityLevel = "low" | "medium" | "high";
export type DeviceClass = "phone" | "tablet" | "desktop";

let webgl: boolean | null = null;

/** WebGL 2 is available (checked once). Software renderers count: performance is watched separately. */
export function hasWebGL2(): boolean {
  if (webgl !== null) return webgl;
  // jsdom (unit tests) has no canvas: the 2D board is used there.
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return (webgl = false);
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    webgl = Boolean(gl);
    (gl?.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null)?.loseContext?.();
  } catch {
    webgl = false;
  }
  return webgl;
}

export function deviceClass(width = globalThis.innerWidth ?? 1280, height = globalThis.innerHeight ?? 800): DeviceClass {
  const short = Math.min(width, height);
  if (short < 600) return "phone";
  if (Math.max(width, height) < 1280 || short < 720) return "tablet";
  return "desktop";
}

/** The automatic quality for a device class: phones low, everything else medium (it drops further if frames are slow). */
export function autoQuality(device: DeviceClass): QualityLevel {
  return device === "phone" ? "low" : "medium";
}

export interface ViewPreference {
  /** Null until the player picks: the board then follows the default (2.5D where WebGL works). */
  mode: BoardViewMode | null;
  /** Null = automatic. */
  quality: QualityLevel | null;
}

const KEY = "ludo.board-view.v1";
const MODES: readonly BoardViewMode[] = ["2.5d", "3d", "2d"];
const QUALITIES: readonly QualityLevel[] = ["low", "medium", "high"];

export function readViewPreference(): ViewPreference {
  try {
    const raw = JSON.parse(browserStorage("local")?.getItem(KEY) ?? "{}") as Partial<Record<keyof ViewPreference, unknown>>;
    return {
      mode: MODES.includes(raw.mode as BoardViewMode) ? (raw.mode as BoardViewMode) : null,
      quality: QUALITIES.includes(raw.quality as QualityLevel) ? (raw.quality as QualityLevel) : null,
    };
  } catch {
    return { mode: null, quality: null };
  }
}

function writeViewPreference(pref: ViewPreference): void {
  try {
    browserStorage("local")?.setItem(KEY, JSON.stringify(pref));
  } catch {
    // a convenience only
  }
}

/** The player's board view and quality, remembered in this browser. */
export function useViewPreference(): [ViewPreference, (next: Partial<ViewPreference>) => void] {
  const [pref, setPref] = useState<ViewPreference>(readViewPreference);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPref(readViewPreference());
    };
    globalThis.addEventListener?.("storage", onStorage);
    return () => globalThis.removeEventListener?.("storage", onStorage);
  }, []);
  const update = useCallback((next: Partial<ViewPreference>) => {
    setPref((current) => {
      const merged = { ...current, ...next };
      writeViewPreference(merged);
      return merged;
    });
  }, []);
  return [pref, update];
}
