// The 3D board: a bevelled tabletop slab, a raised border, the grid plate,
// bevelled cells (one instanced mesh, coloured per cell), raised stepped
// bases with slot wells, home lanes, inlaid safe stars and chevrons, and the
// raised centre. Everything comes from boardModel (the layout); this file only
// turns it into geometry and materials, built once per board and disposed on
// unmount.

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { InstancedMesh} from "three";
import { Color, DoubleSide, MeshStandardMaterial, Object3D, type BufferGeometry } from "three";
import { WORLD_BOARD_SIZE } from "@ludo/board-layouts";
import type { BoardMaterial2d } from "@ludo/city-themes";
import { PLAYER_IDENTITIES, mixLab } from "@ludo/design-tokens";
import { BOARD_HALF } from "./cameraMath";
import type { BoardModel } from "./boardModel";
import { chevronGeometry, discGeometry, extrudeUp, frameShape, roundedRect, starGeometry, tileGeometry, triangleGeometry, type Detail } from "./geometry3d";
import type { TextureCache } from "./textures";

/** Heights (world units): the board top is y = 0; cells and pieces stand on it. */
export const H = {
  slab: 0.42,
  plate: 0.02,
  tile: 0.12,
  inlay: 0.018,
  border: 0.24,
  centre: 0.16,
} as const;

/** Where a token's foot rests on each kind of square. */
export const TOKEN_FLOOR = { cell: H.plate + H.tile, base: 0.33 + 0.02, centre: H.plate + H.centre } as const;

const CLASSIC_FRAME = { base: "#ECE6DB", light: "#F7F3EC", dark: "#D9D1C3" };

const dummy = new Object3D();

function useInstances(ref: React.RefObject<InstancedMesh | null>, items: readonly { x: number; z: number; y?: number; angle?: number; scale?: number; colour: string }[]) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const colour = new Color();
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y ?? 0, it.z);
      dummy.rotation.set(0, -(it.angle ?? 0), 0);
      dummy.scale.setScalar(it.scale ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colour.set(it.colour));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, items]);
}

function Instances({ geometry, material, items, shadows }: { geometry: BufferGeometry; material: MeshStandardMaterial; items: readonly { x: number; z: number; y?: number; angle?: number; scale?: number; colour: string }[]; shadows: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useInstances(ref, items);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, items.length)]} castShadow={false} receiveShadow={shadows} dispose={null} />;
}

export interface BoardMesh3DProps {
  model: BoardModel;
  material: BoardMaterial2d;
  currentSeat: number | null;
  youSeat: number | null;
  detail: Detail;
  shadows: boolean;
  textures: TextureCache;
}

