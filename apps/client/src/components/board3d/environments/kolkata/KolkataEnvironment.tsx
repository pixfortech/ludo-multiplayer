// Kolkata around the 3D board (lazily loaded; only in a Kolkata room). The
// board stays the playable centre: this only adds the city round it, built
// from the layout data (layout.ts) whose placement rules are tested. Nothing
// here handles pointer events or touches game state.

import { useEffect, useRef } from "react";
import type { Group } from "three";
import { ENV_QUALITY, useAmbientClock } from "../ambient";
import type { EnvironmentProps } from "../registry";
import { Foliage } from "./Foliage";
import { KolkataAmbient } from "./KolkataAmbient";
import { KolkataGround } from "./Ground";
import { KolkataLandmarks } from "./KolkataLandmarks";

export default function KolkataEnvironment({ quality, reduced, busy, onBuilt, onAmbient }: EnvironmentProps) {
  const q = ENV_QUALITY[quality];
  // The rate the city's life runs at (0: standing still, under reduced motion or on a device that cannot afford it).
  const rate = useAmbientClock({ fps: q.fps, busy, active: !reduced, onState: onAmbient });
  const root = useRef<Group>(null);
  // Report which assets were built (each carries a name "asset:<id>").
  useEffect(() => {
    const assets = new Set<string>();
    root.current?.traverse((o) => {
      if (o.name.startsWith("asset:")) assets.add(o.name.slice(6));
    });
    onBuilt?.({ assets: [...assets].sort() });
  }, [onBuilt, quality]);
  return (
    <group ref={root} name="kolkata-environment">
      <KolkataGround quality={q} />
      <KolkataLandmarks quality={q} />
      <Foliage quality={q} rate={rate} />
      <KolkataAmbient quality={q} rate={rate} />
    </group>
  );
}
