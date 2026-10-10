// Chennai on a bright coastal morning: a temple gopuram rising in painted
// tiers, the Marina lighthouse, the shoreline skyline (a cathedral spire, an
// Indo-Saracenic court with domes, palms), the Bay of Bengal with surf and
// catamarans, sand laid with kolam patterns, coconut palms and a beached
// fishing boat. Original artwork, drawn in code.

import { Clouds, Disc, Far, Fixture, Floater, Ground, Landmark, Shimmer, Sky, Traveller, Water } from "./sceneKit";

const TIER_COLOURS = ["#E9C98F", "#E3B97A", "#E9C98F", "#E3B97A", "#E9C98F", "#E3B97A", "#E9C98F"];
const NICHE = ["#2E8BA0", "#C4572E", "#F4E6C4", "#3F7F5A", "#C4572E", "#2E8BA0"];

function Gopuram() {
  const tiers = Array.from({ length: 7 }, (_, i) => {
    const y0 = 352 - i * 40;
    const y1 = y0 - 40;
    const half0 = 120 - i * 10;
    const half1 = 120 - (i + 1) * 10;
    return { i, y0, y1, half0, half1 };
  });
  return (
    <g>
      <defs>
        <linearGradient id="cb-ch-shade" x1="0" x2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#5A2A10" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      {/* Granite base with the great doorway. */}
      <path d="M34 460 V352 H286 V460 Z" fill="#CDB896" />
      <path d="M34 352 H286 V362 H34 Z" fill="#A98C64" />
      <path d="M128 460 V400 Q160 372 192 400 V460 Z" fill="#4B3426" />
      <g fill="#A98C64" opacity="0.6">
        <rect x="50" y="376" width="56" height="8" />
        <rect x="214" y="376" width="56" height="8" />
        <rect x="50" y="408" width="56" height="6" />
        <rect x="214" y="408" width="56" height="6" />
      </g>
      {/* Seven painted tiers, each with a cornice and a row of niches. */}
      {tiers.map(({ i, y0, y1, half0, half1 }) => {
        const niches = Math.max(3, 9 - i);
        const width = half1 * 2 - 16;
        return (
          <g key={i}>
            <path d={`M${160 - half0} ${y0} L${160 - half1} ${y1} H${160 + half1} L${160 + half0} ${y0} Z`} fill={TIER_COLOURS[i]} />
            <rect x={160 - half0 - 4} y={y0 - 6} width={half0 * 2 + 8} height="6" fill="#B9773D" />
            {Array.from({ length: niches }, (_, k) => {
              const x = 160 - half1 + 8 + (k + 0.5) * (width / niches);
              return (
                <g key={k}>
                  <path d={`M${x - 5} ${y0 - 8} V${y1 + 14} Q${x} ${y1 + 6} ${x + 5} ${y1 + 14} V${y0 - 8} Z`} fill={NICHE[(k + i) % NICHE.length]} />
                  <circle cx={x} cy={y1 + 16} r="2" fill="#F4E6C4" opacity="0.8" />
                </g>
              );
            })}
          </g>
        );
      })}
      {/* The barrel-vaulted crown with its row of golden finials and curled ends. */}
      <path d="M86 72 Q86 40 160 36 Q234 40 234 72 Z" fill="#E3B97A" />
      <path d="M86 72 H234 V78 H86 Z" fill="#B9773D" />
      <path d="M80 70 Q70 52 84 44 Q86 56 94 62 Z M240 70 Q250 52 236 44 Q234 56 226 62 Z" fill="#C4572E" />
      <g fill="#E8B23A">
        {[100, 120, 140, 160, 180, 200, 220].map((x) => (
          <g key={x}>
            <path d={`M${x - 4} 40 Q${x} 26 ${x + 4} 40 Z`} />
            <rect x={x - 1} y="20" width="2" height="8" />
          </g>
        ))}
      </g>
      <path d="M40 460 L160 36 L280 460 Z" fill="url(#cb-ch-shade)" />
    </g>
  );
}

function Lighthouse() {
  return (
    <g>
      <path d="M22 360 L30 70 H54 L62 360 Z" fill="#EDEAE2" />
      <path d="M42 70 H54 L62 360 H42 Z" fill="#CFCBC0" />
      <g fill="#B8B2A6">
        {[120, 180, 240, 300].map((y) => (
          <rect key={y} x="34" y={y} width="16" height="10" rx="2" />
        ))}
      </g>
      <rect x="24" y="58" width="36" height="14" fill="#C4572E" />
      <rect x="28" y="38" width="28" height="20" fill="#E9F1F2" stroke="#7C3A22" strokeWidth="2" />
      <circle cx="42" cy="48" r="6" fill="#FFE6A0" />
      <path d="M26 38 Q42 20 58 38 Z" fill="#C4572E" />
      <rect x="40" y="14" width="4" height="10" fill="#7C3A22" />
    </g>
  );
}

