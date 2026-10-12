// Chooses the board renderer for the game screen: the 2.5D board (default),
// the immersive 3D preview, or the 2D SVG board. The 3D renderer is a lazily
// loaded chunk; while it loads, if it throws, or if it reports a failure, the
// 2D board is shown. Every renderer takes the same props from the playback,
// so switching never touches the game.

import { Component, lazy, Suspense, type ReactNode } from "react";
import type { BoardMaterial2d, CityThemeId } from "@ludo/city-themes";
import { ClassicBoard, type ClassicBoardProps } from "../board/ClassicBoard";
import { CityPlinth } from "../city/CityFrame";
import type { ImmersiveView } from "./CameraRig";
import type { BoardViewMode, QualityLevel } from "./capabilities";
import type { Die3DState } from "./dice/Die3D";
import type { PresentationCue } from "../game/presentation";

const Board3D = lazy(() => import("./Board3D"));
const NO_CUES: readonly PresentationCue[] = [];

class RendererBoundary extends Component<{ fallback: ReactNode; onError: (reason: string) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? `error: ${error.message}` : "error");
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface BoardViewProps {
  board: ClassicBoardProps;
  /** The renderer to show ("2d" when 3D is unavailable or has failed). */
  mode: BoardViewMode;
  quality: QualityLevel;
  reduced: boolean;
  material: BoardMaterial2d;
  immersiveView: ImmersiveView;
  resetKey: number;
  onImmersiveViewChange: (view: ImmersiveView) => void;
  onReady: () => void;
  onFailure: (reason: string) => void;
  onFrameStats: (ms: number) => void;
  /** The city environment around a 3D board (null: none). */
  environment: CityThemeId | null;
  /** The full-window stage the city is drawn on (wide screens), and whether one is wanted. */
  stageHost: HTMLElement | null;
  stage: boolean;
  /** The city whose human characters replace the pawns of their seats (null: pawns). */
  characterCity?: CityThemeId | null;
  /** Tokens are moving (the city's ambient life eases off). */
  busy: boolean;
  /** The 3D die (the 3D views show it on the board; the 2D board keeps the die in its tray). */
  die?: Die3DState | null;
  /** Moments the characters react to (from the playback). */
  cues?: readonly PresentationCue[];
}

export function BoardView({ board, mode, quality, reduced, material, immersiveView, resetKey, onImmersiveViewChange, onReady, onFailure, onFrameStats, environment, stageHost, stage, busy, characterCity = null, die = null, cues = NO_CUES }: BoardViewProps) {
  const flat = (
    <CityPlinth material={material}>
      <ClassicBoard {...board} material={material} />
    </CityPlinth>
  );
  if (mode === "2d") return flat;
  return (
    <RendererBoundary fallback={flat} onError={onFailure}>
      <Suspense fallback={flat}>
        <Board3D
          {...board}
          mode={mode}
          quality={quality}
          reduced={reduced}
          material={material}
          immersiveView={immersiveView}
          resetKey={resetKey}
          onImmersiveViewChange={onImmersiveViewChange}
          onReady={onReady}
          onFailure={onFailure}
          onFrameStats={onFrameStats}
          environment={environment}
          characterCity={characterCity}
          stageHost={stageHost}
          stage={stage}
          busy={busy}
          die={die}
          cues={cues}
        />
      </Suspense>
    </RendererBoundary>
  );
}
