import type { LinkStatus } from "../../lib/connection";
import { Spinner } from "./Spinner";

const LABELS: Record<LinkStatus, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

export function ConnectionPill({ status }: { status: LinkStatus }) {
  const tone =
    status === "connected"
      ? "bg-[#e6f4ec] text-[#0b6b39] ring-[#bfe3cd]"
      : status === "offline"
        ? "bg-[#fdecee] text-[#a10d25] ring-[#f5c6cd]"
        : "bg-[#fbf1df] text-[#8a5a0a] ring-[#f0d9ad]";
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${tone}`}>
      {status === "connecting" || status === "reconnecting" ? <Spinner size={12} /> : <span className={`h-2 w-2 rounded-full ${status === "connected" ? "animate-pulse-dot bg-success" : "bg-danger"}`} aria-hidden="true" />}
      {LABELS[status]}
    </span>
  );
}
