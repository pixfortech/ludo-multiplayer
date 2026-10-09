// Colour (= seat) choice: "Auto" first, then the board's colours with their
// symbols. A taken colour is disabled and names who holds it:
// "Crimson — Aman (Taken)". The server decides in the end; this only reflects
// the latest preview.

import { useId, useRef, type KeyboardEvent } from "react";
import type { PlayerIdentity } from "@ludo/design-tokens";
import { SEAT_CORNERS } from "../../lib/format";
import { SparkIcon } from "../ui/Icons";
import { PlayerToken } from "./PlayerToken";

export interface ColourOption {
  identity: PlayerIdentity;
  seat: number;
  takenBy: string | null;
}

export const AUTO_COLOUR = "auto";

export function ColourPicker({ label = "Colour", options, value, onChange }: { label?: string; options: readonly ColourOption[]; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const all = [{ value: AUTO_COLOUR, disabled: false }, ...options.map((o) => ({ value: o.identity.id, disabled: o.takenBy !== null }))];
  const enabled = all.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = Math.max(0, all.findIndex((o) => o.value === value));

  const onKey = (event: KeyboardEvent, index: number) => {
    const dir = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const next = enabled[(enabled.indexOf(index) + dir + enabled.length) % enabled.length]!;
    onChange(all[next]!.value);
    refs.current[next]?.focus();
  };

  const optionClass = (checked: boolean, disabled: boolean) =>
    `press relative flex min-h-[60px] w-full flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border px-2 py-2.5 text-center min-[420px]:flex-row min-[420px]:justify-start min-[420px]:gap-3 min-[420px]:px-3 min-[420px]:py-2 min-[420px]:text-left ${
      disabled ? "cursor-not-allowed border-dashed border-border bg-[#faf8f5]" : checked ? "border-accent bg-[#f5f8fe] shadow-[0_0_0_3px_rgba(31,95,214,0.14)]" : "border-border bg-surface hover:border-[#cfc7b8]"
    }`;

  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-semibold text-ink">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-2">
        <button
          ref={(el) => {
            refs.current[0] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === AUTO_COLOUR}
          tabIndex={selectedIndex === 0 ? 0 : -1}
          onKeyDown={(e) => onKey(e, 0)}
          onClick={() => onChange(AUTO_COLOUR)}
          className={optionClass(value === AUTO_COLOUR, false)}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_200deg,#c8102e,#1f5fd6,#16b060,#f5be00,#c8102e)] p-[3px]">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-surface text-accent">
              <SparkIcon size={16} />
            </span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold text-ink">Auto</span>
            <span className="hidden text-[13px] text-ink-muted min-[420px]:inline">Best free seat for you</span>
          </span>
        </button>
        {options.map((option, i) => {
          const index = i + 1;
          const checked = value === option.identity.id;
          const taken = option.takenBy !== null;
          const name = taken ? `${option.identity.name} — ${option.takenBy} (Taken)` : option.identity.name;
          return (
            <button
              key={option.identity.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={name}
              disabled={taken}
              tabIndex={selectedIndex === index ? 0 : -1}
              onKeyDown={(e) => onKey(e, index)}
              onClick={() => onChange(option.identity.id)}
              className={optionClass(checked, taken)}
            >
              <PlayerToken identity={option.identity} size={36} dimmed={taken} shadow={false} />
              <span className="flex min-w-0 max-w-full flex-col">
                <span className={`text-[14px] font-semibold leading-tight min-[420px]:truncate min-[420px]:text-[15px] ${taken ? "text-ink-muted" : "text-ink"}`}>
                  {option.identity.name}
                  {taken ? <span className="block min-[420px]:inline">{` — ${option.takenBy} (Taken)`}</span> : null}
                </span>
                <span className="hidden text-[13px] text-ink-muted min-[420px]:inline">{SEAT_CORNERS[option.seat] ?? `Seat ${option.seat + 1}`}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
