// The thumb-zone action bar on phones and small tablets (hidden from md up).
// It publishes its height as --action-bar-h so toasts and page padding sit above it.

import { useEffect, useRef, type ReactNode } from "react";

export function MobileActionBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const update = () => root.style.setProperty("--action-bar-h", `${el.offsetHeight}px`);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--action-bar-h");
    };
  }, []);
  return (
    <div ref={ref} className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
      {children}
    </div>
  );
}
