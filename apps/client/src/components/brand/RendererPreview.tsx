// 2D / 3D view preview. 2D is the board players will use first; the 3D
// renderer does not exist yet, so its tab shows the same board tilted in
// perspective, clearly marked as a preview of a view in development.

import { ClassicBoardArt, type BoardPiece } from "./ClassicBoardArt";

const PIECES: BoardPiece[] = [
  { key: "a", seat: 0, step: 9 },
  { key: "b", seat: 1, step: 4 },
  { key: "c", seat: 2, step: 53 },
  { key: "d", seat: 3, step: 33 },
  { key: "e", seat: 0, step: null, slot: 3 },
  { key: "f", seat: 1, step: null, slot: 2 },
  { key: "g", seat: 2, step: null, slot: 0 },
  { key: "h", seat: 3, step: null, slot: 1 },
];

export function RendererPreview({ mode }: { mode: "2d" | "3d" }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-[radial-gradient(120%_80%_at_50%_0%,#ffffff_0%,#efebe3_70%)] p-5 [perspective:1100px]">
      <div
        className="mx-auto max-w-[340px] transition-transform duration-500 ease-[var(--ease-standard)]"
        style={{ transform: mode === "3d" ? "rotateX(52deg) rotateZ(-8deg) translateY(-6%) scale(0.92)" : "none", transformStyle: "preserve-3d" }}
      >
        <ClassicBoardArt pieces={PIECES} title={mode === "3d" ? "Perspective preview of the planned 3D view" : "2D board view"} />
      </div>
      {mode === "3d" ? (
        <p className="absolute inset-x-4 bottom-3 rounded-[var(--radius-chip)] bg-white/90 px-3 py-2 text-center text-[13px] font-medium text-ink-muted shadow-raised">
          Preview only: the 3D tabletop view is in development.
        </p>
      ) : null}
    </div>
  );
}
