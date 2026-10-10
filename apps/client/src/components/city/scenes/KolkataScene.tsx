// Kolkata at golden hour: the Howrah Bridge over the Hooghly, the riverbank
// skyline (Victoria Memorial's dome, colonial facades, temple spires), ferries
// on the river, a laterite promenade with brass tram rails and a cast-iron
// railing, gas lamps, a book stall, and a tram and a yellow taxi passing.
// Original artwork, drawn in code.

import { Clouds, Disc, Far, Fixture, Ground, Landmark, Particles, Shimmer, Sky, Traveller, Water } from "./sceneKit";

const STEEL = "#4F3A2C";
const STEEL_LIT = "#9B7556";
const DECK_Y = 262;

/** The bridge's top chord: anchor arm up to the tower, cantilever down to the suspended span. */
function topChord(x: number): number {
  const seg = (x0: number, y0: number, x1: number, y1: number) => y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  if (x <= 230) return seg(10, 238, 230, 30);
  if (x <= 390) return seg(230, 30, 390, 148);
  if (x <= 610) {
    const t = (x - 390) / 220;
    return 148 + Math.sin(t * Math.PI) * 12;
  }
  if (x <= 770) return seg(610, 148, 770, 30);
  return seg(770, 30, 990, 238);
}

function HowrahBridge() {
  return (
    <g>
      {/* The far truss plane, lit by the low sun, gives the bridge its depth. */}
      <g transform="translate(16 -10)" opacity="0.32">
        <BridgeTruss />
      </g>
      <BridgeTruss />
    </g>
  );
}

function BridgeTruss() {
  const panels: number[] = [];
  for (let x = 10; x <= 990; x += 27.2) panels.push(x);
  const chord = panels.map((x) => `${x.toFixed(1)},${topChord(x).toFixed(1)}`).join(" ");
  return (
    <g>
      {/* Piers in the river. */}
      <path d="M200 270 H262 V330 H200 Z M738 270 H800 V330 H738 Z" fill="#5E4636" />
      <path d="M200 270 H214 V330 H200 Z M738 270 H752 V330 H738 Z" fill="#7A5C46" />
      {/* Truss web: verticals and alternating diagonals between the chords. */}
      <g stroke={STEEL} strokeWidth="2" opacity="0.92">
        {panels.map((x, i) => (
          <path key={x} d={`M${x} ${topChord(x)} V${DECK_Y}${i < panels.length - 1 ? ` M${x} ${i % 2 ? DECK_Y : topChord(x)} L${panels[i + 1]} ${i % 2 ? topChord(panels[i + 1]!) : DECK_Y}` : ""}`} />
        ))}
      </g>
      {/* Towers: tapering legs with cross bracing, rising above the chord. */}
      {[230, 770].map((x) => (
        <g key={x}>
          <path d={`M${x - 22} ${DECK_Y + 6} L${x - 7} 18 H${x + 7} L${x + 22} ${DECK_Y + 6} Z`} fill="none" stroke={STEEL} strokeWidth="5" strokeLinejoin="round" />
          <path d={`M${x - 20} 230 L${x + 18} 180 M${x + 20} 230 L${x - 18} 180 M${x - 17} 170 L${x + 15} 120 M${x + 17} 170 L${x - 15} 120 M${x - 14} 110 L${x + 12} 66 M${x + 14} 110 L${x - 12} 66`} stroke={STEEL} strokeWidth="2.4" />
          <path d={`M${x - 9} 18 H${x + 9} V10 H${x - 9} Z`} fill={STEEL} />
          <path d={`M${x - 22} ${DECK_Y + 6} L${x - 7} 18`} stroke={STEEL_LIT} strokeWidth="1.6" opacity="0.8" />
        </g>
      ))}
      {/* Chords and deck. */}
      <polyline points={chord} fill="none" stroke={STEEL} strokeWidth="5" strokeLinejoin="round" />
      <polyline points={chord} fill="none" stroke={STEEL_LIT} strokeWidth="1.4" strokeLinejoin="round" transform="translate(0 -2)" opacity="0.7" />
      <path d={`M0 ${DECK_Y - 4} H1000 V${DECK_Y + 8} H0 Z`} fill={STEEL} />
      <path d={`M0 ${DECK_Y - 4} H1000`} stroke={STEEL_LIT} strokeWidth="1.5" />
      {/* Evening lights along the deck. */}
      <g fill="#FFD28A">
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={30 + i * 41} cy={DECK_Y - 9} r="2.6" opacity="0.9" />
        ))}
      </g>
    </g>
  );
}

