// The board view controls: 2.5D (default), the 3D preview or the lightweight
// 2D board; graphics quality; and, in 3D, the camera (overview, follow the
// active token). Only working controls are shown: 3D options are disabled,
// with the reason, where WebGL is unavailable or the 3D view has failed.

import { Segmented } from "../ui/Segmented";
import type { ImmersiveView } from "./CameraRig";
import type { BoardViewMode, QualityLevel } from "./capabilities";

export interface BoardViewControlsProps {
  mode: BoardViewMode;
  /** Why 3D is unavailable, if it is. */
  unavailable: string | null;
  quality: QualityLevel | "auto";
  immersiveView: ImmersiveView;
  onMode: (mode: BoardViewMode) => void;
  onQuality: (quality: QualityLevel | "auto") => void;
  onOverview: () => void;
  onFollow: () => void;
  /** Human characters are shown (a prototype, C.3A): say so. */
  characters?: boolean;
  /** Where the characters stand (loading, all on the board, or which failed and why), or null. */
  characterStatus?: string | null;
  /** A character failed to load: offer a retry. */
  characterFailed?: boolean;
  onRetryCharacters?: () => void;
  /** Why pawns are shown in a city with characters (the 2D board, a fallback), or null. */
  pawnNotice?: string | null;
}

export function BoardViewControls({ mode, unavailable, quality, immersiveView, onMode, onQuality, onOverview, onFollow, characters = false, characterStatus = null, characterFailed = false, onRetryCharacters, pawnNotice = null }: BoardViewControlsProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="board-view-controls">
      <Segmented
        label="Board view"
        value={mode}
        onChange={onMode}
        options={[
          { value: "2.5d", label: "2.5D", disabled: unavailable !== null, ariaLabel: "2.5D board" },
          { value: "3d", label: "3D", disabled: unavailable !== null, ariaLabel: "3D board (preview)" },
          { value: "2d", label: "2D", ariaLabel: "2D board (lightweight)" },
        ]}
      />
      {unavailable ? <p className="text-[12px] text-ink-muted">{unavailable}</p> : null}
      {characters && mode !== "2d" ? (
        <p className="text-[12px] text-ink-muted" data-testid="characters-prototype">
          Prototype characters: every team is played by four Kolkata people.
        </p>
      ) : null}
      {characterStatus && mode !== "2d" ? (
        <div className="flex items-start gap-2" data-testid="character-status" data-failed={characterFailed ? "true" : undefined} aria-live="polite">
          <p className={`text-[12px] ${characterFailed ? "text-[#a10d25]" : "text-ink-muted"}`}>{characterStatus}</p>
          {characterFailed && onRetryCharacters ? (
            <button type="button" onClick={onRetryCharacters} className="press shrink-0 rounded-[var(--radius-control)] border border-border bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink">
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {pawnNotice ? (
        <p className="text-[12px] text-ink-muted" data-testid="pawn-notice">
          {pawnNotice}
        </p>
      ) : null}
      {mode !== "2d" ? (
        <Segmented
          label="Graphics"
          value={quality}
          onChange={onQuality}
          options={[
            { value: "auto", label: "Auto" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Med", ariaLabel: "Medium" },
            { value: "high", label: "High" },
          ]}
        />
      ) : null}
      {mode === "3d" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <button type="button" onClick={onOverview} aria-pressed={immersiveView === "overview"} className={`press min-h-11 flex-1 rounded-[var(--radius-control)] border px-3 text-[14px] font-semibold ${immersiveView === "overview" ? "border-ink bg-ink text-white" : "border-border bg-surface text-ink"}`}>
              Overview
            </button>
            <button type="button" onClick={onFollow} aria-pressed={immersiveView === "follow"} className={`press min-h-11 flex-1 rounded-[var(--radius-control)] border px-3 text-[14px] font-semibold ${immersiveView === "follow" ? "border-ink bg-ink text-white" : "border-border bg-surface text-ink"}`}>
              Follow token
            </button>
          </div>
          <p className="text-[12px] text-ink-muted">3D preview: drag to orbit, pinch or scroll to zoom.</p>
        </div>
      ) : null}
    </div>
  );
}
