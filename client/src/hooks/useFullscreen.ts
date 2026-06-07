import { useCallback, useEffect, useState } from "react";

/**
 * Thin wrapper around the browser Fullscreen API.
 * - `supported` is false where the browser blocks it (e.g. iOS Safari), so the
 *   UI can hide the control gracefully instead of showing a dead button.
 * - `toggle` never throws: a blocked/denied request is swallowed silently.
 */
export function useFullscreen() {
  const supported =
    typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement)
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* browser blocked or unsupported — fail gracefully */
    }
  }, []);

  return { isFullscreen, supported, toggle };
}