function RiversideTemples() {
  // Bengal-style temple spires (curved roofs, a row of small shikharas) on the ghats.
  return (
    <g>
      <path d="M0 200 H260 V160 H0 Z" fill="#B67A57" />
      <path d="M8 200 V176 H252 V200 M20 176 V200 M44 176 V200 M68 176 V200 M92 176 V200 M116 176 V200 M140 176 V200 M164 176 V200 M188 176 V200 M212 176 V200 M236 176 V200" stroke="#8E5A3E" strokeWidth="3" fill="none" />
      {[30, 80, 180, 230].map((x) => (
        <g key={x}>
          <path d={`M${x - 16} 160 Q${x - 16} 118 ${x} 104 Q${x + 16} 118 ${x + 16} 160 Z`} fill="#C98C64" />
          <path d={`M${x} 104 V94`} stroke="#8E5A3E" strokeWidth="2" />
          <circle cx={x} cy="92" r="3" fill="#E9B35A" />
        </g>
      ))}
      <path d="M100 160 Q100 70 130 44 Q160 70 160 160 Z" fill="#D29A70" />
      <path d="M130 44 Q160 70 160 160 H140 Q142 80 130 44 Z" fill="#B67A57" />
      <path d="M130 44 V28" stroke="#8E5A3E" strokeWidth="2.5" />
      <circle cx="130" cy="25" r="4" fill="#E9B35A" />
      <path d="M0 160 Q130 140 260 160" stroke="#8E5A3E" strokeWidth="3" fill="none" />
    </g>
  );
}

function FarRiverbank() {
  const haze = "#E0A67C";
  const near = "#C68962";
  return (
    <g>
      {/* Far: Victoria Memorial's dome, a long arcaded facade, a minaret, trees. */}
      <g fill={haze} opacity="0.6">
        <g data-asset="victoria-memorial">
          <path d="M1040 200 V150 H1100 V128 H1120 V112 Q1150 66 1180 112 V128 H1200 V150 H1260 V200 Z" />
          <path d="M1146 70 V58 M1150 52 l-6 10 h12 Z" stroke={haze} strokeWidth="3" />
          <circle cx="1080" cy="140" r="9" />
          <circle cx="1220" cy="140" r="9" />
        </g>
        <path d="M160 200 V146 H520 V200 Z M320 146 L340 124 L360 146 Z" />
        <path d="M880 200 V58 L888 50 L896 58 V200 Z" />
        <path d="M1380 200 Q1390 150 1420 150 Q1450 140 1470 162 Q1500 150 1520 172 V200 Z M600 200 Q614 160 640 162 Q668 150 690 176 V200 Z" />
      </g>
      {/* Near bank: colonial facades with arches and shutters, a clock tower, palms. */}
      <g fill={near} opacity="0.85">
        <path d="M0 200 V166 H140 V176 H230 V158 H330 V200 Z" />
        <path d="M560 200 V150 H620 V118 H640 V100 L650 92 L660 100 V118 H680 V150 H760 V200 Z" />
        <path d="M940 200 V170 H1010 V160 H1100 V200 Z M1300 200 V164 H1420 V176 H1600 V200 Z" />
      </g>
      <g fill="#F4D3AE" opacity="0.6">
        {[16, 40, 64, 88, 112, 250, 274, 298, 580, 604, 700, 724, 960, 984, 1030, 1054, 1320, 1344, 1368, 1440, 1480, 1520, 1560].map((x) => (
          <path key={x} d={`M${x} 194 V184 Q${x + 6} 176 ${x + 12} 184 V194 Z`} />
        ))}
      </g>
      <g fill="#A8714F" opacity="0.8">
        {[452, 486, 820, 1268].map((x) => (
          <g key={x}>
            <path d={`M${x} 200 Q${x + 2} 170 ${x - 1} 146`} stroke="#A8714F" strokeWidth="3" fill="none" />
            <path d={`M${x - 1} 146 q-18 2 -26 12 q14 -6 26 -10 q-6 -14 -20 -16 q14 0 22 12 q8 -14 24 -14 q-14 6 -20 14 q16 -2 24 10 q-14 -8 -26 -8 Z`} />
          </g>
        ))}
      </g>
    </g>
  );
}

