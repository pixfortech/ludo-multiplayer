// The 3D board renderer (lazily loaded: three.js and React Three Fiber are a
// separate chunk). It takes exactly the inputs the 2D ClassicBoard takes, so
// the game screen can switch renderers without touching game state:
// positions come from the playback (the server's state, animated toward it),
// movable tokens and their labels come from the server's legal moves, and a
// pick is reported back the same way. Nothing here knows the rules.
//
// Modes: "2.5d" is a fixed orthographic aerial view (the default); "3d" is the
// immersive camera preview. Rendering is on demand: frames are drawn only
// while something changes or moves.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { PCFShadowMap, PCFSoftShadowMap, Vector3, type Group, type DirectionalLight } from "three";
import type { BoardMaterial2d } from "@ludo/city-themes";
import type { WorldPoint } from "@ludo/board-layouts";
import type { ClassicBoardProps } from "../board/ClassicBoard";
import { CELL, svgToWorld } from "../board/geometry";
import { placeTokens, TOKEN_SCALE } from "../board/placement";
import type { BoardTokenState } from "../board/BoardToken";
import { BoardMesh3D, H } from "./BoardMesh3D";
import { buildBoardModel, type BoardModel } from "./boardModel";
import { CameraRig, type ImmersiveView } from "./CameraRig";
import { DETAIL } from "./geometry3d";
import { Effects3D, MovePreview3D } from "./Overlays3D";
import { TextureCache } from "./textures";
import { Token3D, TokenKit, floorFor, type Token3DInput } from "./Tokens3D";
import type { QualityLevel } from "./capabilities";

export interface Board3DProps extends ClassicBoardProps {
  mode: "2.5d" | "3d";
  quality: QualityLevel;
  reduced: boolean;
  material: BoardMaterial2d;
  immersiveView: ImmersiveView;
  resetKey: number;
  onImmersiveViewChange: (view: ImmersiveView) => void;
  /** The first frame is on screen. */
  onReady: () => void;
  /** The renderer cannot continue (lost context, no first frame): the game screen falls back to 2D. */
  onFailure: (reason: string) => void;
  /** Average frame time (ms) over a stretch of continuous rendering. */
  onFrameStats?: (ms: number) => void;
}

/** Graphics presets (performance-budgets.md § Rendering): gameplay accuracy never changes, only cost. */
const QUALITY = {
  low: { dpr: 1, antialias: false, shadows: false as const, shadowMap: 0, detail: DETAIL.low, physical: false },
  // Medium: soft contact shadows under the tokens (no shadow map pass); High adds real-time shadow maps.
  medium: { dpr: 1.5, antialias: true, shadows: false as const, shadowMap: 0, detail: DETAIL.medium, physical: true },
  high: { dpr: 2, antialias: true, shadows: "soft" as const, shadowMap: 2048, detail: DETAIL.high, physical: true },
};

function Lights({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
  const light = useRef<DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -9.5;
    cam.right = 9.5;
    cam.top = 9.5;
    cam.bottom = -9.5;
    cam.near = 1;
    cam.far = 50;
    cam.updateProjectionMatrix();
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    l.shadow.mapSize.set(mapSize || 512, mapSize || 512);
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
  }, [mapSize]);
  // A soft studio light: mostly broad sky light, for faithful colours on every cell; a gentle key light from
  // high on the upper left gives depth and short contact shadows that never darken a cell enough to misread it.
  return (
    <>
      <hemisphereLight args={["#FFFFFF", "#D8CEC0", 2.55]} />
      <directionalLight ref={light} position={[-3.5, 20, -2.5]} intensity={0.62} castShadow={shadows} />
    </>
  );
}

/** Reports the first frame, and the average frame time over stretches of continuous rendering. */
function FrameWatch({ onReady, onFrameStats }: { onReady: () => void; onFrameStats?: ((ms: number) => void) | undefined }) {
  const ready = useRef(false);
  const stats = useRef({ total: 0, frames: 0 });
  const gl = useThree((s) => s.gl);
  // Renderer counters on the board element (GPU memory objects, draw calls), for tooling and the performance tests.
  const publish = (frameMs?: number) => {
    const host = gl.domElement.closest<HTMLElement>('[data-testid="game-board"]');
    if (!host) return;
    const { memory, render } = gl.info;
    host.dataset.glGeometries = String(memory.geometries);
    host.dataset.glTextures = String(memory.textures);
    host.dataset.glCalls = String(render.calls);
    host.dataset.glTriangles = String(render.triangles);
    if (frameMs !== undefined) host.dataset.frameMs = frameMs.toFixed(1);
  };
  useFrame((_, delta) => {
    if (!ready.current) {
      ready.current = true;
      onReady();
      requestAnimationFrame(() => publish());
    }
    // Only consecutive frames count (on-demand rendering idles in between).
    if (delta > 0.25) return;
    const w = stats.current;
    w.total += delta;
    w.frames++;
    if (w.total >= 2) {
      const ms = (w.total / w.frames) * 1000;
      publish(ms);
      onFrameStats?.(ms);
      stats.current = { total: 0, frames: 0 };
    }
  });
  return null;
}

