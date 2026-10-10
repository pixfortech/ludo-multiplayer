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
}

export function BoardViewControls({ mode, unavailable, quality, immersiveView, onMode, onQuality, onOverview, onFollow }: BoardViewControlsProps) {
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
