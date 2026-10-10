// Building blocks for the 2D city scenes. Each city composes these with its
// own original SVG artwork; the kit owns placement (city.css), density per
// device and ambient motion, so every city behaves the same way: scenery sits
// behind the board, never over it, and thins out on smaller screens.

import type { CSSProperties, ReactNode } from "react";

export type Density = "minimal" | "reduced" | "full";

/**
 * Ambient motion is slow, so it updates at a modest rate (steps) instead of
 * every frame: the compositor redraws far less, and drift this slow looks the same.
 */
const stepped = (seconds: number, fps = 20) => `steps(${Math.max(1, Math.round(seconds * fps))}, end)`;
const secs = (duration: string) => Number.parseFloat(duration);

/** The least density at which a piece appears (phones show "minimal" only). */
const d = (density: Density) => (density === "minimal" ? undefined : density);

export function Sky({ top, horizon, glow }: { top: string; horizon: string; glow?: { x: string; y: string; colour: string; size?: string } }) {
  const sun = glow ? `radial-gradient(${glow.size ?? "38vmax"} ${glow.size ?? "38vmax"} at ${glow.x} ${glow.y}, ${glow.colour}, transparent 62%), ` : "";
  return <div className="cb-layer cb-sky" style={{ background: `${sun}linear-gradient(180deg, ${top} 0%, ${horizon} 100%)` }} />;
}

/** A sun or moon disc (drawn in the sky layer). */
export function Disc({ x, y, size, colour, halo, density = "minimal" }: { x: string; y: string; size: string; colour: string; halo?: string; density?: Density }) {
  return (
    <div
      className="cb-layer"
      data-d={d(density)}
      style={{ left: x, top: y, right: "auto", width: size, height: size, borderRadius: "50%", background: colour, boxShadow: halo ? `0 0 calc(${size} * 0.9) calc(${size} * 0.25) ${halo}` : undefined, transform: "translate(-50%, -50%)" }}
    />
  );
}

const CLOUD = "M20 60 C 8 60 0 52 0 43 C 0 33 9 26 19 27 C 22 13 35 4 50 6 C 62 0 80 4 86 18 C 100 15 114 25 113 40 C 124 42 130 50 128 58 C 127 60 125 60 122 60 Z";

export function Clouds({ colour, count = 3, density = "full" }: { colour: string; count?: number; density?: Density }) {
  const clouds = [
    { top: "7vh", w: "16vw", dur: "190s", delay: "-40s" },
    { top: "16vh", w: "10vw", dur: "150s", delay: "-110s" },
    { top: "4vh", w: "8vw", dur: "230s", delay: "-170s" },
    { top: "22vh", w: "13vw", dur: "210s", delay: "-15s" },
  ].slice(0, count);
  return (
    <div className="cb-layer cb-sky" data-d={d(density)}>
      {clouds.map((c, i) => (
        <svg key={i} className="cb-cloud" viewBox="0 0 130 62" style={{ top: c.top, width: c.w, animationTimingFunction: stepped(secs(c.dur), 8), ["--dur" as string]: c.dur, ["--delay" as string]: c.delay } as CSSProperties}>
          <path d={CLOUD} fill={colour} />
        </svg>
      ))}
    </div>
  );
}

/** The far skyline: a full-width band standing on the horizon (viewBox 1600 × 200, bottom-aligned). */
export function Far({ children, density = "minimal", viewBox = "0 0 1600 200" }: { children: ReactNode; density?: Density; viewBox?: string }) {
  return (
    <div className="cb-layer cb-far" data-d={d(density)}>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMax slice">
        {children}
      </svg>
    </div>
  );
}

export interface LandmarkPlacement {
  side: "left" | "right" | "centre";
  /** Where it stands on portrait screens (crowning the board, behind the header). */
  portrait?: "left" | "right" | "centre";
  /** Distance from its side, e.g. "3vw". */
  offset?: string;
}

