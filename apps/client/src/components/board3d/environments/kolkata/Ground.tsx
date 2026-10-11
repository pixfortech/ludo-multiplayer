// Kolkata's ground, sky and river (C.2A): the paving the board stands on, the
// ring road, the riverside promenade, the Maidan's lawn, the south plaza, the
// Hooghly with its stone embankments, the far banks and a low distant skyline,
// under a golden-hour sky. Static: built once, a handful of draw calls.

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { BackSide, BufferAttribute, Color, Fog, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from "three";
import { Builder, hash01, noRaycast } from "../kit";
import type { EnvironmentQuality } from "../ambient";
import { BOARD_CLEAR, GROUND_Y, RIVER, TAXI_LANES, TRAM_LOOP, WATER_Y } from "./layout";

export const KOLKATA_COLOURS = {
  skyTop: "#E79A5B",
  skyHorizon: "#FBE1BA",
  ground: "#C9A884",
  plaza: "#DCC6A4",
  road: "#8C8178",
  roadLine: "#E8D9B8",
  promenade: "#D9C4A3",
  lawn: "#8DA968",
  lawnDark: "#7C9A5B",
  southPlaza: "#CDBFA9",
  water: "#5F8F94",
  embankment: "#A8957C",
  farBank: "#B49878",
  skyline: "#C99A7B",
  skylineFar: "#D8B394",
  rail: "#9C8B6E",
} as const;

const ROAD_HALF = 10.75;

function groundGeometry() {
  const b = new Builder();
  const y = GROUND_Y;
  const flat = (minX: number, maxX: number, minZ: number, maxZ: number, lift: number, colour: string) => b.box([maxX - minX, 0.02, maxZ - minZ], [(minX + maxX) / 2, y - 0.01 + lift, (minZ + maxZ) / 2], colour);
  // The city's ground (east of and south of the river), and the far banks.
  flat(RIVER.west.maxX, 60, RIVER.north.maxZ, 60, 0, KOLKATA_COLOURS.ground);
  flat(-60, RIVER.west.minX, -60, 60, 0, KOLKATA_COLOURS.farBank);
  flat(RIVER.west.minX, 60, -60, RIVER.north.minZ, 0, KOLKATA_COLOURS.farBank);
  // The laterite square the board stands on, and the ring road round it.
  flat(-ROAD_HALF, ROAD_HALF, -ROAD_HALF, ROAD_HALF, 0.004, KOLKATA_COLOURS.road);
  flat(-BOARD_CLEAR - 0.85, BOARD_CLEAR + 0.85, -BOARD_CLEAR - 0.85, BOARD_CLEAR + 0.85, 0.008, KOLKATA_COLOURS.plaza);
  // Lane markings: short dashes between the two lanes.
  const lane = (TAXI_LANES[0]!.maxX + TAXI_LANES[1]!.maxX) / 2;
  for (let i = -8; i <= 8; i += 1.6) {
    for (const [x, z, w, d] of [
      [i, -lane, 0.7, 0.06],
      [i, lane, 0.7, 0.06],
      [-lane, i, 0.06, 0.7],
      [lane, i, 0.06, 0.7],
    ] as const)
      b.box([w, 0.02, d], [x, y + 0.006, z], KOLKATA_COLOURS.roadLine);
  }
  // The riverside promenade (Strand Road's walk) and the north bank.
  flat(RIVER.west.maxX, -ROAD_HALF, RIVER.north.maxZ, 40, 0.006, KOLKATA_COLOURS.promenade);
  flat(-ROAD_HALF, ROAD_HALF, RIVER.north.maxZ, -ROAD_HALF, 0.006, KOLKATA_COLOURS.promenade);
  // The Maidan's lawn (east and south-east), with mown stripes, and the south plaza.
  flat(ROAD_HALF, 60, RIVER.north.maxZ, 60, 0.004, KOLKATA_COLOURS.lawn);
  for (let x = ROAD_HALF + 1; x < 34; x += 2.4) flat(x, x + 1.2, RIVER.north.maxZ, 40, 0.006, KOLKATA_COLOURS.lawnDark);
  flat(RIVER.west.maxX, ROAD_HALF, ROAD_HALF, 60, 0.004, KOLKATA_COLOURS.southPlaza);
  // Tram tracks round the Maidan: two rails as thin strips on each straight.
  const t = TRAM_LOOP;
  for (const off of [-0.18, 0.18]) {
    flat(t.minX + t.radius, t.maxX - t.radius, t.minZ + off - 0.03, t.minZ + off + 0.03, 0.012, KOLKATA_COLOURS.rail);
    flat(t.minX + t.radius, t.maxX - t.radius, t.maxZ + off - 0.03, t.maxZ + off + 0.03, 0.012, KOLKATA_COLOURS.rail);
    flat(t.minX + off - 0.03, t.minX + off + 0.03, t.minZ + t.radius, t.maxZ - t.radius, 0.012, KOLKATA_COLOURS.rail);
    flat(t.maxX + off - 0.03, t.maxX + off + 0.03, t.minZ + t.radius, t.maxZ - t.radius, 0.012, KOLKATA_COLOURS.rail);
  }
  return b.build();
}

function riverGeometry() {
  const b = new Builder();
  const w = RIVER.west;
  const n = RIVER.north;
  b.box([w.maxX - w.minX, 0.02, w.maxZ - w.minZ], [(w.minX + w.maxX) / 2, WATER_Y, (w.minZ + w.maxZ) / 2], KOLKATA_COLOURS.water);
  b.box([n.maxX - w.maxX, 0.02, n.maxZ - n.minZ], [(w.maxX + n.maxX) / 2, WATER_Y, (n.minZ + n.maxZ) / 2], KOLKATA_COLOURS.water);
  return b.build();
}

function embankmentGeometry() {
  const b = new Builder();
  const h = GROUND_Y - WATER_Y + 0.02;
  const y0 = WATER_Y - 0.01;
  // Stone embankments on both banks of both arms.
  b.block(RIVER.west.maxX - 0.08, 12.3, 0.16, 55.4, y0, h, KOLKATA_COLOURS.embankment);
  b.block(RIVER.west.minX + 0.08, 10.25, 0.16, 59.5, y0, h, KOLKATA_COLOURS.embankment);
  b.block(13.4, RIVER.north.maxZ - 0.08, 53.2, 0.16, y0, h, KOLKATA_COLOURS.embankment);
  b.block(11.75, RIVER.north.minZ + 0.08, 56.5, 0.16, y0, h, KOLKATA_COLOURS.embankment);
  return b.build();
}

/** Low blocks on the far banks and the far edges of the city, hazy with distance. */
function skylineGeometry(count: number) {
  const b = new Builder();
  for (let i = 0; i < count; i++) {
    const side = i % 4;
    const u = hash01(i + 1);
    const v = hash01(i + 101);
    const h = 0.8 + hash01(i + 201) * 2.6;
    const w = 1.2 + v * 2.2;
    const colour = hash01(i + 301) > 0.5 ? KOLKATA_COLOURS.skyline : KOLKATA_COLOURS.skylineFar;
    if (side === 0) b.block(-20 - v * 14, -18 + u * 50, w, w * 0.8, GROUND_Y, h, colour); // Howrah, across the west arm
    else if (side === 1) b.block(-16 + u * 54, -22.5 - v * 12, w, w * 0.8, GROUND_Y, h, colour); // across the north arm
    else if (side === 2) b.block(27 + v * 12, -12 + u * 46, w * 0.8, w, GROUND_Y, h, colour); // far east
    else b.block(-8 + u * 40, 27 + v * 12, w, w * 0.8, GROUND_Y, h, colour); // far south
  }
  return b.build();
}

function skyGeometry() {
  const g = new SphereGeometry(170, 24, 12);
  const pos = g.getAttribute("position");
  const top = new Color(KOLKATA_COLOURS.skyTop);
  const horizon = new Color(KOLKATA_COLOURS.skyHorizon);
  const c = new Float32Array(pos.count * 3);
  const tmp = new Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 110));
    tmp.copy(horizon).lerp(top, Math.pow(t, 0.7));
    c.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute("color", new BufferAttribute(c, 3));
  return g;
}

