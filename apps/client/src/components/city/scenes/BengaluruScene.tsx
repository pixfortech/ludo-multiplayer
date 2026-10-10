// Bengaluru on a fresh garden-city morning: the Vidhana Soudha in pale
// granite, the glass house in the park, glass towers of the tech districts
// with LED strips, Cubbon Park's mown lawns and a
// granite walkway, rain trees, a pink trumpet tree shedding blossoms, a café
// kiosk and lit bollards. Original artwork, drawn in code.

import { Clouds, Disc, Far, Fixture, Ground, Landmark, Particles, Sky } from "./sceneKit";

const GRANITE = "#E4DDCB";
const GRANITE_SHADE = "#BDB4A0";
const GRANITE_DEEP = "#8F8775";

function Columns({ x0, x1, y0, y1, n }: { x0: number; x1: number; y0: number; y1: number; n: number }) {
  const step = (x1 - x0) / (n - 1);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={x0 + i * step - 4} y={y0} width="8" height={y1 - y0} fill={GRANITE} />
          <rect x={x0 + i * step + 1} y={y0} width="3" height={y1 - y0} fill={GRANITE_SHADE} />
          <rect x={x0 + i * step - 6} y={y0} width="12" height="5" fill={GRANITE_SHADE} />
        </g>
      ))}
    </g>
  );
}

function SmallDome({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <rect x={x - r * 0.8} y={y} width={r * 1.6} height={r * 0.9} fill={GRANITE} />
      <path d={`M${x - r} ${y} Q${x} ${y - r * 1.5} ${x + r} ${y} Z`} fill={GRANITE_SHADE} />
      <path d={`M${x - r} ${y} Q${x - r * 0.3} ${y - r * 1.3} ${x} ${y - r * 1.12} V${y} Z`} fill={GRANITE} />
      <rect x={x - 1} y={y - r * 1.5} width="2" height={r * 0.5} fill={GRANITE_DEEP} />
    </g>
  );
}

function VidhanaSoudha() {
  return (
    <g>
      {/* Steps and the long main block. */}
      <rect x="230" y="286" width="300" height="14" fill={GRANITE_SHADE} />
      <rect x="0" y="176" width="760" height="112" fill={GRANITE} />
      <rect x="0" y="176" width="760" height="8" fill={GRANITE_SHADE} />
      <g fill={GRANITE_DEEP} opacity="0.45">
        {Array.from({ length: 2 }, (_, row) =>
          Array.from({ length: 22 }, (_, i) => {
            const x = 14 + i * 34;
            if (x > 236 && x < 520) return null;
            return <rect key={`${row}-${i}`} x={x} y={200 + row * 42} width="16" height="26" rx="8" />;
          }),
        )}
      </g>
      {/* Corner towers with small domes. */}
      <rect x="0" y="146" width="70" height="40" fill={GRANITE} />
      <rect x="690" y="146" width="70" height="40" fill={GRANITE} />
      <SmallDome x={35} y={146} r={22} />
      <SmallDome x={725} y={146} r={22} />
      {/* The portico: twelve columns under a deep entablature. */}
      <rect x="250" y="144" width="260" height="22" fill={GRANITE} />
      <rect x="250" y="160" width="260" height="6" fill={GRANITE_SHADE} />
      <rect x="258" y="166" width="244" height="120" fill={GRANITE_DEEP} opacity="0.35" />
      <Columns x0={266} x1={494} y0={166} y1={286} n={12} />
      <path d="M244 144 H516 L500 128 H260 Z" fill={GRANITE_SHADE} />
      {/* The central dome on its drum, with a finial. */}
      <rect x="326" y="92" width="108" height="38" fill={GRANITE} />
      <g fill={GRANITE_DEEP} opacity="0.4">
        {[338, 356, 374, 392, 410].map((x) => (
          <rect key={x} x={x} y="100" width="8" height="22" rx="4" />
        ))}
      </g>
      <rect x="320" y="86" width="120" height="8" fill={GRANITE_SHADE} />
      <path d="M326 86 Q380 4 434 86 Z" fill="#CFC6B0" />
      <path d="M326 86 Q348 30 380 22 V86 Z" fill={GRANITE} />
      <circle cx="380" cy="22" r="6" fill="#C9A24A" />
      <rect x="378" y="4" width="4" height="14" fill="#C9A24A" />
      {/* Side domes over the portico ends. */}
      <SmallDome x={270} y={128} r={16} />
      <SmallDome x={490} y={128} r={16} />
    </g>
  );
}