function Tram() {
  return (
    <g>
      <path d="M8 6 L4 0 M10 6 L44 -2" stroke="#3B2F2A" strokeWidth="1.6" />
      {[0, 128].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect x="2" y="8" width="122" height="46" rx="8" fill="#F3EBD8" />
          <rect x="2" y="34" width="122" height="20" rx="4" fill="#2F6FA8" />
          <rect x="2" y="8" width="122" height="6" rx="3" fill="#2F6FA8" />
          {[10, 32, 54, 76, 98].map((wx) => (
            <rect key={wx} x={wx} y="17" width="16" height="13" rx="2" fill="#5E7C93" opacity="0.85" />
          ))}
          <rect x="4" y="40" width="118" height="2" fill="#F3EBD8" opacity="0.7" />
          <circle cx="24" cy="58" r="5" fill="#2B2420" />
          <circle cx="102" cy="58" r="5" fill="#2B2420" />
        </g>
      ))}
      <rect x="124" y="20" width="6" height="30" fill="#2B2420" />
    </g>
  );
}

function YellowTaxi() {
  return (
    <g>
      <path d="M6 34 Q6 22 18 20 L30 8 Q34 4 42 4 H70 Q78 4 82 10 L92 20 Q106 22 108 32 V38 H6 Z" fill="#F2C230" />
      <path d="M34 10 H52 V20 H26 Z M56 10 H74 Q78 10 80 14 L86 20 H56 Z" fill="#4C5560" opacity="0.85" />
      <rect x="44" y="0" width="16" height="5" rx="1.5" fill="#F7E7A0" />
      <path d="M6 30 H108" stroke="#C99A16" strokeWidth="1.5" />
      <rect x="0" y="30" width="10" height="5" rx="2" fill="#B7B0A0" />
      <rect x="102" y="30" width="10" height="5" rx="2" fill="#B7B0A0" />
      <circle cx="28" cy="38" r="7" fill="#2B2420" />
      <circle cx="28" cy="38" r="3" fill="#8A847A" />
      <circle cx="86" cy="38" r="7" fill="#2B2420" />
      <circle cx="86" cy="38" r="3" fill="#8A847A" />
    </g>
  );
}

function Ferry() {
  return (
    <g>
      <path d="M0 28 H150 L138 44 H14 Z" fill="#3F4F5A" />
      <path d="M2 28 H148" stroke="#E9DCC4" strokeWidth="2" />
      <rect x="30" y="12" width="84" height="16" rx="3" fill="#E9DCC4" />
      {[36, 52, 68, 84, 100].map((x) => (
        <rect key={x} x={x} y="15" width="10" height="8" rx="1" fill="#6A7C86" />
      ))}
      <path d="M40 12 H104 L98 6 H46 Z" fill="#B5543C" />
      <path d="M120 12 V0 L132 4 L120 8" fill="#E57B3A" stroke="#3F4F5A" strokeWidth="1" />
    </g>
  );
}

function GasLamp() {
  return (
    <g>
      <circle cx="15" cy="16" r="14" fill="#FFD9A0" opacity="0.35" />
      <path d="M13 120 V30 H17 V120 Z" fill="#2E2622" />
      <path d="M8 120 H22 L20 108 H10 Z" fill="#2E2622" />
      <path d="M8 30 H22 L19 24 H11 Z" fill="#2E2622" />
      <path d="M9 24 L7 10 H23 L21 24 Z" fill="#FFE2A8" stroke="#2E2622" strokeWidth="1.6" />
      <path d="M6 10 L15 3 L24 10 Z" fill="#2E2622" />
    </g>
  );
}

function BookStall() {
  const books = ["#B5543C", "#2F6FA8", "#E9B35A", "#4D7C5B", "#7C4A8C", "#C9893F", "#365A7A"];
  return (
    <g>
      <path d="M0 22 L10 4 H110 L120 22 Z" fill="#B5543C" />
      <path d="M0 22 H120 M20 4 L14 22 M40 4 L36 22 M60 4 V22 M80 4 L84 22 M100 4 L106 22" stroke="#F3E3C8" strokeWidth="2" />
      <rect x="6" y="22" width="108" height="48" fill="#6B4630" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={10 + i * 7.3} y={28 + (i % 3) * 2} width="6" height={14 - (i % 3) * 2} fill={books[i % books.length]} />
      ))}
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={`b${i}`} x={12 + i * 7.6} y={48 + (i % 2) * 2} width="6.5" height={14 - (i % 2) * 2} fill={books[(i + 3) % books.length]} />
      ))}
    </g>
  );
}

