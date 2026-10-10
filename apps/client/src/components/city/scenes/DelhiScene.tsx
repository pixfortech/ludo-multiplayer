// Delhi at dusk: India Gate at the end of the ceremonial avenue, the Qutub
// Minar, the skyline of domes and minarets (Jama Masjid, the Red Fort's
// gate, the Rashtrapati Bhavan dome), red sandstone paving with buff bands and lawns, the canopy pavilion, avenue
// lamps, kites and an auto-rickshaw. Original artwork, drawn in code.

import { Clouds, Disc, Far, Fixture, Floater, Ground, Landmark, Sky, Traveller } from "./sceneKit";

const LIT = "#E6AE7B";
const SANDSTONE = "#C98A5C";
const SHADE = "#A7683F";
const DEEP = "#7E4A2C";

function IndiaGate() {
  return (
    <g>
      <defs>
        <linearGradient id="cb-dl-face" x1="0" x2="1">
          <stop offset="0" stopColor={LIT} />
          <stop offset="0.55" stopColor={SANDSTONE} />
          <stop offset="1" stopColor={SHADE} />
        </linearGradient>
      </defs>
      {/* Steps and plinth. */}
      <rect x="0" y="404" width="300" height="16" fill={SHADE} />
      <rect x="12" y="394" width="276" height="12" fill={SANDSTONE} />
      <rect x="24" y="384" width="252" height="12" fill={LIT} />
      {/* The arch body. */}
      <path d="M40 384 V124 H260 V384 H196 V214 A46 46 0 0 0 104 214 V384 Z" fill="url(#cb-dl-face)" />
      {/* Inner arch, in shadow. */}
      <path d="M104 384 V214 A46 46 0 0 1 196 214 V384 H186 V218 A36 36 0 0 0 114 218 V384 Z" fill={DEEP} opacity="0.55" />
      <path d="M114 384 V218 A36 36 0 0 1 186 218 V384 Z" fill="#F3C9A0" opacity="0.35" />
      {/* Recessed panels on the piers. */}
      <g fill={DEEP} opacity="0.25">
        <rect x="56" y="232" width="32" height="138" rx="2" />
        <rect x="212" y="232" width="32" height="138" rx="2" />
        <path d="M56 214 V170 A16 16 0 0 1 88 170 V214 Z M212 214 V170 A16 16 0 0 1 244 170 V214 Z" />
      </g>
      {/* Inscription band and cornices. */}
      <rect x="34" y="140" width="232" height="22" fill={SANDSTONE} />
      <g fill={DEEP} opacity="0.35">
        {Array.from({ length: 13 }, (_, i) => (
          <rect key={i} x={52 + i * 15.5} y="147" width="9" height="8" rx="1" />
        ))}
      </g>
      <rect x="28" y="116" width="244" height="10" fill={LIT} />
      <rect x="28" y="126" width="244" height="4" fill={DEEP} opacity="0.35" />
      {/* Stepped attic and the shallow bowl on top. */}
      <rect x="58" y="80" width="184" height="36" fill={SANDSTONE} />
      <rect x="58" y="80" width="184" height="6" fill={LIT} />
      <rect x="86" y="54" width="128" height="26" fill={LIT} />
      <rect x="150" y="54" width="64" height="26" fill={SHADE} opacity="0.4" />
      <path d="M104 54 Q150 18 196 54 Z" fill={SANDSTONE} />
      <path d="M150 23 Q178 30 196 54 H150 Z" fill={SHADE} opacity="0.45" />
      <rect x="146" y="12" width="8" height="12" rx="2" fill={SANDSTONE} />
      {/* The right side in shade (light from the west). */}
      <path d="M260 124 V384 H244 V124 Z" fill={DEEP} opacity="0.2" />
    </g>
  );
}

function QutubMinar() {
  // Five tapering storeys, fluted, with projecting balconies; red sandstone below, marble bands above.
  const storeys = [
    { y0: 400, y1: 300, w0: 40, w1: 34, fill: "#B65E3C" },
    { y0: 292, y1: 210, w0: 32, w1: 28, fill: "#BF6A45" },
    { y0: 202, y1: 140, w0: 26, w1: 23, fill: "#C47450" },
    { y0: 132, y1: 86, w0: 21, w1: 18, fill: "#E9D7C4" },
    { y0: 78, y1: 40, w0: 16, w1: 13, fill: "#E2C9AE" },
  ];
  return (
    <g>
      {storeys.map((s, i) => (
        <g key={i}>
          <path d={`M${50 - s.w0} ${s.y0} L${50 - s.w1} ${s.y1} H${50 + s.w1} L${50 + s.w0} ${s.y0} Z`} fill={s.fill} />
          <g stroke="#7E3A22" strokeWidth="1.2" opacity="0.35">
            {[-0.66, -0.33, 0, 0.33, 0.66].map((k) => (
              <path key={k} d={`M${50 + k * s.w0} ${s.y0} L${50 + k * s.w1} ${s.y1}`} />
            ))}
          </g>
          <path d={`M${50 + s.w1 * 0.2} ${s.y1} L${50 + s.w0 * 0.2} ${s.y0} H${50 + s.w0} L${50 + s.w1} ${s.y1} Z`} fill="#7E3A22" opacity="0.2" />
          <rect x={50 - s.w1 - 6} y={s.y1 - 8} width={(s.w1 + 6) * 2} height="8" rx="2" fill="#8E4A2E" />
          <rect x={50 - s.w1 - 6} y={s.y1 - 8} width={(s.w1 + 6) * 2} height="2" fill="#E8B48C" />
        </g>
      ))}
      <path d="M40 32 Q50 18 60 32 Z" fill="#C47450" />
      <rect x="48.5" y="10" width="3" height="10" fill="#8E4A2E" />
    </g>
  );
}

