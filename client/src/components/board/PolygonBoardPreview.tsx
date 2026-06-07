import { useMemo } from "react";
import { PLAYER_PALETTE } from "../../theme";
import { computePolygonLayout } from "./polygonLayout";
import type { PolygonLayout, TrackCell, HomeLaneCell } from "./polygonLayout";

const VB = 500; // viewBox side length

interface Props {
  playerCount: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function hex(playerIndex: number): string {
  return PLAYER_PALETTE[playerIndex] ?? "#888";
}

// Small star shape centred at (cx, cy) with outer radius r.
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  const inner = r * 0.42;
  for (let i = 0; i < 10; i++) {
    const a  = (Math.PI * i) / 5 - Math.PI / 2;
    const ri = i % 2 === 0 ? r : inner;
    pts.push(`${cx + ri * Math.cos(a)},${cy + ri * Math.sin(a)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

// SVG polygon points string from an array of {x,y}.
function polygonPoints(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

// ── sub-renderers ─────────────────────────────────────────────────────────────

function BoardOutline({ layout }: { layout: PolygonLayout }) {
  return (
    <polygon
      points={polygonPoints(layout.vertices)}
      fill="#1e293b"
      stroke="#334155"
      strokeWidth={3}
    />
  );
}

function BaseAreas({ layout }: { layout: PolygonLayout }) {
  const { n, vertices, outerR, cx, cy } = layout;
  return (
    <>
      {vertices.map((v, p) => {
        const color = hex(p);
        // Draw a circle at the vertex position.
        const r = Math.max(22, outerR * 0.20);
        return (
          <g key={`base-${p}`}>
            <circle cx={v.x} cy={v.y} r={r} fill={color} opacity={0.85} />
            <circle cx={v.x} cy={v.y} r={r * 0.62} fill="white" opacity={0.18} />
            {/* player number */}
            <text
              x={v.x} y={v.y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={r * 0.72} fontWeight="800" fill="white" opacity={0.9}
            >
              {p + 1}
            </text>
          </g>
        );
      })}
    </>
  );
}

function TokenDots({ layout }: { layout: PolygonLayout }) {
  return (
    <>
      {layout.tokenSlots.map((slots, p) =>
        slots.map((s, i) => (
          <circle
            key={`tok-${p}-${i}`}
            cx={s.x} cy={s.y}
            r={layout.tokenR * 0.55}
            fill={hex(p)}
            stroke="white"
            strokeWidth={1.5}
            opacity={0.95}
          />
        ))
      )}
    </>
  );
}

function TrackRing({ layout }: { layout: PolygonLayout }) {
  return (
    <circle
      cx={layout.cx} cy={layout.cy}
      r={layout.trackR}
      fill="none"
      stroke="#475569"
      strokeWidth={1}
      strokeDasharray="3 4"
      opacity={0.5}
    />
  );
}

function TrackCells({ cells, cellR }: { cells: TrackCell[]; cellR: number }) {
  return (
    <>
      {cells.map((c, i) => (
        <g key={`tc-${i}`}>
          <circle
            cx={c.x} cy={c.y} r={cellR}
            fill={c.isStart ? hex(c.playerIndex) : "white"}
            fillOpacity={c.isStart ? 0.6 : 0.9}
            stroke={c.isStart ? hex(c.playerIndex) : "#94a3b8"}
            strokeWidth={c.isStart ? 2 : 1}
          />
          {c.isSafe && (
            <path d={starPath(c.x, c.y, cellR * 0.58)} fill={hex(c.playerIndex)} opacity={0.95} />
          )}
        </g>
      ))}
    </>
  );
}

function HomeLanes({ layout }: { layout: PolygonLayout }) {
  const { homeLanes, cellR } = layout;
  return (
    <>
      {homeLanes.map((lane, p) => {
        const color = hex(p);
        return (
          <g key={`lane-${p}`}>
            {/* connecting spine */}
            {lane.length > 1 && (
              <polyline
                points={lane.map((c) => `${c.x},${c.y}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={cellR * 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
              />
            )}
            {lane.map((c: HomeLaneCell) => (
              <circle
                key={`lc-${p}-${c.laneIndex}`}
                cx={c.x} cy={c.y}
                r={cellR * 0.85}
                fill={color}
                opacity={0.55 + c.laneIndex * 0.07}
                stroke="white"
                strokeWidth={0.8}
              />
            ))}
          </g>
        );
      })}
    </>
  );
}

function CenterFinish({ layout }: { layout: PolygonLayout }) {
  const { cx, cy, centerR, n } = layout;
  // Draw n coloured wedge segments meeting at center.
  const pts = layout.vertices.map((_, p) => {
    const a0 = (2 * Math.PI * p) / n - Math.PI / 2;
    const a1 = (2 * Math.PI * (p + 1)) / n - Math.PI / 2;
    const r  = centerR;
    return { p, a0, a1, r };
  });

  return (
    <g>
      {pts.map(({ p, a0, a1, r }) => {
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        return (
          <path
            key={`seg-${p}`}
            d={`M ${cx},${cy} L ${x0},${y0} A ${r},${r} 0 0,1 ${x1},${y1} Z`}
            fill={hex(p)}
            opacity={0.85}
          />
        );
      })}
      {/* star in center */}
      <path d={starPath(cx, cy, centerR * 0.72)} fill="white" opacity={0.9} />
    </g>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function PolygonBoardPreview({ playerCount }: Props) {
  const layout = useMemo(() => computePolygonLayout(playerCount), [playerCount]);

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="h-full w-full"
      aria-label={`${playerCount}-player board preview`}
    >
      {/* dark circle background */}
      <circle cx={VB / 2} cy={VB / 2} r={VB / 2 - 4} fill="#0f172a" />

      <BoardOutline layout={layout} />
      <TrackRing layout={layout} />
      <HomeLanes layout={layout} />
      <TrackCells cells={layout.trackCells} cellR={layout.cellR} />
      <BaseAreas layout={layout} />
      <TokenDots layout={layout} />
      <CenterFinish layout={layout} />
    </svg>
  );
}