/** A landmark standing on the horizon. Its SVG keeps its own aspect ratio. */
export function Landmark({ name, asset, role, viewBox, children, place, size = 1, density = role === "hero" ? "minimal" : "reduced" }: { name: string; asset?: string; role: "hero" | "support"; viewBox: string; children: ReactNode; place: LandmarkPlacement; size?: number; density?: Density }) {
  const style = { ...(place.offset ? { ["--offset" as string]: place.offset } : {}), ...(size !== 1 ? { height: `calc(var(${role === "hero" ? "--hero-h" : "--support-h"}) * ${size})` } : {}) } as CSSProperties;
  return (
    <div className="cb-landmark" data-landmark={name} data-asset={asset ?? name} data-role={role} data-side={place.side} data-portrait={place.portrait ?? place.side} data-d={d(density)} style={style}>
      <svg viewBox={viewBox}>{children}</svg>
    </div>
  );
}

/** River or sea between the horizon and the promenade (cities with water only). */
export function Water({ colour, deep }: { colour: string; deep: string }) {
  return <div className="cb-layer cb-water" style={{ background: `linear-gradient(180deg, ${colour}, ${deep})` }} />;
}

/**
 * Light glinting on the water. Animated pieces (this, clouds, travellers,
 * swaying trees, floaters, particles) go after all static scenery, so the
 * static layers paint together and only the moving pieces are composited.
 */
export function Shimmer({ density = "reduced" }: { density?: Density }) {
  return (
    <div className="cb-layer cb-water" data-d={d(density)}>
      <div className="cb-shimmer" style={{ position: "absolute", inset: 0 }}>
        <svg viewBox="0 0 1600 100" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "100%" }}>
          <g stroke="#FFFFFF" strokeLinecap="round" fill="none" opacity="0.6">
            <path d="M60 18 H180 M420 30 H520 M760 14 H900 M1130 26 H1250 M1400 16 H1520" strokeWidth="2" />
            <path d="M150 52 H230 M560 64 H700 M980 48 H1060 M1300 70 H1420" strokeWidth="1.6" opacity="0.7" />
            <path d="M20 84 H90 M330 86 H420 M840 82 H940 M1180 88 H1260" strokeWidth="1.2" opacity="0.5" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/** The paving the board stands on: a CSS pattern, plus an optional edge (kerb, railing) at its top. */
export function Ground({ background, edge, asset }: { background: string; edge?: ReactNode; asset?: string }) {
  return (
    <div className="cb-layer cb-ground" data-asset={asset} style={{ background }}>
      {edge ? (
        <svg viewBox="0 0 1600 40" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "clamp(10px, 2.4vh, 22px)" }}>
          {edge}
        </svg>
      ) : null}
    </div>
  );
}

/** A tram, train, boat or car crossing the scene on a lane below (or on) the horizon. Desktop only. */
export function Traveller({ name, asset, viewBox, children, laneY, height, duration, delay = "0s", direction = "ltr", density = "full", bob = false }: { name: string; asset?: string; viewBox: string; children: ReactNode; laneY: string; height: string; duration: string; delay?: string; direction?: "ltr" | "rtl"; density?: Density; bob?: boolean }) {
  const art = <svg viewBox={viewBox}>{children}</svg>;
  return (
    <div className="cb-lane" data-d={d(density)} data-traveller={name} data-asset={asset ?? name} style={{ ["--lane-y" as string]: laneY, ["--lane-h" as string]: height } as CSSProperties}>
      <div className="cb-traveller" data-dir={direction} style={{ animationTimingFunction: stepped(secs(duration), 24), ["--dur" as string]: duration, ["--delay" as string]: delay } as CSSProperties}>
        {bob ? <div className="cb-bob h-full">{art}</div> : art}
      </div>
    </div>
  );
}