export function KolkataGround({ quality }: { quality: EnvironmentQuality }) {
  const scene = useThree((s) => s.scene);
  const res = useMemo(() => {
    const land = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const water = new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.08 });
    return {
      ground: groundGeometry(),
      river: riverGeometry(),
      banks: embankmentGeometry(),
      skyline: skylineGeometry(quality.skyline),
      sky: skyGeometry(),
      land,
      water,
      skyMaterial: new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }),
    };
  }, [quality.skyline]);
  // Golden-hour haze on distant scenery only: it starts well beyond the board, so the board's colours never change.
  useEffect(() => {
    const previous = scene.fog;
    scene.fog = new Fog(KOLKATA_COLOURS.skyHorizon, 62, 150);
    return () => {
      scene.fog = previous;
    };
  }, [scene]);
  useEffect(
    () => () => {
      for (const g of [res.ground, res.river, res.banks, res.skyline, res.sky]) g.dispose();
      for (const m of [res.land, res.water, res.skyMaterial]) m.dispose();
    },
    [res],
  );
  return (
    <group name="kolkata-ground">
      <mesh geometry={res.sky} material={res.skyMaterial} raycast={noRaycast} renderOrder={-10} name="sky" />
      <mesh geometry={res.ground} material={res.land} raycast={noRaycast} receiveShadow name="ground" />
      <mesh geometry={res.river} material={res.water} raycast={noRaycast} name="asset:hooghly-river" />
      <mesh geometry={res.banks} material={res.land} raycast={noRaycast} name="embankments" />
      <mesh geometry={res.skyline} material={res.land} raycast={noRaycast} name="asset:skyline" />
    </group>
  );
}
