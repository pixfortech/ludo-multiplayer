import { useId } from "react";

export function Switch({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <span id={`${id}-label`} className="text-sm font-semibold text-ink">
          {label}
        </span>
        {description ? (
          <span id={`${id}-desc`} className="text-[13px] text-ink-muted">
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={`press relative inline-flex h-11 w-[60px] shrink-0 items-center rounded-full p-1.5 ${checked ? "bg-accent" : "bg-[#d9d3c8]"}`}
      >
        <span className={`block h-8 w-8 rounded-full bg-white shadow-[0_1px_3px_rgba(20,24,33,0.25)] transition-transform duration-200 ease-[var(--ease-settle)] ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </div>
  );
}