function FarShore() {
  const haze = "#9CC2C6";
  const near = "#7FA9A8";
  return (
    <g>
      <g fill={haze} opacity="0.7">
        {/* A cathedral spire. */}
        <path d="M1180 200 V120 H1230 V200 Z M1196 120 L1205 30 L1214 120 Z" />
        {/* An Indo-Saracenic court: domes and minarets. */}
        <g data-asset="heritage-hall">
          <path d="M280 200 V146 H520 V200 Z" />
          <path d="M300 146 V120 H320 V146 Z M480 146 V120 H500 V146 Z M380 146 Q400 100 420 146 Z" />
          <path d="M296 120 Q310 100 324 120 Z M476 120 Q490 100 504 120 Z M395 106 V96" stroke={haze} strokeWidth="3" />
        </g>
        {/* A tall office block and low terraces. */}
        <rect x="760" y="80" width="54" height="120" />
        <path d="M600 200 V170 H700 V160 H740 V200 Z M860 200 V164 H980 V176 H1100 V200 Z M1300 200 V170 H1440 V160 H1600 V200 Z M0 200 V168 H200 V200 Z" />
      </g>
      <g fill={near} opacity="0.85">
        {[60, 140, 560, 1000, 1080, 1480, 1540].map((x, i) => (
          <g key={x}>
            <path d={`M${x} 200 Q${x + 3} ${176 - (i % 3) * 6} ${x - 2} ${150 - (i % 3) * 6}`} stroke={near} strokeWidth="3" fill="none" />
            <path d={`M${x - 2} ${150 - (i % 3) * 6} q-20 2 -28 14 q16 -8 28 -12 q-6 -16 -22 -18 q16 0 24 14 q8 -16 26 -16 q-16 6 -22 16 q18 -2 26 12 q-16 -10 -30 -10 Z`} />
          </g>
        ))}
      </g>
    </g>
  );
}

function Palm({ lean = 0 }: { lean?: number }) {
  return (
    <g>
      <path d={`M40 200 Q${44 + lean} 120 ${40 + lean * 2} 40`} stroke="#7C5A3A" strokeWidth="7" fill="none" strokeLinecap="round" />
      <g stroke="#6B4A30" strokeWidth="1" opacity="0.5">
        {[180, 160, 140, 120, 100, 80, 60].map((y) => (
          <path key={y} d={`M${36 + ((200 - y) / 160) * lean * 2} ${y} h8`} />
        ))}
      </g>
      <g transform={`translate(${40 + lean * 2} 40)`} fill="#3F7F4A">
        <path d="M0 0 Q-30 -10 -52 12 Q-28 0 0 4 Z" />
        <path d="M0 0 Q30 -12 54 10 Q28 -2 0 4 Z" />
        <path d="M0 0 Q-16 -28 -40 -30 Q-14 -18 0 2 Z" />
        <path d="M0 0 Q16 -30 42 -28 Q14 -16 0 2 Z" />
        <path d="M0 0 Q-6 -30 4 -42 Q4 -20 2 2 Z" />
        <path d="M0 2 Q-24 14 -34 36 Q-18 16 2 6 Z" fill="#356B3E" />
        <path d="M0 2 Q24 14 36 34 Q18 16 -2 6 Z" fill="#356B3E" />
        <circle cx="-3" cy="6" r="4" fill="#8A6A2E" />
        <circle cx="4" cy="7" r="4" fill="#8A6A2E" />
      </g>
    </g>
  );
}

function Catamaran() {
  return (
    <g>
      <path d="M0 40 Q40 50 90 40 L84 46 Q40 54 6 46 Z" fill="#6B4630" />
      <path d="M44 40 V2" stroke="#4B3426" strokeWidth="2" />
      <path d="M46 4 Q74 18 78 38 H46 Z" fill="#F1E6D2" />
      <path d="M42 8 Q24 22 20 38 H42 Z" fill="#E8D7B8" />
    </g>
  );
}

function FishingBoat() {
  return (
    <g>
      <path d="M0 26 Q10 44 70 44 Q120 44 136 22 L128 22 Q110 32 70 32 Q20 32 8 22 Z" fill="#2E8BA0" />
      <path d="M8 22 Q20 32 70 32 Q110 32 128 22" stroke="#F4E6C4" strokeWidth="3" fill="none" />
      <path d="M30 36 H110" stroke="#C4572E" strokeWidth="3" />
      <path d="M0 26 L-6 14 L10 22 Z M136 22 L144 8 L128 22 Z" fill="#C4572E" />
    </g>
  );
}

