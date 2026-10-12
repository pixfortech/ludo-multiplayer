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

import { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addAfterEffect, addEffect, Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { PCFShadowMap, PCFSoftShadowMap, Vector3, type Group, type DirectionalLight } from "three";
import type { BoardMaterial2d, CityThemeId } from "@ludo/city-themes";
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
import { environmentFor } from "./environments/registry";
import { followerFps, useAmbientClock, type AmbientReport, type AmbientState } from "./environments/ambient";
import type { StageViewport } from "./CameraRig";
import type { IdleBehaviour } from "./characters/brain";
import { CHARACTERS, characterFor, loadableSeats, loadOrder, routinePhase } from "./characters/catalog";
import { characterWork } from "./characters/work";

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
  /** Average work per drawn frame (ms: scene update and draw submission), over stretches of rendering. */
  onFrameStats?: (ms: number) => void;
  /** The city whose 3D environment surrounds the board (null: none, the board alone). */
  environment: CityThemeId | null;
  /**
   * The stage: on wide screens, a city environment is drawn on one canvas behind the whole game screen
   * (this element), with the board kept exactly in its layout slot. Null: the canvas is the board's size.
   */
  stageHost: HTMLElement | null;
  /** A stage is wanted (the canvas waits for its host element). */
  stage: boolean;
  /** Tokens are moving: the city's ambient life eases off. */
  busy: boolean;
  /** The city whose human characters play for their seats (C.3A: Kolkata's Crimson team), or null: pawns. */
  characterCity?: CityThemeId | null;
}

