// Mumbai at monsoon dusk: the Gateway of India on the waterfront, art deco
// facades of Marine Drive, a skyline with lit windows and the Sea Link's
// cable fans, the Arabian Sea, tetrapods along the sea wall, the Queen's
// Necklace of street lights, a local train, a black-and-yellow taxi and a
// light drizzle. Original artwork, drawn in code.

import { Disc, Far, Fixture, Ground, Landmark, Particles, Shimmer, Sky, Traveller, Water, Windows } from "./sceneKit";

const BASALT = "#D9B47E";
const BASALT_SHADE = "#B08850";
const BASALT_DEEP = "#7E5E36";

function Turret({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={BASALT} />
      <rect x={x + w * 0.55} y={y} width={w * 0.45} height={h} fill={BASALT_SHADE} opacity="0.6" />
      <path d={`M${x + w * 0.3} ${y + h * 0.75} V${y + h * 0.35} Q${x + w * 0.5} ${y + h * 0.2} ${x + w * 0.7} ${y + h * 0.35} V${y + h * 0.75} Z`} fill={BASALT_DEEP} opacity="0.55" />
      <rect x={x - 3} y={y - 5} width={w + 6} height="6" fill={BASALT_SHADE} />
      <path d={`M${x - 1} ${y - 5} Q${x + w / 2} ${y - w * 1.1} ${x + w + 1} ${y - 5} Z`} fill={BASALT} />
      <rect x={x + w / 2 - 1} y={y - w * 1.25} width="2" height={w * 0.4} fill={BASALT_DEEP} />
    </g>
  );
}

function Gateway() {
  return (
    <g>
      {/* Plinth and steps to the water. */}
      <rect x="10" y="326" width="500" height="14" fill={BASALT_SHADE} />
      {/* Side wings with two storeys of small arches. */}
      {[40, 370].map((x) => (
        <g key={x}>
          <rect x={x} y="168" width="110" height="160" fill={BASALT} />
          <rect x={x} y="168" width="110" height="8" fill={BASALT_SHADE} />
          {[0, 1, 2].map((k) => (
            <g key={k} fill={BASALT_DEEP} opacity="0.6">
              <path d={`M${x + 10 + k * 34} 318 V270 Q${x + 22 + k * 34} 252 ${x + 34 + k * 34} 270 V318 Z`} />
              <path d={`M${x + 12 + k * 34} 236 V206 Q${x + 22 + k * 34} 192 ${x + 32 + k * 34} 206 V236 Z`} />
            </g>
          ))}
        </g>
      ))}
      {/* The central block and its great arch. */}
      <rect x="150" y="92" width="220" height="236" fill={BASALT} />
      <rect x="276" y="92" width="94" height="236" fill={BASALT_SHADE} opacity="0.45" />
      <path d="M204 328 V196 Q204 150 260 138 Q316 150 316 196 V328 Z" fill="#4A3F55" />
      <path d="M214 328 V200 Q214 162 260 150 Q306 162 306 200 V328 Z" fill="#E8A57C" opacity="0.35" />
      <path d="M196 196 Q196 142 260 128 Q324 142 324 196" stroke={BASALT_DEEP} strokeWidth="4" fill="none" opacity="0.7" />
      {/* Jaali bands and the parapet. */}
      <rect x="150" y="104" width="220" height="14" fill={BASALT_DEEP} opacity="0.35" />
      <g fill={BASALT}>
        {Array.from({ length: 22 }, (_, i) => (
          <rect key={i} x={153 + i * 10} y="106" width="5" height="10" />
        ))}
      </g>
      <rect x="144" y="86" width="232" height="8" fill={BASALT_SHADE} />
      {/* Four turrets with domes, and the wing corner turrets. */}
      <Turret x={152} y={40} w={30} h={50} />
      <Turret x={338} y={40} w={30} h={50} />
      <Turret x={196} y={58} w={22} h={32} />
      <Turret x={302} y={58} w={22} h={32} />
      <Turret x={34} y={132} w={22} h={40} />
      <Turret x={464} y={132} w={22} h={40} />
    </g>
  );
}

