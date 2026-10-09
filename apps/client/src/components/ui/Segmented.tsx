// Segmented control (≤ 4 options), as a keyboard-navigable radio group.

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = "md",
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: "md" | "lg";
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const onKey = (event: KeyboardEvent, index: number) => {
    const dir = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const pos = enabled.indexOf(index);
    const next = enabled[(pos + dir + enabled.length) % enabled.length]!;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-semibold text-ink">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid auto-cols-fr grid-flow-col gap-1 rounded-[var(--radius-control)] border border-border bg-[#f6f3ee] p-1">
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={String(option.value)}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.ariaLabel}
              disabled={option.disabled}
              tabIndex={checked ? 0 : -1}
              onKeyDown={(e) => onKey(e, index)}
              onClick={() => onChange(option.value)}
              className={`press flex items-center justify-center gap-1.5 rounded-[9px] px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${size === "lg" ? "min-h-12 text-base" : "min-h-10 text-[15px]"} ${checked ? "bg-surface text-ink shadow-[0_1px_2px_rgba(20,24,33,0.1),0_0_0_1px_rgba(20,24,33,0.06)]" : "text-ink-muted hover:text-ink"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