function GlassHouse() {
  return (
    <g>
      <path d="M10 150 V96 Q10 60 60 54 H240 Q290 60 290 96 V150 Z" fill="#BFE0D4" opacity="0.9" />
      <path d="M100 150 V60 Q100 6 150 4 Q200 6 200 60 V150 Z" fill="#CFEAE0" />
      <g stroke="#6F8C80" strokeWidth="1.6" fill="none" opacity="0.8">
        <path d="M10 96 Q10 60 60 54 H240 Q290 60 290 96 M100 60 Q100 6 150 4 Q200 6 200 60" />
        {[30, 50, 70, 90, 210, 230, 250, 270].map((x) => (
          <path key={x} d={`M${x} 150 V${x < 150 ? 70 - (x - 10) * 0.1 : 70 - (290 - x) * 0.1}`} />
        ))}
        {[115, 132, 150, 168, 185].map((x) => (
          <path key={x} d={`M${x} 150 V${20 + Math.abs(150 - x) * 0.6}`} />
        ))}
        <path d="M10 120 H290 M100 90 H200" />
      </g>
      <rect x="0" y="148" width="300" height="8" fill="#9DB3A6" />
    </g>
  );
}

function TechTowers() {
  return (
    <g>
      <defs>
        <linearGradient id="cb-bl-glass" x1="0" x2="1">
          <stop offset="0" stopColor="#9FC7D8" />
          <stop offset="1" stopColor="#7AA6BC" />
        </linearGradient>
      </defs>
      <g data-asset="tech-campus" fill="url(#cb-bl-glass)" opacity="0.75">
        {[
          [40, 96, 50],
          [96, 60, 44],
          [146, 110, 40],
          [1180, 80, 48],
          [1234, 40, 54],
          [1294, 100, 44],
          [1460, 70, 52],
          [1520, 110, 40],
        ].map(([x, top, w]) => (
          <g key={x}>
            <rect x={x} y={top} width={w} height={200 - top!} />
            <rect x={x} y={top! + 8} width={w} height="2.5" fill="#6FE3C4" opacity="0.9" />
            <g stroke="#FFFFFF" strokeWidth="0.8" opacity="0.35">
              {Array.from({ length: Math.floor((200 - top!) / 10) }, (_, k) => (
                <path key={k} d={`M${x} ${top! + 14 + k * 10} H${x! + w!}`} />
              ))}
            </g>
          </g>
        ))}
      </g>
      {/* Tree canopy of the garden city. */}
      <g fill="#6E9A62" opacity="0.8">
        {Array.from({ length: 18 }, (_, i) => (
          <circle key={i} cx={200 + i * 56} cy={186 - (i % 3) * 6} r={22 + (i % 4) * 4} />
        ))}
      </g>
    </g>
  );
}

function RainTree() {
  return (
    <g>
      <path d="M96 220 Q92 170 100 130 M100 150 Q80 120 56 110 M100 140 Q124 112 150 104" stroke="#5C4A36" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M8 112 Q20 60 80 58 Q110 30 150 50 Q196 52 194 104 Q170 124 120 116 Q90 126 60 118 Q20 128 8 112 Z" fill="#4E8A4E" />
      <path d="M30 100 Q50 72 90 76 Q120 60 160 74 Q180 86 176 100 Q140 108 100 102 Q60 112 30 100 Z" fill="#62A15C" opacity="0.8" />
    </g>
  );
}

function TrumpetTree() {
  return (
    <g>
      <path d="M60 160 Q58 120 62 90 M62 110 Q48 92 34 86 M62 104 Q78 88 92 84" stroke="#5C4A36" strokeWidth="5" fill="none" strokeLinecap="round" />
      <g fill="#E98AB4">
        <circle cx="34" cy="70" r="22" />
        <circle cx="64" cy="54" r="26" />
        <circle cx="92" cy="70" r="22" />
        <circle cx="62" cy="80" r="20" />
      </g>
      <g fill="#F4B6CF" opacity="0.8">
        <circle cx="48" cy="60" r="12" />
        <circle cx="78" cy="48" r="12" />
      </g>
    </g>
  );
}