function DecoRow() {
  const buildings = [
    { x: 0, w: 120, h: 190, fill: "#EFD9C4", band: "#E3C77B" },
    { x: 124, w: 110, h: 230, fill: "#D9E4DA", band: "#B9C9B6" },
    { x: 238, w: 122, h: 176, fill: "#F2CDB8", band: "#E3C77B" },
  ];
  return (
    <g>
      {buildings.map((b) => {
        const top = 260 - b.h;
        return (
          <g key={b.x}>
            <path d={`M${b.x} 260 V${top + 18} Q${b.x} ${top} ${b.x + 18} ${top} H${b.x + b.w} V260 Z`} fill={b.fill} />
            <rect x={b.x + b.w - 26} y={top - 18} width="16" height={b.h + 18} fill={b.band} />
            <g fill={b.band} opacity="0.9">
              {Array.from({ length: Math.floor(b.h / 26) }, (_, k) => (
                <rect key={k} x={b.x + 4} y={top + 16 + k * 26} width={b.w - 34} height="4" rx="2" />
              ))}
            </g>
            <Windows x={b.x + 10} y={top + 22} cols={4} rows={Math.floor(b.h / 26) - 1} w={13} h={12} gapX={7} gapY={14} fill="#5C6A86" lit="#FFD98E" litEvery={4} />
          </g>
        );
      })}
    </g>
  );
}

function FarSkyline() {
  return (
    <g>
      {/* Towers with lit windows. */}
      <g fill="#6B6F93" opacity="0.85">
        {[
          [20, 90, 40],
          [70, 60, 34],
          [110, 110, 50],
          [520, 100, 46],
          [576, 70, 40],
          [626, 120, 34],
          [880, 84, 44],
          [934, 50, 30],
          [1340, 96, 42],
          [1392, 64, 36],
          [1440, 116, 48],
          [1500, 80, 40],
        ].map(([x, top, w]) => (
          <rect key={x} x={x} y={top} width={w} height={200 - top!} />
        ))}
      </g>
      <g>
        {[
          [24, 96],
          [114, 116],
          [524, 106],
          [630, 126],
          [884, 90],
          [1344, 102],
          [1444, 122],
        ].map(([x, y]) => (
          <Windows key={x} x={x! + 4} y={y! + 4} cols={3} rows={Math.floor((196 - y!) / 14)} w={6} h={5} gapX={5} gapY={9} fill="#7C80A3" lit="#FFD98E" litEvery={5} />
        ))}
      </g>
      {/* The Sea Link: two pylons with cable fans. */}
      <g data-asset="sea-link" stroke="#8E92B3" strokeWidth="1.4" opacity="0.9">
        {[1090, 1230].map((x) => (
          <g key={x}>
            <path d={`M${x - 10} 196 L${x} 70 L${x + 10} 196`} fill="none" strokeWidth="5" />
            {Array.from({ length: 7 }, (_, i) => (
              <path key={i} d={`M${x} ${80 + i * 6} L${x - 30 - i * 14} 170 M${x} ${80 + i * 6} L${x + 30 + i * 14} 170`} />
            ))}
          </g>
        ))}
        <path d="M960 172 H1360" strokeWidth="5" />
      </g>
      {/* The Queen's Necklace: street lights along the curve of the bay. */}
      <g fill="#FFE0A0">
        {Array.from({ length: 60 }, (_, i) => (
          <circle key={i} cx={10 + i * 27} cy={196 - Math.sin((i / 59) * Math.PI) * 10} r="1.8" />
        ))}
      </g>
    </g>
  );
}

function LocalTrain() {
  return (
    <g>
      {[0, 104, 208].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect x="1" y="4" width="100" height="40" rx="6" fill="#EDE6D6" />
          <rect x="1" y="30" width="100" height="10" fill="#7B2E4A" />
          <rect x="1" y="4" width="100" height="5" rx="3" fill="#7B2E4A" />
          {[8, 30, 52, 74].map((wx) => (
            <rect key={wx} x={wx} y="13" width="16" height="12" rx="2" fill="#4B5466" />
          ))}
          <rect x="44" y="12" width="12" height="28" fill="#3C3F4A" opacity="0.7" />
          <circle cx="18" cy="47" r="4" fill="#2B2B33" />
          <circle cx="84" cy="47" r="4" fill="#2B2B33" />
        </g>
      ))}
    </g>
  );
}