function RedFortGate() {
  return (
    <g>
      <path d="M0 220 V120 H520 V220 Z" fill="#A9482F" />
      <path d="M0 120 H520" stroke="#C86A4A" strokeWidth="5" />
      <g fill="#8E3A24">
        {Array.from({ length: 26 }, (_, i) => (
          <path key={i} d={`M${6 + i * 20} 120 V110 Q${14 + i * 20} 102 ${22 + i * 20} 110 V120 Z`} />
        ))}
      </g>
      {/* Gate tower with its arch, flanked by octagonal towers with chhatris. */}
      <path d="M200 220 V70 H320 V220 Z" fill="#B65439" />
      <path d="M236 220 V150 A24 24 0 0 1 284 150 V220 Z" fill="#5A2416" />
      <g fill="#E9D7C4">
        {[214, 244, 274, 304].map((x) => (
          <g key={x}>
            <rect x={x - 6} y="50" width="12" height="20" />
            <path d={`M${x - 9} 52 Q${x} 36 ${x + 9} 52 Z`} />
          </g>
        ))}
      </g>
      {[170, 350].map((x) => (
        <g key={x}>
          <path d={`M${x - 22} 220 V84 H${x + 22} V220 Z`} fill="#A24229" />
          <rect x={x - 16} y="62" width="32" height="22" fill="#E9D7C4" />
          <path d={`M${x - 20} 64 Q${x} 34 ${x + 20} 64 Z`} fill="#F1E6D8" />
        </g>
      ))}
      <path d="M260 36 V8 L282 14 L260 20" stroke="#5A2416" strokeWidth="2" fill="#E07B2E" />
    </g>
  );
}

function FarCity() {
  const haze = "#D99A78";
  return (
    <g>
      <g fill={haze} opacity="0.5">
        {/* A great dome on a long colonnade, far away. */}
        <path d="M60 200 V160 H420 V200 Z M200 160 V132 H280 V160 Z M206 132 Q240 84 274 132 Z" />
        <rect x="236" y="76" width="8" height="12" />
        {/* Jama Masjid: three onion domes and two tall minarets. */}
        <path d="M1050 200 V150 H1290 V200 Z" />
        <path d="M1090 150 Q1090 118 1110 108 Q1130 118 1130 150 Z M1140 150 Q1140 104 1170 90 Q1200 104 1200 150 Z M1210 150 Q1210 118 1230 108 Q1250 118 1250 150 Z" />
        <path d="M1040 200 V70 H1052 V200 Z M1288 200 V70 H1300 V200 Z" />
        <path d="M1036 72 Q1046 56 1056 72 Z M1284 72 Q1294 56 1304 72 Z" />
      </g>
      <g fill="#C27F5C" opacity="0.65">
        <path d="M480 200 Q500 160 540 168 Q580 150 610 176 Q640 160 660 182 V200 Z" />
        <path d="M1380 200 Q1400 168 1440 172 Q1480 156 1510 180 Q1540 170 1600 186 V200 Z" />
        <path d="M0 200 Q20 176 60 180 Q90 168 120 186 V200 Z" />
      </g>
    </g>
  );
}

function Canopy() {
  return (
    <g>
      <rect x="0" y="152" width="120" height="8" fill={SHADE} />
      <rect x="8" y="146" width="104" height="8" fill={SANDSTONE} />
      {[16, 40, 80, 104].map((x) => (
        <rect key={x} x={x - 4} y="70" width="8" height="78" fill={LIT} />
      ))}
      <rect x="4" y="60" width="112" height="12" fill={SANDSTONE} />
      <path d="M14 60 Q60 4 106 60 Z" fill={LIT} />
      <path d="M60 10 Q90 22 106 60 H60 Z" fill={SHADE} opacity="0.4" />
      <rect x="57" y="0" width="6" height="12" fill={SANDSTONE} />
    </g>
  );
}

function AvenueLamp() {
  return (
    <g>
      <circle cx="20" cy="14" r="16" fill="#FFE0B0" opacity="0.3" />
      <rect x="18" y="20" width="4" height="96" fill="#3A2A22" />
      <path d="M12 120 H28 L25 108 H15 Z" fill="#3A2A22" />
      <path d="M4 22 Q20 14 36 22" stroke="#3A2A22" strokeWidth="2.5" fill="none" />
      {[6, 20, 34].map((x) => (
        <circle key={x} cx={x} cy={x === 20 ? 10 : 24} r="5" fill="#FFE9C2" stroke="#3A2A22" strokeWidth="1.2" />
      ))}
    </g>
  );
}