export default function KolkataScene() {
  return (
    <>
      <Sky top="#E99E5C" horizon="#FBE3BD" glow={{ x: "24%", y: "68%", colour: "rgba(255, 214, 150, 0.85)" }} />
      <Disc x="20vw" y="calc(var(--hz) * 0.6)" size="7vmin" colour="#FFE7B8" halo="rgba(255, 196, 120, 0.55)" density="reduced" />
      <Far>
        <FarRiverbank />
      </Far>
      <Landmark name="riverside-temple" role="support" viewBox="0 0 260 200" place={{ side: "right", portrait: "right", offset: "1.5vw" }}>
        <RiversideTemples />
      </Landmark>
      <Landmark name="howrah-bridge" role="hero" viewBox="0 0 1000 330" size={0.82} place={{ side: "left", portrait: "centre", offset: "-2vw" }}>
        <HowrahBridge />
      </Landmark>
      <Water colour="#7FA7A5" deep="#5D8A8D" />
      <Ground
        background={[
          "linear-gradient(180deg, transparent 5.7vh, rgba(176,141,87,0.9) 5.7vh, rgba(176,141,87,0.9) 6vh, transparent 6vh, transparent 6.7vh, rgba(176,141,87,0.9) 6.7vh, rgba(176,141,87,0.9) 7vh, transparent 7vh) top / 100% 8vh no-repeat",
          "repeating-linear-gradient(90deg, rgba(110,52,26,0.13) 0 2px, transparent 2px 66px)",
          "repeating-linear-gradient(0deg, rgba(110,52,26,0.13) 0 2px, transparent 2px 33px)",
          "linear-gradient(180deg, #B4835F, #C59B76 22%, #BF9271)",
        ].join(", ")}
        edge={
          <g>
            <rect x="0" y="0" width="1600" height="40" fill="#A97C5A" />
            <path d="M0 6 H1600 M0 32 H1600" stroke="#2E2622" strokeWidth="3" />
            <g fill="#2E2622">
              {Array.from({ length: 80 }, (_, i) => (
                <path key={i} d={`M${i * 20 + 8} 8 Q${i * 20 + 4} 19 ${i * 20 + 10} 30 H${i * 20 + 12} Q${i * 20 + 16} 19 ${i * 20 + 12} 8 Z`} />
              ))}
            </g>
          </g>
        }
      />
      <Fixture name="gas-lamp" viewBox="0 0 30 120" left="2.5vw" depth="3.2vh" height="17vh">
        <GasLamp />
      </Fixture>
      <Fixture name="book-stall" viewBox="0 0 120 70" left="7vw" depth="12vh" height="7vh" density="full">
        <BookStall />
      </Fixture>
      <Fixture name="gas-lamp-2" asset="gas-lamp" viewBox="0 0 30 120" left="16.5vw" depth="3.2vh" height="17vh" density="full">
        <GasLamp />
      </Fixture>
      {/* Moving pieces last: the static scenery above paints as one layer. */}
      <Clouds colour="#FFF1DC" />
      <Shimmer />
      <Traveller name="ferry" viewBox="0 0 150 46" laneY="calc(var(--water-h) * 0.25)" height="calc(var(--water-h) * 0.42)" duration="140s" delay="-60s" direction="rtl">
        <Ferry />
      </Traveller>
      <Traveller name="tram" viewBox="0 -4 258 68" laneY="calc(var(--water-h) + 1vh)" height="5.2vh" duration="70s" delay="-25s">
        <Tram />
      </Traveller>
      <Traveller name="yellow-taxi" viewBox="0 0 112 46" laneY="calc(var(--water-h) + 9vh)" height="3.4vh" duration="34s" delay="-9s" direction="rtl">
        <YellowTaxi />
      </Traveller>
      <Particles kind="mote" colour="#FFE3B3" count={7} />
    </>
  );
}