function KaaliPeeli() {
  return (
    <g>
      <path d="M6 30 Q6 20 16 18 L28 6 Q32 2 40 2 H66 Q74 2 78 8 L88 18 Q100 20 102 28 V34 H6 Z" fill="#1F1F24" />
      <path d="M28 6 Q32 2 40 2 H66 Q74 2 78 8 L88 18 H16 Z" fill="#F2C230" />
      <path d="M32 8 H50 V17 H24 Z M54 8 H72 Q76 8 78 12 L82 17 H54 Z" fill="#59657A" />
      <circle cx="26" cy="34" r="6.5" fill="#111" />
      <circle cx="82" cy="34" r="6.5" fill="#111" />
      <circle cx="102" cy="26" r="2.5" fill="#FFF3C4" />
    </g>
  );
}

function StreetLamp() {
  return (
    <g>
      <circle cx="34" cy="10" r="14" fill="#FFE0A0" opacity="0.35" />
      <path d="M8 120 V24 Q8 8 26 8 H34" stroke="#2D3142" strokeWidth="4" fill="none" />
      <path d="M26 6 H42 L40 12 H28 Z" fill="#2D3142" />
      <ellipse cx="34" cy="13" rx="6" ry="2.5" fill="#FFE9C2" />
      <path d="M2 120 H14 L12 110 H4 Z" fill="#2D3142" />
    </g>
  );
}

const TETRAPOD = "M10 34 L18 18 L14 4 L22 16 L30 6 L26 20 L36 32 L22 26 Z";

export default function MumbaiScene() {
  return (
    <>
      <Sky top="#3E4C7A" horizon="#EDA77E" glow={{ x: "62%", y: "88%", colour: "rgba(255, 170, 130, 0.75)" }} />
      <Disc x="66vw" y="calc(var(--hz) * 0.82)" size="6vmin" colour="#FFC9A0" halo="rgba(255, 150, 110, 0.45)" density="reduced" />
      <Far>
        <FarSkyline />
      </Far>
      <Landmark name="art-deco" asset="deco-facades" role="support" viewBox="0 0 360 260" size={0.8} place={{ side: "right", portrait: "right", offset: "1vw" }}>
        <DecoRow />
      </Landmark>
      <Landmark name="gateway" role="hero" viewBox="0 0 520 340" place={{ side: "left", portrait: "centre", offset: "1.5vw" }}>
        <Gateway />
      </Landmark>
      <Water colour="#3B6A88" deep="#2A5070" />
      <Ground
        background={[
          "repeating-linear-gradient(90deg, rgba(255, 224, 160, 0.06) 0 2px, transparent 2px 48px)",
          "repeating-linear-gradient(0deg, rgba(20, 24, 40, 0.1) 0 2px, transparent 2px 48px)",
          "linear-gradient(180deg, transparent 4.2vh, rgba(60, 60, 70, 0.55) 4.2vh, rgba(60, 60, 70, 0.55) 4.5vh, transparent 4.5vh, transparent 5.1vh, rgba(60, 60, 70, 0.55) 5.1vh, rgba(60, 60, 70, 0.55) 5.4vh, transparent 5.4vh) top / 100% 6vh no-repeat",
          "linear-gradient(180deg, #8C95A0, #9AA3A8 30%, #8E979E)",
        ].join(", ")}
        edge={
          <g>
            <rect width="1600" height="40" fill="#7D858E" />
            <g fill="#A7AEB4">
              {Array.from({ length: 46 }, (_, i) => (
                <path key={i} d={TETRAPOD} transform={`translate(${i * 35 - 4} ${i % 2 ? 2 : 6})`} />
              ))}
            </g>
          </g>
        }
      />
      <Fixture name="street-lamp" asset="promenade-lights" viewBox="0 0 48 120" left="2vw" depth="2.6vh" height="15vh">
        <StreetLamp />
      </Fixture>
      <Fixture name="street-lamp-2" asset="promenade-lights" viewBox="0 0 48 120" left="17vw" depth="2.6vh" height="15vh" density="full">
        <StreetLamp />
      </Fixture>
      {/* Moving pieces last: the static scenery above paints as one layer. */}
      <Shimmer />
      <Traveller name="local-train" viewBox="0 0 312 52" laneY="calc(var(--water-h) + 0.4vh)" height="5vh" duration="40s" delay="-6s">
        <LocalTrain />
      </Traveller>
      <Traveller name="taxi" viewBox="0 0 106 42" laneY="calc(var(--water-h) + 8vh)" height="3.4vh" duration="26s" delay="-14s" direction="rtl">
        <KaaliPeeli />
      </Traveller>
      <Particles kind="drizzle" colour="#DDE6F2" count={9} />
    </>
  );
}
