import type { HTMLAttributes } from "react";

/** Surface card: white, hairline border, raised shadow, card radius. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-[var(--radius-panel)] border border-border bg-surface shadow-[0_1px_2px_rgba(20,24,33,0.06),0_12px_32px_-18px_rgba(20,24,33,0.18)] ${className}`} {...rest} />;
}