function Gull() {
  return <path d="M0 8 Q8 0 16 8 Q24 0 32 8" stroke="#3E4B52" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
}

// Kolam: dots in a grid with looping lines drawn around them, chalk-white on the sand.
const KOLAM = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><g fill="#FFFDF6" opacity="0.6"><circle cx="18" cy="18" r="2"/><circle cx="54" cy="18" r="2"/><circle cx="18" cy="54" r="2"/><circle cx="54" cy="54" r="2"/><circle cx="36" cy="36" r="2"/></g><g fill="none" stroke="#FFFDF6" stroke-width="1.6" opacity="0.5"><path d="M36 26 C46 16 56 16 62 26 C68 36 58 46 46 36 C36 26 26 16 14 22 C4 28 8 44 20 46 C32 48 36 36 36 36"/><path d="M36 46 C26 56 16 56 10 46 M36 46 C46 56 58 58 64 50"/></g></svg>',
)}")`;

export default function ChennaiScene() {
  return (
    <>
      <Sky top="#6FB3CB" horizon="#F7E6C6" glow={{ x: "78%", y: "84%", colour: "rgba(255, 238, 190, 0.9)" }} />
      <Disc x="80vw" y="calc(var(--hz) * 0.72)" size="7vmin" colour="#FFF4D6" halo="rgba(255, 230, 170, 0.6)" density="reduced" />
      <Far>
        <FarShore />
      </Far>
      <Landmark name="lighthouse" role="support" viewBox="0 0 84 360" size={1.45} place={{ side: "right", portrait: "right", offset: "2.5vw" }}>
        <Lighthouse />
      </Landmark>
      <Landmark name="gopuram" role="hero" viewBox="0 0 320 460" place={{ side: "left", portrait: "centre", offset: "5vw" }}>
        <Gopuram />
      </Landmark>
      <Water colour="#3E9AB0" deep="#2E8BA0" />
      <Ground
        asset="kolam"
        background={[`${KOLAM} 0 3vh / 72px 72px`, "linear-gradient(180deg, #F1E3C2, #E8D2A8 30%, #E0C79A)"].join(", ")}
        edge={
          <g>
            <rect width="1600" height="40" fill="#F1E3C2" />
            <path d="M0 6 Q40 0 80 6 T160 6 T240 6 T320 6 T400 6 T480 6 T560 6 T640 6 T720 6 T800 6 T880 6 T960 6 T1040 6 T1120 6 T1200 6 T1280 6 T1360 6 T1440 6 T1520 6 T1600 6 V0 H0 Z" fill="#FFFFFF" opacity="0.85" />
            <path d="M0 16 Q50 10 100 16 T200 16 T300 16 T400 16 T500 16 T600 16 T700 16 T800 16 T900 16 T1000 16 T1100 16 T1200 16 T1300 16 T1400 16 T1500 16 T1600 16" stroke="#FFFFFF" strokeWidth="2" fill="none" opacity="0.5" />
          </g>
        }
      />
      <Fixture name="fishing-boat" asset="catamaran" viewBox="-8 6 154 40" left="8vw" depth="10vh" height="4.4vh" density="full">
        <FishingBoat />
      </Fixture>
      {/* Moving pieces last: the static scenery above paints as one layer. */}
      <Clouds colour="#FFFFFF" count={4} />
      <Shimmer />
      <Floater name="gulls" viewBox="0 0 32 12" left="24vw" top="14vh" width="2vw">
        <Gull />
      </Floater>
      <Floater name="gulls-2" viewBox="0 0 32 12" left="3vw" top="22vh" width="1.4vw" delay="-5s">
        <Gull />
      </Floater>
      <Fixture name="palm" asset="coconut-palms" viewBox="0 0 100 200" left="0.5vw" depth="5vh" height="26vh" sway>
        <Palm lean={6} />
      </Fixture>
      <Fixture name="palm-2" asset="coconut-palms" viewBox="0 0 100 200" left="19vw" depth="3vh" height="20vh" density="full" sway>
        <Palm lean={-5} />
      </Fixture>
      <Traveller name="catamaran" viewBox="0 0 92 56" laneY="calc(var(--water-h) * 0.05)" height="calc(var(--water-h) * 0.62)" duration="120s" delay="-40s" direction="rtl" bob>
        <Catamaran />
      </Traveller>
    </>
  );
}
