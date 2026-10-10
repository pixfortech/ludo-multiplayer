// Board overlays in 3D, from server data only (as TokenOverlay in 2D): the
// preview of a legal move (its exact path and destination from the server's
// legal-move list) and short capture / home-entry bursts after a committed move.

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MeshBasicMaterial, type Mesh } from "three";
import { PLAYER_IDENTITIES } from "@ludo/design-tokens";
import { hopSteps, piecePosition, svgToWorld } from "../board/geometry";
import type { BoardEffect, MovePreview } from "../board/TokenOverlay";
import { discGeometry, ringGeometry, type Detail } from "./geometry3d";
import { floorFor } from "./Tokens3D";

export const MovePreview3D = memo(function MovePreview3D({ preview, detail }: { preview: MovePreview; detail: Detail }) {
  const identity = PLAYER_IDENTITIES[preview.seat]!;
  const res = useMemo(
    () => ({
      dot: discGeometry(0.1, 0.012, detail),
      ring: ringGeometry(0.4, 0.48, detail),
      fill: ringGeometry(0, 0.4, detail),
      dotMat: new MeshBasicMaterial({ color: identity.rim, transparent: true, opacity: 0.75 }),
      ringMat: new MeshBasicMaterial({ color: identity.rim }),
      fillMat: new MeshBasicMaterial({ color: identity.body, transparent: true, opacity: 0.18, depthWrite: false }),
    }),
    [detail, identity.rim, identity.body],
  );
  useEffect(
    () => () => {
      for (const g of [res.dot, res.ring, res.fill]) g.dispose();
      for (const m of [res.dotMat, res.ringMat, res.fillMat]) m.dispose();
    },
    [res],
  );
  const steps = hopSteps(preview.from, preview.to);
  const path = steps.slice(0, -1).map((step) => ({ step, at: svgToWorld(piecePosition(preview.seat, step)) }));
  const dest = svgToWorld(piecePosition(preview.seat, preview.to));
  const destFloor = floorFor(preview.to);
  return (
    <group name="move-preview">
      {path.map((p) => (
        <mesh key={p.step} geometry={res.dot} material={res.dotMat} position={[p.at.x, floorFor(p.step) + 0.004, p.at.z]} dispose={null} />
      ))}
      <group position={[dest.x, destFloor + 0.01, dest.z]} name="move-destination">
        <mesh geometry={res.fill} material={res.fillMat} dispose={null} />
        <mesh geometry={res.ring} material={res.ringMat} dispose={null} />
      </group>
    </group>
  );
});

const EFFECT_MS = 720;

function Burst({ effect, detail }: { effect: BoardEffect; detail: Detail }) {
  const ring = useRef<Mesh>(null);
  const glow = useRef<Mesh>(null);
  const start = useRef(performance.now());
  const invalidate = useThree((s) => s.invalidate);
  const home = effect.kind === "home";
  const colour = home ? "#E3B341" : PLAYER_IDENTITIES[effect.seat]!.rim;
  const res = useMemo(
    () => ({
      ring: ringGeometry(0.42, 0.52, detail),
      glow: ringGeometry(0, 0.62, detail),
      ringMat: new MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false }),
      glowMat: new MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, opacity: 0 }),
    }),
    [detail, colour],
  );
  useEffect(
    () => () => {
      res.ring.dispose();
      res.glow.dispose();
      res.ringMat.dispose();
      res.glowMat.dispose();
    },
    [res],
  );
  useFrame(() => {
    const t = Math.min(1, (performance.now() - start.current) / EFFECT_MS);
    ring.current?.scale.setScalar(0.8 + t * (home ? 1.1 : 0.7));
    res.ringMat.opacity = 0.9 * (1 - t);
    if (glow.current) glow.current.scale.setScalar(0.6 + t * 0.6);
    res.glowMat.opacity = home ? 0.35 * Math.sin(Math.PI * t) : 0;
    if (t < 1) invalidate();
  });
  const at = svgToWorld(effect.at);
  const step = effect.kind === "home" ? 56 : 0;
  return (
    <group position={[at.x, floorFor(step) + 0.02, at.z]} name={`effect-${effect.kind}`}>
      <mesh ref={glow} geometry={res.glow} material={res.glowMat} dispose={null} />
      <mesh ref={ring} geometry={res.ring} material={res.ringMat} dispose={null} />
    </group>
  );
}

export function Effects3D({ effects, detail }: { effects: readonly BoardEffect[]; detail: Detail }) {
  return (
    <>
      {effects.map((e) => (
        <Burst key={e.id} effect={e} detail={detail} />
      ))}
    </>
  );
}
