import type { ReactNode } from "react";

type Tone = "available" | "development" | "upcoming" | "neutral" | "accent";

const TONES: Record<Tone, string> = {
  available: "bg-[#e6f4ec] text-[#0b6b39] ring-[#bfe3cd]",
  development: "bg-[#fbf1df] text-[#8a5a0a] ring-[#f0d9ad]",
  upcoming: "bg-[#eef0f4] text-[#4b5262] ring-[#dde1e8]",
  neutral: "bg-[#f3f0ea] text-ink-muted ring-border",
  accent: "bg-[#e8effc] text-[#1a4fb4] ring-[#c9d9f6]",
};

export function Badge({ tone = "neutral", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
