// Small canvas textures for the 3D board: each identity's symbol for a token's
// top facet, move numbers, stack counts and the "You" label. Drawn from the
// same symbol paths as the 2D tokens; cached per renderer and disposed with it.

import { CanvasTexture, SRGBColorSpace, type Texture } from "three";
import { INK, SYMBOL_PATHS, type PlayerIdentity } from "@ludo/design-tokens";

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class TextureCache {
  private readonly cache = new Map<string, Texture>();

  private get(key: string, draw: () => Texture): Texture {
    let t = this.cache.get(key);
    if (!t) {
      t = draw();
      this.cache.set(key, t);
    }
    return t;
  }

  /** The identity's symbol in its ink colour on its body colour (a round top facet). */
  symbol(identity: PlayerIdentity): Texture {
    return this.get(`symbol:${identity.id}`, () => {
      const [c, g] = canvas(128);
      g.fillStyle = identity.body;
      g.beginPath();
      g.arc(64, 64, 64, 0, Math.PI * 2);
      g.fill();
      g.translate(64 - 40, 64 - 40);
      g.scale(80 / 24, 80 / 24);
      g.fillStyle = identity.ink;
      g.fill(new Path2D(SYMBOL_PATHS[identity.symbol]));
      return texture(c);
    });
  }

  /** A round badge with a number (a move's place in the tray, or a stack's count). */
  badge(text: string, light = false): Texture {
    return this.get(`badge:${text}:${light}`, () => {
      const [c, g] = canvas(64);
      g.fillStyle = light ? "#FFFFFF" : INK.dark;
      g.beginPath();
      g.arc(32, 32, 30, 0, Math.PI * 2);
      g.fill();
      if (light) {
        g.strokeStyle = INK.dark;
        g.lineWidth = 4;
        g.stroke();
      }
      g.fillStyle = light ? INK.dark : "#FFFFFF";
      g.font = "700 34px Inter Variable, Inter, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 32, 35);
      return texture(c);
    });
  }

  /** A short label (e.g. "You") in a colour, on a transparent background. */
  label(text: string, colour: string): Texture {
    return this.get(`label:${text}:${colour}`, () => {
      const [c, g] = canvas(128);
      g.fillStyle = colour;
      g.font = "700 44px Inter Variable, Inter, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 64, 66);
      return texture(c);
    });
  }

  dispose(): void {
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
  }
}