function Auto() {
  return (
    <g>
      <path d="M8 36 V18 Q10 4 30 2 H58 Q70 2 72 14 L78 36 Z" fill="#1E7A4A" />
      <path d="M8 26 H78 V38 H8 Z" fill="#F2C230" />
      <path d="M30 8 H56 V24 H24 Z" fill="#2B3A33" opacity="0.6" />
      <path d="M62 8 Q68 8 70 14 L73 24 H62 Z" fill="#2B3A33" opacity="0.6" />
      <circle cx="18" cy="40" r="6" fill="#2B2420" />
      <circle cx="70" cy="40" r="6" fill="#2B2420" />
      <circle cx="80" cy="30" r="2.5" fill="#FFF3C4" />
    </g>
  );
}

function Kite({ colour, accent }: { colour: string; accent: string }) {
  return (
    <g>
      <path d="M20 0 L40 22 L20 44 L0 22 Z" fill={colour} />
      <path d="M20 0 L20 44 M0 22 H40" stroke={accent} strokeWidth="1.2" />
      <path d="M20 44 Q14 60 22 74 Q30 88 18 104" stroke="#5A3A2A" strokeWidth="0.9" fill="none" />
    </g>
  );
}

export default function DelhiScene() {
  return (
    <>
      <Sky top="#7E6F96" horizon="#F5C9A2" glow={{ x: "16%", y: "80%", colour: "rgba(255, 190, 140, 0.85)" }} />
      <Disc x="12vw" y="calc(var(--hz) * 0.7)" size="6vmin" colour="#FFD9B0" halo="rgba(255, 170, 120, 0.5)" density="reduced" />
      <Far>
        <FarCity />
      </Far>
      <Landmark name="red-fort" role="support" viewBox="0 0 520 220" size={0.75} place={{ side: "right", portrait: "left", offset: "0vw" }} density="full">
        <RedFortGate />
      </Landmark>
      <Landmark name="qutub-minar" role="support" viewBox="0 0 100 400" size={1.5} place={{ side: "right", portrait: "right", offset: "3vw" }}>
        <QutubMinar />
      </Landmark>
      <Landmark name="india-gate" role="hero" viewBox="0 0 300 420" place={{ side: "left", portrait: "centre", offset: "5vw" }}>
        <IndiaGate />
      </Landmark>
      <Ground
        background={[
          "linear-gradient(180deg, #86A85F 0, #79994F 2.4vh, #6A8A45 2.8vh, transparent 2.8vh) top / 100% 3vh no-repeat",
          "linear-gradient(180deg, transparent 3vh, rgba(240, 214, 176, 0.85) 3vh, rgba(240, 214, 176, 0.85) 3.6vh, transparent 3.6vh) top / 100% 4vh no-repeat",
          "repeating-linear-gradient(90deg, rgba(240, 214, 176, 0.32) 0 3px, transparent 3px 96px)",
          "repeating-linear-gradient(0deg, rgba(90, 30, 15, 0.12) 0 2px, transparent 2px 44px)",
          "linear-gradient(180deg, #B0694A, #A86044 40%, #9E5A3F)",
        ].join(", ")}
      />
      <Fixture name="canopy" viewBox="0 0 120 160" left="19vw" depth="6vh" height="11vh" density="full">
        <Canopy />
      </Fixture>
      <Fixture name="avenue-lamp" asset="avenue-lamps" viewBox="0 0 40 120" left="1.2vw" depth="4vh" height="13vh">
        <AvenueLamp />
      </Fixture>
      <Fixture name="avenue-lamp-2" asset="avenue-lamps" viewBox="0 0 40 120" left="8vw" depth="12vh" height="13vh" density="full">
        <AvenueLamp />
      </Fixture>
      {/* Moving pieces last: the static scenery above paints as one layer. */}
      <Clouds colour="#E9C7C2" count={3} />
      <Floater name="kite-1" asset="kites" viewBox="0 0 40 106" left="6vw" top="12vh" width="2.4vw">
        <Kite colour="#E8432E" accent="#FFE6A8" />
      </Floater>
      <Floater name="kite-2" asset="kites" viewBox="0 0 40 106" left="27vw" top="6vh" width="1.6vw" delay="-4s">
        <Kite colour="#F2C230" accent="#C0392B" />
      </Floater>
      <Floater name="kite-3" asset="kites" viewBox="0 0 40 106" left="88vw" top="9vh" width="1.8vw" delay="-7s">
        <Kite colour="#2E8BA0" accent="#FFFFFF" />
      </Floater>
      <Traveller name="auto" viewBox="0 0 84 46" laneY="11vh" height="4vh" duration="30s" delay="-12s">
        <Auto />
      </Traveller>
    </>
  );
}
