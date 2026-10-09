// The room code, large and spaced in 3+3 groups, with copy and share. The share
// link carries only the public room code (never a credential).

import { useEffect, useRef, useState } from "react";
import { formatRoomCode } from "../../lib/format";
import { paths } from "../../lib/router";
import { CheckIcon, CopyIcon, ShareIcon } from "../ui/Icons";

export function inviteLink(code: string): string {
  const origin = globalThis.location?.origin ?? "";
  return `${origin}${paths.join(code)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RoomCodeCard({ code, compact = false }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (what: "code" | "link") => {
    setCopied(what);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1800);
  };

  const share = async () => {
    const link = inviteLink(code);
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "Join my Ludo game", text: `Join my Ludo game with code ${formatRoomCode(code)}`, url: link });
        return;
      } catch {
        // cancelled or unsupported: fall back to copying the link
      }
    }
    if (await copyText(link)) flash("link");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Room code</span>
        <span aria-live="polite" className="text-[13px] font-semibold text-success">
          {copied === "code" ? "Code copied" : copied === "link" ? "Invite link copied" : ""}
        </span>
      </div>
      <p className={`tabular font-display font-semibold tracking-[0.08em] text-ink ${compact ? "text-[34px] leading-none" : "text-[40px] leading-none sm:text-[46px]"}`} aria-label={`Room code ${[...code].join(" ")}`}>
        {formatRoomCode(code)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={async () => (await copyText(code)) && flash("code")} className="press flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[15px] font-semibold text-ink shadow-raised hover:border-[#cfc7b8]">
          {copied === "code" ? <CheckIcon size={18} className="text-success" /> : <CopyIcon size={18} />}
          Copy code
        </button>
        <button type="button" onClick={share} className="press flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[15px] font-semibold text-ink shadow-raised hover:border-[#cfc7b8]">
          {copied === "link" ? <CheckIcon size={18} className="text-success" /> : <ShareIcon size={18} />}
          Share link
        </button>
      </div>
    </div>
  );
}
