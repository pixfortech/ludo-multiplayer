// Toasts: top-right on desktop, bottom-centre on phones; at most two at a time;
// 4 s each; announced politely to screen readers.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./Icons";

export type ToastTone = "info" | "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  push(toast: Omit<Toast, "id">): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  info: <InfoIcon className="text-accent" />,
  success: <CheckIcon className="text-success" />,
  error: <AlertIcon className="text-danger" />,
};

export function ToastProvider({ children, durationMs = 4000 }: { children: ReactNode; durationMs?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { ...toast, id }].slice(-2));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
    },
    [dismiss, durationMs],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-0 bottom-[var(--action-bar-h,0px)] z-50 flex flex-col items-center gap-2 px-4 pb-[max(12px,env(safe-area-inset-bottom))] md:inset-x-auto md:right-0 md:top-0 md:bottom-auto md:items-end md:p-5">
        {toasts.map((toast) => (
          <div key={toast.id} role={toast.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3.5 pr-2 shadow-overlay">
            <span className="mt-0.5 shrink-0">{ICONS[toast.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{toast.title}</p>
              {toast.body ? <p className="mt-0.5 text-sm text-ink-muted">{toast.body}</p> : null}
            </div>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="press -my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-ink/5 hover:text-ink">
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToasts outside ToastProvider");
  return value;
}
