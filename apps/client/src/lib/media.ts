// Media-query hooks shared by animated and pointer-aware components.
import { useEffect, useState } from "react";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const list = globalThis.matchMedia?.(query);
    if (!list) return;
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener?.("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

export const usePrefersReducedMotion = (): boolean => useMediaQuery("(prefers-reduced-motion: reduce)");

/** A mouse or trackpad: hovering previews a move and one click makes it. */
export const useFinePointer = (): boolean => useMediaQuery("(hover: hover) and (pointer: fine)");
