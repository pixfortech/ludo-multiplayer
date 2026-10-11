// Trees of the Maidan, the courtyards, the plaza and the far bank: one
// instanced trunk mesh and one instanced canopy mesh. On Medium and High the
// canopies sway gently (a few degrees, on the ambient clock).

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { IcosahedronGeometry, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";
import { Builder, hash01, noRaycast } from "../kit";
import { ambientTime, makeThrottle, type EnvironmentQuality } from "../ambient";
import { GROUND_Y, TREES } from "./layout";

const dummy = new Object3D();

export function Foliage({ quality, reduced }: { quality: EnvironmentQuality; reduced: boolean }) {
  const trunks = useRef<InstancedMesh>(null);
  const canopies = useRef<InstancedMesh>(null);
  const res = useMemo(() => {
    const trunk = new Builder().cylinder(0, 0, 0.07, 0.11, 0, 0.9, "#6B4E36", 6).build();
    const canopy = new IcosahedronGeometry(0.62, quality.detail === "low" ? 0 : 1);
    canopy.translate(0, 1.25, 0);
    return {
      trunk,
      canopy,
      bark: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      leaves: new MeshStandardMaterial({ color: "#5E8A47", roughness: 0.9, flatShading: true }),
    };
  }, [quality.detail]);
  useEffect(
    () => () => {
      res.trunk.dispose();
      res.canopy.dispose();
      res.bark.dispose();
      res.leaves.dispose();
    },
    [res],
  );
  const place = (sway: number) => {
    const c = canopies.current;
    const t = trunks.current;
    if (!c || !t) return;
    TREES.forEach((tree, i) => {
      const s = tree.scale;
      dummy.position.set(tree.x, GROUND_Y, tree.z);
      dummy.rotation.set(0, hash01(i) * Math.PI, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      t.setMatrixAt(i, dummy.matrix);
      const phase = hash01(i + 50) * Math.PI * 2;
      dummy.rotation.set(Math.sin(sway * 0.9 + phase) * 0.035, hash01(i) * Math.PI, Math.cos(sway * 0.7 + phase) * 0.035);
      dummy.scale.set(s * (0.9 + hash01(i + 9) * 0.3), s * (0.85 + hash01(i + 19) * 0.3), s * (0.9 + hash01(i + 29) * 0.3));
      dummy.updateMatrix();
      c.setMatrixAt(i, dummy.matrix);
    });
    t.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => {
    place(0);
    trunks.current?.computeBoundingSphere();
    canopies.current?.computeBoundingSphere();
  });
  const due = useMemo(() => makeThrottle(Math.min(12, quality.fps)), [quality.fps]);
  useFrame(() => {
    if (!quality.sway || reduced) return;
    const now = ambientTime();
    if (due(now)) place(now);
  });
  return (
    <group name="asset:trees">
      <instancedMesh ref={trunks} args={[res.trunk, res.bark, TREES.length]} raycast={noRaycast} />
      <instancedMesh ref={canopies} args={[res.canopy, res.leaves, TREES.length]} raycast={noRaycast} />
    </group>
  );
}