export const BoardMesh3D = memo(function BoardMesh3D({ model, material, currentSeat, youSeat, detail, shadows, textures }: BoardMesh3DProps) {
  const frame = material.plinth ?? CLASSIC_FRAME;

  // Geometries (shared by every instance) and materials, disposed with the board.
  const res = useMemo(() => {
    const satin = (colour: string, roughness: number) => new MeshStandardMaterial({ color: colour, roughness, metalness: 0 });
    const white = (roughness: number) => new MeshStandardMaterial({ color: "#FFFFFF", roughness, metalness: 0 });
    const tierHeights = [...new Set(model.tiers.map((t) => `${t.size}:${t.height}`))];
    return {
      slab: extrudeUp(roundedRect(BOARD_HALF * 2, BOARD_HALF * 2, 0.7), H.slab, 0.12, detail).translate(0, -H.slab, 0),
      border: extrudeUp(frameShape(BOARD_HALF * 2, WORLD_BOARD_SIZE + 0.06, 0.7), H.border, 0.07, detail),
      plate: extrudeUp(roundedRect(WORLD_BOARD_SIZE + 0.06, WORLD_BOARD_SIZE + 0.06, 0.08), H.plate, 0, detail),
      tile: tileGeometry(0.92, H.tile, detail),
      star: starGeometry(0.62, H.inlay, detail),
      chevron: chevronGeometry(0.42, 0.085, H.inlay, detail),
      tiers: Object.fromEntries(tierHeights.map((k) => {
        const [size, height] = k.split(":").map(Number) as [number, number];
        return [k, extrudeUp(roundedRect(size, size, Math.max(0.18, size * 0.13)), height, 0.06, detail)];
      })),
      slot: discGeometry(0.43, 0.02, detail),
      centre: model.centre.map((c) => triangleGeometry(c.corners, H.centre, detail)),
      dome: discGeometry(0.15, 0.06, detail),
      materials: {
        slab: satin(frame.dark, 0.55),
        border: satin(frame.base, 0.38),
        plate: satin(material.separator, 0.8),
        tile: white(0.62),
        inlay: white(0.5),
        tier: white(0.5),
        slot: white(0.4),
        centre: PLAYER_IDENTITIES.slice(0, 4).map((_, seat) => satin(model.centre[seat]!.colour, 0.42)),
        dome: satin("#FFFFFF", 0.3),
      },
    };
  }, [model, detail, frame.base, frame.dark, material.separator]);

  useEffect(
    () => () => {
      const geoms: BufferGeometry[] = [res.slab, res.border, res.plate, res.tile, res.star, res.chevron, res.slot, res.dome, ...res.centre, ...Object.values(res.tiers)];
      for (const g of geoms) g.dispose();
      const m = res.materials;
      for (const mat of [m.slab, m.border, m.plate, m.tile, m.inlay, m.tier, m.slot, m.dome, ...m.centre]) mat.dispose();
    },
    [res],
  );

  const tileTop = H.plate + H.tile;
  const tiers = useMemo(() => {
    const groups = new Map<string, { x: number; z: number; colour: string }[]>();
    for (const t of model.tiers) {
      const k = `${t.size}:${t.height}`;
      groups.set(k, [...(groups.get(k) ?? []), { x: t.x, z: t.z, colour: t.colour }]);
    }
    return [...groups.entries()];
  }, [model]);

  return (
    <group>
      <mesh geometry={res.slab} material={res.materials.slab} receiveShadow={shadows} dispose={null} />
      <mesh geometry={res.border} material={res.materials.border} receiveShadow={shadows} castShadow={false} dispose={null} />
      <mesh geometry={res.plate} material={res.materials.plate} receiveShadow={shadows} dispose={null} />
      <Instances geometry={res.tile} material={res.materials.tile} items={useMemo(() => model.tiles.map((t) => ({ x: t.x, z: t.z, y: H.plate, colour: t.colour })), [model])} shadows={shadows} />
      <Instances geometry={res.star} material={res.materials.inlay} items={useMemo(() => model.stars.map((s) => ({ ...s, y: tileTop })), [model, tileTop])} shadows={shadows} />
      <Instances geometry={res.chevron} material={res.materials.inlay} items={useMemo(() => model.chevrons.map((c) => ({ ...c, y: tileTop })), [model, tileTop])} shadows={shadows} />
      {tiers.map(([k, items]) => (
        <Instances key={k} geometry={res.tiers[k]!} material={res.materials.tier} items={items} shadows={shadows} />
      ))}
      <Instances geometry={res.slot} material={res.materials.slot} items={useMemo(() => model.slots.map((s) => ({ x: s.x, z: s.z, y: s.height, colour: s.colour })), [model])} shadows={shadows} />
      {model.centre.map((c, i) => (
        <mesh key={c.seat} geometry={res.centre[i]!} material={res.materials.centre[c.seat]!} position={[0, H.plate, 0]} receiveShadow={shadows} dispose={null} />
      ))}
      <mesh geometry={res.dome} material={res.materials.dome} position={[0, H.plate + H.centre, 0]} dispose={null} />
      {model.bases.map((b) => (
        <BaseHighlight key={b.seat} seat={b.seat} x={b.x} z={b.z} active={currentSeat === b.seat} />
      ))}
      {youSeat !== null ? <YouLabel seat={youSeat} model={model} textures={textures} /> : null}
    </group>
  );
});

/** The current player's base carries a soft outline in their colour (the 2D turn indicator). */
function BaseHighlight({ seat, x, z, active }: { seat: number; x: number; z: number; active: boolean }) {
  const geometry = useMemo(() => {
    const s = roundedRect(6.02, 6.02, 0.95);
    s.holes.push(roundedRect(5.7, 5.7, 0.8));
    return extrudeUp(s, 0.05, 0, { curve: 3, radial: 24 });
  }, []);
  const material = useMemo(() => new MeshStandardMaterial({ color: PLAYER_IDENTITIES[seat]!.rim, emissive: PLAYER_IDENTITIES[seat]!.rim, emissiveIntensity: 0.25, roughness: 0.4, transparent: true, opacity: 0.8 }), [seat]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} position={[x, H.plate, z]} visible={active} dispose={null} />;
}

function YouLabel({ seat, model, textures }: { seat: number; model: BoardModel; textures: TextureCache }) {
  const base = model.bases.find((b) => b.seat === seat)!;
  const colour = mixLab(PLAYER_IDENTITIES[seat]!.rim, "#000000", 0.05);
  const map = textures.label("You", colour);
  return (
    <mesh position={[base.x, 0.35, base.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.4, 1.4]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} side={DoubleSide} dispose={null} />
    </mesh>
  );
}
