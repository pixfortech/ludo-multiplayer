// Colour science used to verify the palette: WCAG contrast, CIELAB,
// CIEDE2000 perceptual difference and colour-vision-deficiency simulation.
// Pure functions; sRGB with D65 white throughout.

export type Rgb = readonly [number, number, number]; // 0..1, gamma-encoded sRGB
export type Lab = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const to = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

export function linearize(rgb: Rgb): Rgb {
  return [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])];
}

function delinearize(lin: Rgb): Rgb {
  return [toGamma(clamp01(lin[0])), toGamma(clamp01(lin[1])), toGamma(clamp01(lin[2]))];
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = linearize(hexToRgb(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// --- CIELAB (D65) ---------------------------------------------------------

const WHITE = [0.95047, 1.0, 1.08883] as const;
const EPS = (6 / 29) ** 3;
const f = (t: number) => (t > EPS ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
const fInv = (t: number) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));

export function hexToLab(hex: string): Lab {
  const [r, g, b] = linearize(hexToRgb(hex));
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0];
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE[1];
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function labToHex([l, a, b]: Lab): string {
  const fy = (l + 16) / 116;
  const x = WHITE[0] * fInv(fy + a / 500);
  const y = WHITE[1] * fInv(fy);
  const z = WHITE[2] * fInv(fy - b / 200);
  const lin: Rgb = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  return rgbToHex(delinearize(lin));
}

/** Linear interpolation in Lab; t = 0 → a, t = 1 → b. */
export function mixLab(a: string, b: string, t: number): string {
  const la = hexToLab(a);
  const lb = hexToLab(b);
  return labToHex([la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t]);
}

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005). ~2.3 is a just-noticeable difference. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
    hbp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

export function deltaE(hexA: string, hexB: string): number {
  return deltaE2000(hexToLab(hexA), hexToLab(hexB));
}

// --- Colour-vision deficiency (Machado, Oliveira & Fernandes 2009, severity 1.0) ---

export type VisionType = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

const CVD_MATRICES: Record<Exclude<VisionType, "normal">, readonly number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

/** How `hex` appears to a viewer with the given (full-severity) deficiency. */
export function simulateVision(hex: string, vision: VisionType): string {
  if (vision === "normal") return rgbToHex(hexToRgb(hex));
  const m = CVD_MATRICES[vision];
  const [r, g, b] = linearize(hexToRgb(hex));
  const lin: Rgb = [
    m[0]! * r + m[1]! * g + m[2]! * b,
    m[3]! * r + m[4]! * g + m[5]! * b,
    m[6]! * r + m[7]! * g + m[8]! * b,
  ];
  return rgbToHex(delinearize(lin));
}