/** Small drifting things: dust motes, leaves, drizzle. Desktop only; never under reduced motion. */
export function Particles({ kind, colour, count = 10 }: { kind: "mote" | "leaf" | "drizzle" | "petal"; colour: string; count?: number }) {
  return (
    <div className="cb-layer" style={{ top: 0, bottom: 0 }} data-d="full">
      {Array.from({ length: count }, (_, i) => {
        const left = `${(i * 37) % 100}vw`;
        const dur = `${(kind === "drizzle" ? 2.6 : 16) + ((i * 7) % 9)}s`;
        const delay = `-${(i * 13) % 20}s`;
        const style = { left, animationTimingFunction: stepped(secs(dur), 20), ["--dur" as string]: dur, ["--delay" as string]: delay, ["--drift" as string]: kind === "drizzle" ? "-3vw" : `${((i % 5) - 2) * 4}vw`, ["--spin" as string]: kind === "drizzle" ? "0deg" : `${120 + i * 40}deg` } as CSSProperties;
        if (kind === "drizzle") return <span key={i} className="cb-particle" style={{ ...style, width: 1.5, height: 16, background: colour, opacity: 0.35, borderRadius: 1, transform: "rotate(12deg)" }} />;
        if (kind === "mote") return <span key={i} className="cb-particle" style={{ ...style, width: 4, height: 4, borderRadius: 4, background: colour, opacity: 0.55, boxShadow: `0 0 6px ${colour}` }} />;
        return (
          <svg key={i} className="cb-particle" viewBox="0 0 20 12" style={{ ...style, width: kind === "petal" ? 9 : 14, opacity: 0.75 }}>
            <path d={kind === "petal" ? "M0 6 C4 0 16 0 20 6 C16 12 4 12 0 6 Z" : "M0 6 C5 -1 15 -1 20 6 C15 13 5 13 0 6 Z M2 6 H18"} fill={colour} stroke={kind === "leaf" ? "rgba(0,0,0,0.15)" : "none"} strokeWidth="0.8" />
          </svg>
        );
      })}
    </div>
  );
}

/** Windows on a facade: a grid of small rectangles, some lit (static: animating inside large SVGs costs repaints). */
export function Windows({ x, y, cols, rows, w, h, gapX, gapY, fill, lit, litEvery = 0 }: { x: number; y: number; cols: number; rows: number; w: number; h: number; gapX: number; gapY: number; fill: string; lit?: string; litEvery?: number }) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const on = lit && litEvery > 0 && (r * 7 + c * 3) % litEvery === 0;
      cells.push(<rect key={`${r}-${c}`} x={x + c * (w + gapX)} y={y + r * (h + gapY)} width={w} height={h} rx={Math.min(w, h) * 0.2} fill={on ? lit : fill} />);
    }
  return <g>{cells}</g>;
}

/**
 * A fixed piece of street furniture (a lamp, a palm, a stall) standing on the
 * promenade at `depth` below the horizon (plus the water), `height` tall.
 */
export function Fixture({ name, asset, viewBox, children, left, right, depth = "2vh", height, density = "reduced", sway = false }: { name: string; asset?: string; viewBox: string; children: ReactNode; left?: string; right?: string; depth?: string; height: string; density?: Density; sway?: boolean }) {
  const art = (
    <svg viewBox={viewBox} style={{ display: "block", height: "100%", width: "auto", overflow: "visible" }}>
      {children}
    </svg>
  );
  return (
    <div
      className="cb-fixture"
      data-fixture={name}
      data-asset={asset ?? name}
      data-d={d(density)}
      style={{ position: "absolute", left, right, top: `calc(var(--hz) + var(--water-h) + ${depth})`, height, transform: "translateY(-100%)" }}
    >
      {sway ? <div className="cb-sway h-full">{art}</div> : art}
    </div>
  );
}

/** Something floating in the sky (kites, birds), gently drifting. */
export function Floater({ name, asset, viewBox, children, left, top, width, density = "full", delay = "0s" }: { name: string; asset?: string; viewBox: string; children: ReactNode; left: string; top: string; width: string; density?: Density; delay?: string }) {
  return (
    <div className="cb-float" data-floater={name} data-asset={asset ?? name} data-d={d(density)} style={{ position: "absolute", left, top, width, animationDelay: delay }}>
      <svg viewBox={viewBox} style={{ display: "block", width: "100%", height: "auto" }}>
        {children}
      </svg>
    </div>
  );
}

/** An elevated rail viaduct standing on the horizon (deck and piers); a Traveller can ride on it. */
export function Viaduct({ colour, height = "3.2vh", density = "full" }: { colour: string; height?: string; density?: Density }) {
  return (
    <div
      className="cb-layer"
      data-viaduct=""
      data-d={d(density)}
      style={{
        top: `calc(var(--hz) - ${height})`,
        height,
        background: `linear-gradient(${colour}, ${colour}) top / 100% 24% no-repeat, repeating-linear-gradient(90deg, transparent 0 7.4vw, ${colour} 7.4vw 8vw)`,
      }}
    />
  );
}
