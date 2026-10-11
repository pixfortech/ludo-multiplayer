// Kolkata's landmarks and districts in the scene: built once per detail level
// from landmarks.ts and districts.ts, shared materials, one draw call per
// landmark or district (lamps instanced), never pickable.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MeshLambertMaterial, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";
import { noRaycast } from "../kit";
import type { EnvironmentQuality } from "../ambient";
import { buildBiswaBanglaGate, buildHowrahBridge, buildHowrahStation, buildShaheedMinar, buildVictoriaMemorial, buildWritersBuilding } from "./landmarks";
import { buildContemporaryDistrict, buildCulturalDistrict, buildHeritageDistrict, buildLampPost, buildMaidanFurniture, buildRailings, buildRiversideDistrict, LAMP_POSITIONS } from "./districts";
import { GROUND_Y } from "./layout";

const dummy = new Object3D();

export function KolkataLandmarks({ quality }: { quality: EnvironmentQuality }) {
  const d = quality.detail;
  const res = useMemo(() => {
    const contemporary = buildContemporaryDistrict(d);
    return {
      meshes: [
        ["howrah-bridge", buildHowrahBridge(d)],
        ["victoria-memorial", buildVictoriaMemorial(d)],
        ["writers-building", buildWritersBuilding(d)],
        ["shaheed-minar", buildShaheedMinar(d)],
        ["biswa-bangla-gate", buildBiswaBanglaGate(d)],
        ["howrah-station", buildHowrahStation(d)],
        ["heritage-houses", buildHeritageDistrict(d)],
        ["ghats", buildRiversideDistrict(d)],
        ["book-stalls", buildCulturalDistrict(d)],
        ["maidan", buildMaidanFurniture()],
        ["contemporary-towers", contemporary.solid],
        ["railings", buildRailings(d)],
      ] as const,
      glass: contemporary.glass,
      lamp: buildLampPost(),
      matte: new MeshLambertMaterial({ vertexColors: true }),
      glassy: new MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.35 }),
    };
  }, [d]);
  useEffect(
    () => () => {
      for (const [, g] of res.meshes) g.dispose();
      res.glass.dispose();
      res.lamp.dispose();
      res.matte.dispose();
      res.glassy.dispose();
    },
    [res],
  );
  const lamps = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = lamps.current;
    if (!m) return;
    LAMP_POSITIONS.forEach((p, i) => {
      dummy.position.set(p.x, GROUND_Y, p.z);
      // Each lamp's arm reaches toward the path it lights.
      dummy.rotation.set(0, p.x < -10 ? 0 : p.z < -10 ? -Math.PI / 2 : Math.PI / 2, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [res]);
  return (
    <group name="kolkata-landmarks">
      {res.meshes.map(([id, g]) => (
        <mesh key={id} geometry={g} material={res.matte} raycast={noRaycast} name={`asset:${id}`} />
      ))}
      <mesh geometry={res.glass} material={res.glassy} raycast={noRaycast} name="contemporary-glass" />
      <instancedMesh ref={lamps} args={[res.lamp, res.matte, LAMP_POSITIONS.length]} raycast={noRaycast} name="asset:lamp-posts" />
    </group>
  );
}