/**
 * Resizing a canvas clears its drawing buffer, and on-demand rendering would
 * leave it blank: draw again whenever the size or pixel ratio settles.
 */
function RedrawOnResize() {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const frame = requestAnimationFrame(() => invalidate());
    const later = setTimeout(() => invalidate(), 120);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(later);
    };
  }, [size.width, size.height, dpr, invalidate]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && invalidate();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [invalidate]);
  return null;
}

/** Lost WebGL contexts end the 3D view: the game continues on the 2D board. */
function ContextWatch({ onFailure }: { onFailure: (reason: string) => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      onFailure("context-lost");
    };
    el.addEventListener("webglcontextlost", lost);
    return () => el.removeEventListener("webglcontextlost", lost);
  }, [gl, onFailure]);
  return null;
}

/**
 * Writes each token's step, state and on-screen position (relative to the
 * canvas) to a hidden list after every frame, for tests and tooling (the 2D
 * board exposes the same data on its token elements).
 */
function Projection({ objects, mirror, cells }: { objects: Map<string, Group>; mirror: React.RefObject<HTMLUListElement | null>; cells: React.RefObject<HTMLOListElement | null> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const lastView = useRef("");
  useFrame(() => {
    // Board cells move on screen only when the camera or the canvas does.
    const view = `${size.width}x${size.height}:${camera.matrixWorld.elements.join(",")}:${camera.projectionMatrix.elements.join(",")}`;
    const cellList = cells.current;
    if (cellList && view !== lastView.current) {
      lastView.current = view;
      for (const el of cellList.children as HTMLCollectionOf<HTMLElement>) {
        v.set(Number(el.dataset.x), Number(el.dataset.y), Number(el.dataset.z)).project(camera);
        el.dataset.cx = (((v.x + 1) / 2) * size.width).toFixed(1);
        el.dataset.cy = (((1 - v.y) / 2) * size.height).toFixed(1);
      }
    }
    const list = mirror.current;
    if (!list) return;
    for (const el of list.children as HTMLCollectionOf<HTMLElement>) {
      const obj = objects.get(el.dataset.key ?? "");
      if (!obj) continue;
      obj.getWorldPosition(v);
      v.y += 0.3;
      v.project(camera);
      el.dataset.cx = (((v.x + 1) / 2) * size.width).toFixed(1);
      el.dataset.cy = (((1 - v.y) / 2) * size.height).toFixed(1);
    }
    // Default priority: a positive one would turn off React Three Fiber's own rendering.
    // Mounted after the tokens, so it runs after they have moved this frame.
  });
  return null;
}

/** A tap that misses every token but lands near a movable one picks it (forgiving on touch screens). */
function TapCatcher({ candidates, onActivate }: { candidates: readonly { key: string; at: WorldPoint }[]; onActivate?: ((key: string) => void) | undefined }) {
  if (!onActivate || candidates.length === 0) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    let best: string | null = null;
    let bestD = 0.85;
    for (const c of candidates) {
      const d = Math.hypot(c.at.x - e.point.x, c.at.z - e.point.z);
      if (d < bestD) {
        bestD = d;
        best = c.key;
      }
    }
    if (best) onActivate(best);
  };
  return (
    <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
      <planeGeometry args={[15, 15]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

const Board3D = memo(function Board3D(props: Board3DProps) {
  const { tokens, identityOf, activeSeats, currentSeat, youSeat, states = {}, badges = {}, labels = {}, motion = {}, preview = null, effects = [], onActivate, onPreview, title, dimmed = false, mode, quality, reduced, material, immersiveView, resetKey, onImmersiveViewChange, onReady, onFailure, onFrameStats } = props;
  const q = QUALITY[quality];
  const textures = useMemo(() => new TextureCache(), []);
  const kit = useMemo(() => new TokenKit(q.detail, q.physical), [q.detail, q.physical]);
  useEffect(() => () => kit.dispose(), [kit]);
  useEffect(() => () => textures.dispose(), [textures]);

  const objects = useMemo(() => new Map<string, Group>(), []);
  const register = useCallback(
    (key: string, object: Group | null) => {
      if (object) objects.set(key, object);
      else objects.delete(key);
    },
    [objects],
  );

  // The 2D board's placements (stacks included), in world units.
  const placements = useMemo(() => placeTokens(tokens), [tokens]);
  const seatsKey = [...activeSeats].sort().join(",");
  const model: BoardModel = useMemo(() => buildBoardModel(material, seatsKey ? seatsKey.split(",").map(Number) : []), [material, seatsKey]);
  const items: Token3DInput[] = useMemo(
    () =>
      placements.map((p) => {
        const state: BoardTokenState = p.finished ? "finished" : (states[p.key] ?? "idle");
        return {
          key: p.key,
          identity: identityOf(p.playerId),
          step: p.step,
          at: svgToWorld(p),
          scale: p.size / (CELL * TOKEN_SCALE),
          state,
          motion: motion[p.key],
          badge: badges[p.key] ?? null,
          count: p.stackSize >= 5 && p.stackIndex === p.stackSize - 1 ? p.stackSize : null,
          interactive: Boolean(onActivate) && (state === "movable" || state === "selected"),
        };
      }),
    [placements, states, identityOf, motion, badges, onActivate],
  );
  const candidates = useMemo(() => items.filter((t) => t.interactive).map((t) => ({ key: t.key, at: t.at })), [items]);

  // What the immersive camera follows: the token on the move, else the selected or first movable one, else the current base.
  const focus: WorldPoint | null = useMemo(() => {
    const active = items.find((t) => motion[t.key] && props.raised?.includes(t.key)) ?? items.find((t) => t.state === "selected") ?? items.find((t) => t.state === "movable");
    if (active) return active.at;
    if (currentSeat === null) return null;
    const own = items.filter((t) => t.step === null && placements.find((p) => p.key === t.key)?.seat === currentSeat);
    if (own.length === 0) return null;
    return { x: own.reduce((s, t) => s + t.at.x, 0) / own.length, z: own.reduce((s, t) => s + t.at.z, 0) / own.length };
  }, [items, motion, props.raised, currentSeat, placements]);

  const mirror = useRef<HTMLUListElement>(null);
  const cellMirror = useRef<HTMLOListElement>(null);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(
    (reason: string) => {
      setFailed(true);
      onFailure(reason);
    },
    [onFailure],
  );

  // No first frame in time: give up on 3D for this session.
  const readyRef = useRef(false);
  const ready = useCallback(() => {
    readyRef.current = true;
    onReady();
  }, [onReady]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readyRef.current) fail("no-first-frame");
    }, 8000);
    return () => clearTimeout(timer);
  }, [fail]);

  return (
    <div className="relative aspect-square w-full select-none" data-testid="game-board" data-renderer={mode} data-quality={quality} data-camera={mode === "2.5d" ? "aerial" : immersiveView} role="group" aria-label={title} style={{ opacity: dimmed ? 0.92 : 1, transition: "opacity 220ms ease" }}>
      {failed ? null : (
        <Canvas
          key={quality}
          frameloop="demand"
          flat
          dpr={[1, q.dpr]}
          shadows={q.shadows ? { enabled: true, type: q.shadows === "soft" ? PCFSoftShadowMap : PCFShadowMap } : false}
          gl={{ antialias: q.antialias, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
          style={{ touchAction: mode === "3d" ? "none" : "pan-y pinch-zoom", cursor: mode === "3d" ? "grab" : "default" }}
          data-testid="board-canvas"
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <ContextWatch onFailure={fail} />
          <RedrawOnResize />
          <FrameWatch onReady={ready} onFrameStats={onFrameStats} />
          <CameraRig mode={mode === "2.5d" ? "aerial" : "immersive"} view={immersiveView} resetKey={resetKey} focus={focus} reduced={reduced} onViewChange={onImmersiveViewChange} />
          <Lights shadows={Boolean(q.shadows)} mapSize={q.shadowMap} />
          <BoardMesh3D model={model} material={material} currentSeat={currentSeat} youSeat={youSeat} detail={q.detail} shadows={Boolean(q.shadows)} textures={textures} />
          {preview ? <MovePreview3D preview={preview} detail={q.detail} /> : null}
          {items.map((t) => (
            <Token3D key={t.key} token={t} kit={kit} textures={textures} shadows={Boolean(q.shadows)} reduced={reduced} register={register} {...(t.interactive ? { onActivate, onPreview } : {})} />
          ))}
          <TapCatcher candidates={candidates} onActivate={onActivate} />
          <Effects3D effects={effects} detail={q.detail} />
          <Projection objects={objects} mirror={mirror} cells={cellMirror} />
        </Canvas>
      )}
      {/* The board for assistive tech and tests: each token's step and state (the move tray offers the choices). */}
      <ul ref={mirror} className="sr-only" aria-hidden="true" data-testid="board-mirror">
        {items.map((t) => (
          <li key={t.key} data-key={t.key} data-testid={`token-${t.key}`} data-step={t.step === null ? "base" : t.step} data-state={t.state} data-floor={floorFor(t.step)} data-label={labels[t.key]} />
        ))}
      </ul>
      {/* The board's cells with their drawn colours and on-screen centres (tests check the pixels against the layout). */}
      <ol ref={cellMirror} className="sr-only" aria-hidden="true" data-testid="board-cells-mirror">
        {model.tiles.map((t) => (
          <li key={`t${t.cell.row}-${t.cell.col}`} data-kind={t.kind} data-row={t.cell.row} data-col={t.cell.col} data-index={t.index ?? undefined} data-seat={t.seat ?? undefined} data-colour={t.colour} data-x={t.x} data-y={H.plate + H.tile} data-z={t.z} />
        ))}
        {model.stars.map((st, i) => (
          <li key={`s${i}`} data-kind="star" data-colour={st.colour} data-x={st.x} data-y={H.plate + H.tile + H.inlay} data-z={st.z} />
        ))}
      </ol>
      {preview ? <span className="sr-only" aria-hidden="true" data-testid="move-preview-3d" data-to={preview.to} /> : null}
    </div>
  );
});

export default Board3D;
