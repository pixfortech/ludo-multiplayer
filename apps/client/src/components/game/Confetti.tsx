// One controlled confetti burst for a live victory (docs/design/motion.md:
// at most 80 particles, about 1.2 s, the winner's colours and gold). Canvas
// 2D, one requestAnimationFrame loop that stops by itself and is cancelled
// on unmount. Lazy-loaded; never used under reduced motion.
import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  colour: string;
}

export default function Confetti({ colours, count = 80, durationMs = 1300 }: { colours: string[]; count?: number; durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);
    const origins = [width * 0.3, width * 0.7];
    const particles: Particle[] = Array.from({ length: Math.min(count, 80) }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
      const speed = 5 + Math.random() * 6;
      return {
        x: origins[i % 2]!,
        y: height * 0.32,
        vx: Math.cos(angle) * speed + (i % 2 ? 1 : -1) * Math.random() * 1.5,
        vy: Math.sin(angle) * speed,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 5 + Math.random() * 4,
        h: 3 + Math.random() * 3,
        colour: colours[i % colours.length]!,
      };
    });
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, width, height);
      const fade = Math.max(0, Math.min(1, (durationMs - t) / 350));
      for (const p of particles) {
        p.vy += 0.22;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < durationMs) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [colours, count, durationMs]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" data-testid="confetti" />;
}
