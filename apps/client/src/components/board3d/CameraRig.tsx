// The camera controller. It owns two cameras and switches between them:
//  - aerial (2.5D, the default): orthographic, fixed angle, always fitted to
//    the whole board; no input moves it.
//  - immersive (3D preview): perspective, starting from an isometric
//    overview; drag to orbit, pinch or wheel to zoom (within limits), follow
//    the active token, reset to the overview. Transitions are smooth, and
//    instant under reduced motion.
// The camera only looks: it never moves a token or touches game state.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import type { WorldPoint } from "@ludo/board-layouts";
import { AERIAL_PITCH, aerialPose, blendPose, fitAerial, fitDistance, focusPose, isometricPose, orbit, poseToPosition, type Pose } from "./cameraMath";

export type CameraMode = "aerial" | "immersive";
/** Immersive views: the overview, following the active token, or wherever the player orbited to. */
export type ImmersiveView = "overview" | "follow" | "free";

const FOV = 34;
const FOV_RAD = (FOV * Math.PI) / 180;
const TRANSITION_MS = 650;

export interface CameraRigProps {
  mode: CameraMode;
  view: ImmersiveView;
  /** Bumped to return to the overview. */
  resetKey: number;
  focus: WorldPoint | null;
  reduced: boolean;
  onViewChange: (view: ImmersiveView) => void;
}

export function CameraRig({ mode, view, resetKey, focus, reduced, onViewChange }: CameraRigProps) {
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const cameras = useMemo(() => {
    const ortho = new OrthographicCamera(-10, 10, 10, -10, 0.1, 120);
    const persp = new PerspectiveCamera(FOV, 1, 0.1, 160);
    // Framing is ours: React Three Fiber must not resize these cameras to the canvas in pixels.
    Object.assign(ortho, { manual: true });
    Object.assign(persp, { manual: true });
    return { ortho, persp };
  }, []);
  const aspect = size.width / Math.max(1, size.height);
  const pose = useRef<Pose>(aerialPose());
  const transition = useRef<{ from: Pose; to: Pose; start: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // The aerial camera: fitted to the board for this aspect, looking down at the fixed angle.
  useLayoutEffect(() => {
    if (mode !== "aerial") return;
    const { halfHeight, offsetY } = fitAerial(aspect);
    const cam = cameras.ortho;
    cam.left = -halfHeight * aspect;
    cam.right = halfHeight * aspect;
    cam.top = halfHeight;
    cam.bottom = -halfHeight;
    // Shift the target along the camera's up direction so the board's height is centred too.
    const up = new Vector3(0, Math.cos(AERIAL_PITCH), -Math.sin(AERIAL_PITCH));
    const target = up.clone().multiplyScalar(offsetY);
    const p = poseToPosition({ ...aerialPose(), target: { x: target.x, y: target.y, z: target.z } });
    cam.position.set(p.x, p.y, p.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    set({ camera: cam });
    invalidate();
  }, [mode, aspect, cameras, set, invalidate]);

  const goTo = (to: Pose) => {
    if (reduced) {
      pose.current = to;
      transition.current = null;
    } else transition.current = { from: pose.current, to, start: performance.now() };
    invalidate();
  };

  // Entering the immersive view: start where the aerial view was, then move to the overview.
  useLayoutEffect(() => {
    if (mode !== "immersive") return;
    const cam = cameras.persp;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    pose.current = { ...aerialPose(), distance: fitDistance(FOV_RAD, aspect, AERIAL_PITCH) };
    set({ camera: cam });
    goTo(isometricPose(FOV_RAD, aspect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cameras, set]);

  useEffect(() => {
    cameras.persp.aspect = aspect;
    cameras.persp.updateProjectionMatrix();
    invalidate();
  }, [aspect, cameras, invalidate]);

  // Reset (and the overview button) return to the isometric overview.
  useEffect(() => {
    if (mode === "immersive" && resetKey > 0) goTo(isometricPose(FOV_RAD, aspect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Follow: frame the active token whenever it changes.
  const fx = focus?.x;
  const fz = focus?.z;
  useEffect(() => {
    if (mode !== "immersive" || view !== "follow" || fx === undefined || fz === undefined) return;
    goTo(focusPose({ x: fx, z: fz }, FOV_RAD, aspect, pose.current.yaw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, view, fx, fz]);

  // Orbit and zoom (immersive only): drag with one pointer, pinch with two, or use the wheel.
  useEffect(() => {
    if (mode !== "immersive") return;
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const toFree = () => {
      transition.current = null;
      if (viewRef.current !== "free") onViewChange("free");
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      const now = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, now);
      if (pointers.size === 1) {
        const dx = now.x - last.x;
        const dy = now.y - last.y;
        if (Math.abs(dx) + Math.abs(dy) < 1) return;
        toFree();
        pose.current = orbit(pose.current, dx, dy);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0 && d > 0) {
          toFree();
          pose.current = orbit(pose.current, 0, 0, pinch / d);
        }
        pinch = d;
      }
      invalidate();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      toFree();
      pose.current = orbit(pose.current, 0, 0, Math.exp(e.deltaY * 0.0015));
      invalidate();
    };
    el.addEventListener("pointerdown", down);
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
    globalThis.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
      globalThis.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [mode, gl, invalidate, onViewChange]);

  useFrame(() => {
    if (mode !== "immersive") return;
    const t = transition.current;
    if (t) {
      const k = (performance.now() - t.start) / TRANSITION_MS;
      pose.current = blendPose(t.from, t.to, k);
      if (k >= 1) transition.current = null;
      else invalidate();
    }
    const cam = cameras.persp;
    const p = poseToPosition(pose.current);
    cam.position.set(p.x, p.y, p.z);
    cam.lookAt(pose.current.target.x, pose.current.target.y, pose.current.target.z);
  }, -1);

  return null;
}
