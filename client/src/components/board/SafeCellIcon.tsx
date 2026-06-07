// Star marker drawn on safe (capture-proof) track cells.
//   • "muted"   → grey star on the plain white safe cells (the 4 star squares).
//   • "onColor" → light star drawn on top of the 4 coloured start squares, so
//                 every one of the 8 safe cells visibly carries a star.
export default function SafeCellIcon({ variant = "muted" }: { variant?: "muted" | "onColor" }) {
  const tone = variant === "onColor" ? "text-white/90" : "text-slate-400/70";
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3/5 w-3/5 ${tone}`}
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2l2.9 6.3L22 9.2l-5 4.6 1.3 6.9L12 17.8 5.7 20.7 7 13.8 2 9.2l7.1-.9L12 2z" />
    </svg>
  );
}