function Darshini() {
  return (
    <g>
      <rect x="6" y="26" width="108" height="50" fill="#F4EEDF" />
      <path d="M0 26 L10 6 H110 L120 26 Z" fill="#1C6E46" />
      <path d="M10 6 L6 26 M30 6 L28 26 M50 6 V26 M70 6 V26 M90 6 L92 26 M110 6 L114 26" stroke="#F4EEDF" strokeWidth="2" />
      <rect x="16" y="36" width="40" height="26" fill="#5D6B66" opacity="0.7" />
      <rect x="66" y="36" width="38" height="40" fill="#8A6A44" />
      <circle cx="98" cy="58" r="2" fill="#E3C77B" />
      <path d="M22 30 h10 v4 h-10 z" fill="#C9A24A" />
    </g>
  );
}

function Bollard() {
  return (
    <g>
      <rect x="4" y="10" width="12" height="40" rx="3" fill="#4C5856" />
      <rect x="5" y="12" width="10" height="5" rx="2" fill="#7FF0CF" />
    </g>
  );
}

export default function BengaluruScene() {
  return (
    <>
      <Sky top="#86C3DA" horizon="#EEF7EC" glow={{ x: "30%", y: "30%", colour: "rgba(255, 252, 228, 0.85)" }} />
      <Disc x="26vw" y="calc(var(--hz) * 0.3)" size="6vmin" colour="#FFFCEB" halo="rgba(255, 248, 210, 0.7)" density="reduced" />
      <Far>
        <TechTowers />
      </Far>
      <Landmark name="glass-house" role="support" viewBox="0 0 300 156" size={0.7} place={{ side: "right", portrait: "right", offset: "1vw" }}>
        <GlassHouse />
      </Landmark>
      <Landmark name="vidhana-soudha" role="hero" viewBox="0 0 760 300" size={0.62} place={{ side: "left", portrait: "centre", offset: "-6vw" }}>
        <VidhanaSoudha />
      </Landmark>
      <Ground
        background={[
          "linear-gradient(180deg, transparent 4vh, #B9B3A3 4vh, #B9B3A3 7.4vh, transparent 7.4vh) top / 100% 8vh no-repeat",
          "repeating-linear-gradient(90deg, rgba(90, 90, 80, 0.18) 0 2px, transparent 2px 56px) 0 4vh / 100% 3.4vh no-repeat",
          "repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.07) 0 6vw, rgba(0, 0, 0, 0.04) 6vw 12vw)",
          "linear-gradient(180deg, #8FB37B, #86AA72 40%, #7C9F68)",
        ].join(", ")}
        edge={
          <g>
            <rect width="1600" height="40" fill="#5E8A50" />
            <g fill="#4E7A44">
              {Array.from({ length: 64 }, (_, i) => (
                <circle key={i} cx={i * 25 + 12} cy="20" r="14" />
              ))}
            </g>
          </g>
        }
      />
      <Fixture name="darshini" viewBox="0 0 120 76" left="10vw" depth="14vh" height="7vh" density="full">
        <Darshini />
      </Fixture>
      {[3, 7, 11, 15, 19].map((v, i) => (
        <Fixture key={v} name={`bollard-${i}`} asset="led-paths" viewBox="0 0 20 50" left={`${v}vw`} depth="8.4vh" height="3.4vh" density="full">
          <Bollard />
        </Fixture>
      ))}
      {/* Moving pieces last: the static scenery above paints as one layer. */}
      <Clouds colour="#FFFFFF" count={4} />
      <Fixture name="rain-tree" asset="rain-trees" viewBox="0 0 200 220" left="-7vw" depth="4vh" height="22vh" sway>
        <RainTree />
      </Fixture>
      <Fixture name="trumpet-tree" asset="rain-trees" viewBox="0 0 120 160" left="17vw" depth="3vh" height="17vh" density="full" sway>
        <TrumpetTree />
      </Fixture>
      <Particles kind="petal" colour="#EE9CC0" count={6} />
    </>
  );
}