/** Graphics presets (performance-budgets.md § Rendering): gameplay accuracy never changes, only cost. */
const QUALITY = {
  low: { stageDpr: 1, dpr: 1, antialias: false, shadows: false as const, shadowMap: 0, detail: DETAIL.low, physical: false },
  // Medium: soft contact shadows under the tokens (no shadow map pass); High adds real-time shadow maps.
  medium: { stageDpr: 1.25, dpr: 1.5, antialias: true, shadows: false as const, shadowMap: 0, detail: DETAIL.medium, physical: true },
  high: { stageDpr: 1.5, dpr: 2, antialias: true, shadows: "soft" as const, shadowMap: 2048, detail: DETAIL.high, physical: true },
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

/**
 * Reports the first frame, and the average work per frame: the time from the
 * start of a frame's updates to the end of its draw submission. (Frame
 * intervals would mislead: the city asks for frames at a capped rate, so its
 * intervals are long by design.) Publishes renderer counters on `host`.
 */
/**
 * The characters' clock (C.3A). Every frame draws the whole scene, so in a city the characters follow the
 * city's governor (one measurement): never faster than the city, and where it rests (the device cannot
 * afford it), a slow pulse instead of a freeze, within a tenth of the device's time. Without a city they
 * measure for themselves, with the same pulse. Never under reduced motion or in a hidden tab.
 */
const CITY_UNDECIDED: AmbientReport = { state: "measuring", fps: 0, frameMs: null };
const CHARACTER_FPS: Record<QualityLevel, number> = { low: 8, medium: 12, high: 20 };
function CharacterClock({ quality, busy, active, city }: { quality: QualityLevel; busy: boolean; active: boolean; city: AmbientReport | null }) {
  const fps = city ? followerFps(CHARACTER_FPS[quality], city) : CHARACTER_FPS[quality];
  useAmbientClock({ fps, busy, active: active && fps > 0, floor: 2, measure: city === null });
  return null;
}

function FrameWatch({ onReady, onFrameStats, host }: { onReady: () => void; onFrameStats?: ((ms: number) => void) | undefined; host: React.RefObject<HTMLElement | null> }) {
  const ready = useRef(false);
  const gl = useThree((s) => s.gl);
  const publish = useCallback(
    (frameMs?: number) => {
      const el = host.current;
      if (!el) return;
      const { memory, render } = gl.info;
      el.dataset.glGeometries = String(memory.geometries);
      el.dataset.glTextures = String(memory.textures);
      el.dataset.glCalls = String(render.calls);
      el.dataset.glTriangles = String(render.triangles);
      if (frameMs !== undefined) el.dataset.frameMs = frameMs.toFixed(1);
    },
    [gl, host],
  );
  useEffect(() => {
    let start = 0;
    let total = 0;
    let frames = 0;
    let since = performance.now();
    let glPublished = 0;
    const before = addEffect(() => {
      start = performance.now();
    });
    const after = addAfterEffect(() => {
      const now = performance.now();
      total += now - start;
      frames++;
      // Frames drawn since the canvas was created (tests and tooling compare ambient frame rates).
      const el = host.current;
      if (el) el.dataset.frames = String(Number(el.dataset.frames ?? 0) + 1);
      if (frames >= 20 && now - since >= 2000) {
        const ms = total / frames;
        publish(ms);
        // Of which animating the characters (their mixers), per frame.
        if (el) el.dataset.characterMs = (characterWork.ms / frames).toFixed(2);
        characterWork.ms = 0;
        onFrameStats?.(ms);
        total = 0;
        frames = 0;
        since = now;
        glPublished = now;
      } else if (now - glPublished >= 1000) {
        // GPU counts follow what is drawn (an environment loads after the first frame), at most once a second.
        publish();
        glPublished = now;
      }
    });
    return () => {
      before();
      after();
    };
  }, [publish, onFrameStats, host]);
  useFrame(() => {
    if (!ready.current) {
      ready.current = true;
      onReady();
      requestAnimationFrame(() => publish());
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
function Projection({ objects, mirror, cells, anchors }: { objects: Map<string, Group>; mirror: React.RefObject<HTMLUListElement | null>; cells: React.RefObject<HTMLOListElement | null>; anchors: React.RefObject<HTMLUListElement | null> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const lastView = useRef("");
  useFrame(() => {
    // The renderer updates the camera's world matrix only when it draws (after this): bring it up to date
    // first, or the mirror would lag the picture by a frame (and stay stale when no further frame comes).
    camera.updateMatrixWorld();
    // Board cells move on screen only when the camera or the canvas does.
    const view = `${size.width}x${size.height}:${camera.matrixWorld.elements.join(",")}:${camera.projectionMatrix.elements.join(",")}`;
    if (view !== lastView.current) {
      lastView.current = view;
      for (const list of [cells.current, anchors.current]) {
        if (!list) continue;
        for (const el of list.children as HTMLCollectionOf<HTMLElement>) {
          v.set(Number(el.dataset.x), Number(el.dataset.y), Number(el.dataset.z)).project(camera);
          el.dataset.cx = (((v.x + 1) / 2) * size.width).toFixed(1);
          el.dataset.cy = (((1 - v.y) / 2) * size.height).toFixed(1);
          // In front of the camera and inside the canvas.
          el.dataset.inView = String(v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1);
        }
      }
    }
    const list = mirror.current;
    if (!list) return;
    for (const el of list.children as HTMLCollectionOf<HTMLElement>) {
      const obj = objects.get(el.dataset.key ?? "");
      if (!obj) continue;
      const u = obj.userData;
      if (u.characterReady) {
        const put = (name: string, value: string) => {
          if (el.dataset[name] !== value) el.dataset[name] = value;
        };
        put("characterReady", "true");
        put("characterState", String(u.characterState ?? ""));
        put("characterClip", String(u.characterClip ?? ""));
        put("characterTeam", String(u.characterTeam));
        put("characterLevel", String(u.characterLevel));
        put("characterClips", (u.characterClips as string[]).join(" "));
      }
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
    <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick} onUpdate={(m) => m.updateWorldMatrix(true, false)}>
      <planeGeometry args={[15, 15]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

/**
 * Where the board's slot is on the stage (the full-window canvas), kept up to
 * date on resize and scroll: the camera keeps the board exactly in its slot.
 */
function useStageViewport(slot: React.RefObject<HTMLElement | null>, host: HTMLElement | null): StageViewport | null {
  const [viewport, setViewport] = useState<StageViewport | null>(null);
  useLayoutEffect(() => {
    if (!host) {
      setViewport(null);
      return;
    }
    const measure = () => {
      const el = slot.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const next = { x: r.left - h.left, y: r.top - h.top, size: r.width, width: h.width, height: h.height };
      setViewport((cur) => (cur && Math.abs(cur.x - next.x) < 0.5 && Math.abs(cur.y - next.y) < 0.5 && Math.abs(cur.size - next.size) < 0.5 && cur.width === next.width && cur.height === next.height ? cur : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (slot.current) observer.observe(slot.current);
    observer.observe(host);
    globalThis.addEventListener("resize", measure);
    globalThis.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", measure);
      globalThis.removeEventListener("scroll", measure, true);
    };
  }, [slot, host]);
  return viewport;
}

const Board3D = memo(function Board3D(props: Board3DProps) {
  const { tokens, identityOf, activeSeats, currentSeat, youSeat, states = {}, badges = {}, labels = {}, motion = {}, preview = null, effects = [], onActivate, onPreview, title, dimmed = false, mode, quality, reduced, material, immersiveView, resetKey, onImmersiveViewChange, onReady, onFailure, onFrameStats, environment, stageHost, stage, busy, characterCity = null } = props;
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
  // Human characters (C.3A): which token is which person, where each team stands, and when its turn began.
  const turnStartedAt = useMemo(() => (currentSeat === null ? null : performance.now()), [currentSeat]);
  const cast = useMemo(() => {
    const byKey = new Map<string, { key: string; behaviour: IdleBehaviour; seat: number }>();
    for (const p of placements) {
      const key = characterFor(characterCity, p.seat, p.tokenId);
      if (key) byKey.set(p.key, { key, behaviour: CHARACTERS[key]!.idle, seat: p.seat });
    }
    const partners = new Map<number, Partial<Record<IdleBehaviour, WorldPoint>>>();
    for (const p of placements) {
      const c = byKey.get(p.key);
      if (!c) continue;
      const team = partners.get(c.seat) ?? {};
      team[c.behaviour] = svgToWorld(p);
      partners.set(c.seat, team);
    }
    return { byKey, partners };
  }, [placements, characterCity]);
  // Until every character has loaded at this level, the scene is busy for the ambient governors: loading
  // (decoding, first upload) must not count as the frames this device can afford.
  const [loadedCharacters, setLoadedCharacters] = useState<ReadonlySet<string>>(() => new Set());
  const onCharacterLoaded = useCallback((key: string, level: string) => setLoadedCharacters((s) => (s.has(`${key}@${level}`) ? s : new Set(s).add(`${key}@${level}`))), []);
  const charactersLoading = !reduced && [...cast.byKey.keys()].some((k) => !loadedCharacters.has(`${k}@${quality}`));
  const sceneBusy = busy || charactersLoading;
  // One team's files at a time (decoding sixteen people at once would stall the page): yours first.
  const loadable = useMemo(() => {
    const seats = [...cast.byKey.values()].map((c) => c.seat);
    const keysOf = (seat: number) => [...cast.byKey].filter(([, c]) => c.seat === seat).map(([k]) => k);
    return loadableSeats(loadOrder(seats, youSeat), (seat) => keysOf(seat).every((k) => loadedCharacters.has(`${k}@${quality}`)));
  }, [cast, youSeat, loadedCharacters, quality]);
  const items: Token3DInput[] = useMemo(
    () =>
      placements.map((p) => {
        const state: BoardTokenState = p.finished ? "finished" : (states[p.key] ?? "idle");
        const c = cast.byKey.get(p.key);
        const character = c
          ? { key: c.key, behaviour: c.behaviour, quality, partners: cast.partners.get(c.seat) ?? {}, turnStartedAt: currentSeat === c.seat ? turnStartedAt : null, phase: routinePhase(c.seat), load: loadable.has(c.seat) }
          : null;
        return {
          character,
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
    [placements, states, identityOf, motion, badges, onActivate, cast, quality, currentSeat, turnStartedAt, loadable],
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
  const anchorMirror = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const viewport = useStageViewport(root, stage ? stageHost : null);
  const env = environmentFor(environment);
  const obstacles = useMemo(() => env?.obstacles() ?? [], [env]);
  const anchors = useMemo(() => env?.anchors() ?? [], [env]);
  // What the environment reports, tagged with the quality it was built at (a quality change rebuilds it: stale reports are not shown).
  const [built, setBuilt] = useState<{ quality: QualityLevel; assets: readonly string[] } | null>(null);
  const onBuilt = useCallback((info: { assets: readonly string[] }) => setBuilt({ quality, assets: info.assets }), [quality]);
  const builtAssets = built?.quality === quality ? built.assets : [];
  const [ambientReport, setAmbient] = useState<(AmbientReport & { quality: QualityLevel }) | null>(null);
  const onAmbient = useCallback((state: AmbientState, fps: number, frameMs: number | null) => setAmbient({ quality, state, fps, frameMs }), [quality]);
  const ambient = ambientReport?.quality === quality ? ambientReport : null;
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

  const staged = stage && stageHost !== null;
  const canvas =
    failed || (stage && !viewport) ? null : (
      <Canvas
        key={quality}
        frameloop="demand"
        flat
        dpr={[1, staged ? q.stageDpr : q.dpr]}
        shadows={q.shadows ? { enabled: true, type: q.shadows === "soft" ? PCFSoftShadowMap : PCFShadowMap } : false}
        gl={{ antialias: q.antialias, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
        style={{ touchAction: mode === "3d" ? "none" : "pan-y pinch-zoom", cursor: mode === "3d" ? "grab" : "default" }}
        data-testid="board-canvas"
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.dataset.boardGl = staged ? "stage" : "board";
        }}
      >
        <ContextWatch onFailure={fail} />
        <CharacterClock quality={quality} busy={sceneBusy} active={cast.byKey.size > 0 && !reduced} city={env ? (ambient ?? CITY_UNDECIDED) : null} />
        <RedrawOnResize />
        <FrameWatch onReady={ready} onFrameStats={onFrameStats} host={root} />
        <CameraRig mode={mode === "2.5d" ? "aerial" : "immersive"} view={immersiveView} resetKey={resetKey} focus={focus} reduced={reduced} onViewChange={onImmersiveViewChange} viewport={staged ? viewport : null} obstacles={obstacles} />
        <Lights shadows={Boolean(q.shadows)} mapSize={q.shadowMap} />
        {env ? (
          <Suspense fallback={null}>
            <env.Component quality={quality} reduced={reduced} busy={sceneBusy} onBuilt={onBuilt} onAmbient={onAmbient} />
          </Suspense>
        ) : null}
        <BoardMesh3D model={model} material={material} currentSeat={currentSeat} youSeat={youSeat} detail={q.detail} shadows={Boolean(q.shadows)} textures={textures} />
        {preview ? <MovePreview3D preview={preview} detail={q.detail} /> : null}
        {items.map((t) => (
          <Token3D key={t.key} token={t} kit={kit} textures={textures} shadows={Boolean(q.shadows)} reduced={reduced} register={register} onCharacterLoaded={onCharacterLoaded} {...(t.interactive ? { onActivate, onPreview } : {})} />
        ))}
        <TapCatcher candidates={candidates} onActivate={onActivate} />
        <Effects3D effects={effects} detail={q.detail} />
        <Projection objects={objects} mirror={mirror} cells={cellMirror} anchors={anchorMirror} />
      </Canvas>
    );

  return (
    <div
      ref={root}
      className="relative aspect-square w-full select-none"
      data-testid="game-board"
      data-renderer={mode}
      data-quality={quality}
      data-camera={mode === "2.5d" ? "aerial" : immersiveView}
      data-stage={staged ? "" : undefined}
      data-environment={env ? environment : undefined}
      data-ambient={env && ambient ? ambient.state : undefined}
      data-ambient-fps={env && ambient ? ambient.fps : undefined}
      role="group"
      aria-label={title}
      // On the stage the canvas lies behind the page: the slot lets pointer events through to it.
      style={{ opacity: dimmed ? 0.92 : 1, transition: "opacity 220ms ease", pointerEvents: staged ? "none" : undefined }}
    >
      {canvas && staged ? createPortal(canvas, stageHost) : canvas}
      {/* The board for assistive tech and tests: each token's step and state (the move tray offers the choices). */}
      <ul ref={mirror} className="sr-only" aria-hidden="true" data-testid="board-mirror">
        {items.map((t) => (
          <li key={t.key} data-key={t.key} data-character={t.character?.key} data-testid={`token-${t.key}`} data-step={t.step === null ? "base" : t.step} data-state={t.state} data-floor={floorFor(t.step)} data-label={labels[t.key]} />
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
      {/* The city's landmarks: which are built, and where each appears on screen (for tooling and tests). */}
      {env ? (
        <ul ref={anchorMirror} className="sr-only" aria-hidden="true" data-testid="environment-mirror" data-city={environment ?? undefined} data-assets={builtAssets.join(" ")}>
          {anchors.map((a) => (
            <li key={a.id} data-id={a.id} data-x={a.x} data-y={a.y} data-z={a.z} />
          ))}
        </ul>
      ) : null}
      {preview ? <span className="sr-only" aria-hidden="true" data-testid="move-preview-3d" data-to={preview.to} /> : null}
    </div>
  );
});

export default Board3D;
