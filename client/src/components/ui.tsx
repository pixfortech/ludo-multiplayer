// Reusable, premium UI primitives shared across screens.
// All variant styles are full, static class strings so Tailwind can detect them.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFullscreen } from "../hooks/useFullscreen";

type Variant = "primary" | "success" | "secondary" | "ghost" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30",
  success:
    "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30",
  secondary:
    "bg-white/10 hover:bg-white/[0.16] text-white border border-white/15",
  ghost: "bg-transparent hover:bg-white/10 text-slate-300",
  danger: "bg-rose-500/90 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/25",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
        VARIANT_CLASS[variant]
      } ${fullWidth ? "w-full" : ""} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`glass rounded-3xl border border-white/10 shadow-2xl shadow-black/40 ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

/** Small connection indicator: green pulse when online, grey when dropped. */
export function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {connected && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
          connected ? "bg-emerald-400" : "bg-slate-500"
        }`}
      />
    </span>
  );
}

/**
 * Premium full-screen toggle. Hides itself where the browser blocks the
 * Fullscreen API. Keyboard-focusable with a clear label for screen readers.
 */
export function FullscreenToggle({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { isFullscreen, supported, toggle } = useFullscreen();
  if (!supported) return null;

  const label = isFullscreen ? "Exit full screen" : "Full screen";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={isFullscreen}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
        showLabel ? "px-3 py-2 text-xs font-semibold" : "h-9 w-9"
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {isFullscreen ? (
          <>
            <path d="M9 9H4M9 9V4M9 9 4 4" />
            <path d="M15 9h5M15 9V4m0 5 5-5" />
            <path d="M9 15H4m5 0v5m0-5-5 5" />
            <path d="M15 15h5m-5 0v5m0-5 5 5" />
          </>
        ) : (
          <>
            <path d="M4 9V4h5" />
            <path d="M20 9V4h-5" />
            <path d="M4 15v5h5" />
            <path d="M20 15v5h-5" />
          </>
        )}
      </svg>
      {showLabel && <span>{isFullscreen ? "Exit" : "Full screen"}</span>}
    </button>
  );
}

/** Soft gradient backdrop with floating blobs — sits behind all content. */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/50 to-slate-950" />
      <div className="absolute -left-24 -top-32 h-96 w-96 animate-blob rounded-full bg-indigo-600/30 blur-3xl" />
      <div className="absolute -right-24 top-1/3 h-96 w-96 animate-blob rounded-full bg-fuchsia-600/20 blur-3xl [animation-delay:4s]" />
      <div className="absolute -bottom-32 left-1/4 h-96 w-96 animate-blob rounded-full bg-emerald-500/20 blur-3xl [animation-delay:8s]" />
    </div>
  );
}

type ToastKind = "error" | "success" | "info";

const TOAST_CLASS: Record<ToastKind, string> = {
  error: "border-rose-400/30 bg-rose-500/15 text-rose-100",
  success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
  info: "border-sky-400/30 bg-sky-500/15 text-sky-100",
};

const TOAST_ICON: Record<ToastKind, string> = {
  error: "⚠️",
  success: "✓",
  info: "ℹ",
};

/** Polished inline message banner — replaces raw browser-style alerts. */
export function Toast({
  kind = "info",
  children,
  onDismiss,
}: {
  kind?: ToastKind;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className={`flex animate-pop-in items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm font-medium backdrop-blur-xl ${TOAST_CLASS[kind]}`}
    >
      <span className="text-base leading-none">{TOAST_ICON[kind]}</span>
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="rounded-full px-1.5 text-lg leading-none opacity-60 transition hover:opacity-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
