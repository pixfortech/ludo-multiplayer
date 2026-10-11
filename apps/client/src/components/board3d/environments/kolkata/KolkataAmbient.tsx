// Kolkata's ambient life: yellow taxis on the ring road, trams round the
// Maidan, ferries on the Hooghly, people on the promenade, the ghats, the
// Maidan and the plaza. One instanced mesh per kind (five draw calls in all).
// Positions come from the time (movers.ts), updated at most at the quality's
// ambient rate; under reduced motion everything stays parked. Nothing here
// takes pointer events, casts shadows or reads or writes game state.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";
import { hash01, noRaycast } from "../kit";
import { ambientTime, makeThrottle, type EnvironmentQuality } from "../ambient";
import { CLOTHES, buildFerry, buildPedestrian, buildTaxi, buildTram, moverAt, moversFor, type Mover, type MoverKind } from "./movers";

const dummy = new Object3D();
const tint = new Color();

export function KolkataAmbient({ quality, reduced }: { quality: EnvironmentQuality; reduced: boolean }) {
  const { taxis, trams, ferries, pedestrians } = quality;
  const movers = useMemo(() => {
    const all = moversFor({ taxis, trams, ferries, pedestrians });
    const of = (k: MoverKind) => all.filter((m) => m.kind === k);
    return { taxi: of("taxi"), tram: of("tram"), ferry: of("ferry"), pedestrian: of("pedestrian") };
  }, [taxis, trams, ferries, pedestrians]);
  const res = useMemo(() => {
    const walker = buildPedestrian();
    return {
      taxi: buildTaxi(),
      tram: buildTram(),
      ferry: buildFerry(),
      body: walker.body,
      head: walker.head,
      paint: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }),
      cloth: new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    };
  }, []);
  useEffect(
    () => () => {
      for (const g of [res.taxi, res.tram, res.ferry, res.body, res.head]) g.dispose();
      res.paint.dispose();
      res.cloth.dispose();
    },
    [res],
  );

  const taxiMesh = useRef<InstancedMesh>(null);
  const tramMesh = useRef<InstancedMesh>(null);
  const ferryMesh = useRef<InstancedMesh>(null);
  const bodyMesh = useRef<InstancedMesh>(null);
  const headMesh = useRef<InstancedMesh>(null);

  const place = (t: number) => {
    const put = (mesh: InstancedMesh | null, list: readonly Mover[], pose: (m: Mover, i: number) => void) => {
      if (!mesh) return;
      list.forEach((m, i) => {
        const p = moverAt(m, t);
        dummy.position.set(p.x, m.loop.y, p.z);
        dummy.rotation.set(0, p.heading, 0);
        pose(m, i);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    put(taxiMesh.current, movers.taxi, () => undefined);
    put(tramMesh.current, movers.tram, () => undefined);
    // Ferries ride the river's swell a little.
    put(ferryMesh.current, movers.ferry, (m) => {
      dummy.position.y += Math.sin(t * 1.3 + m.seed) * 0.012;
      dummy.rotation.x = Math.sin(t * 0.9 + m.seed * 2) * 0.03;
    });
    // Walkers bob with their steps.
    const step = (m: Mover) => {
      dummy.position.y += Math.abs(Math.sin(t * 7 + m.seed * 1.7)) * 0.012;
    };
    put(bodyMesh.current, movers.pedestrian, step);
    put(headMesh.current, movers.pedestrian, step);
  };

  useLayoutEffect(() => {
    // Each walker's clothes, and a slightly different skin tone and hair.
    movers.pedestrian.forEach((m, i) => {
      bodyMesh.current?.setColorAt(i, tint.set(CLOTHES[(m.seed * 7 + i * 3) % CLOTHES.length]!));
      headMesh.current?.setColorAt(i, tint.setScalar(0.8 + hash01(m.seed + i * 13) * 0.35));
    });
    for (const mesh of [bodyMesh.current, headMesh.current]) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    place(reduced ? 0 : ambientTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `place` reads the refs and movers already listed
  }, [movers, reduced]);

  const due = useMemo(() => makeThrottle(quality.fps), [quality.fps]);
  useFrame(() => {
    if (reduced) return;
    const now = ambientTime();
    if (due(now)) place(now);
  });

  // Movers change place every update, so their bounds are never computed once and culled with: frustum culling is off.
  return (
    <group name="kolkata-ambient">
      <instancedMesh key={`taxi-${movers.taxi.length}`} ref={taxiMesh} args={[res.taxi, res.paint, movers.taxi.length]} raycast={noRaycast} frustumCulled={false} name="asset:yellow-taxi" />
      <instancedMesh key={`tram-${movers.tram.length}`} ref={tramMesh} args={[res.tram, res.paint, movers.tram.length]} raycast={noRaycast} frustumCulled={false} name="asset:tram" />
      <instancedMesh key={`ferry-${movers.ferry.length}`} ref={ferryMesh} args={[res.ferry, res.paint, movers.ferry.length]} raycast={noRaycast} frustumCulled={false} name="asset:ferry" />
      <group name="asset:pedestrians">
        <instancedMesh key={`body-${movers.pedestrian.length}`} ref={bodyMesh} args={[res.body, res.cloth, movers.pedestrian.length]} raycast={noRaycast} frustumCulled={false} />
        <instancedMesh key={`head-${movers.pedestrian.length}`} ref={headMesh} args={[res.head, res.cloth, movers.pedestrian.length]} raycast={noRaycast} frustumCulled={false} />
      </group>
    </group>
  );
}
