// Ported from osu.Game/Graphics/GhostIcon.cs (+ osu-resources Shaders/sh_Ghost.fs)
// The fragment shader's signed distance field is evaluated per canvas pixel; its blend range (one screen pixel) becomes one canvas pixel.

import { CanvasDrawable } from '@fw/graphics/CanvasDrawable';

const pi = 3.14159265359;

function distanceToBox(px: number, py: number, sx: number, sy: number): number {
  const dx = Math.abs(px) - sx;
  const dy = Math.abs(py) - sy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

const easeInCirc = (x: number) => 1 - Math.sqrt(1 - x * x);

function mainBody(x: number, y: number): number {
  const topCircle = Math.hypot(x - 0.5, y - 0.375) - 0.375;
  const box = distanceToBox(x - 0.5, y - 0.75, 0.375, 0.375);
  return Math.min(topCircle, box);
}

function eyes(x: number, y: number): number {
  return Math.hypot(Math.abs(x - 0.5) - 0.125, y - 0.375) - 0.0625;
}

function zigzag(x: number, y: number, time: number): number {
  const num_spikes = 4;
  const scale = pi * 2 * num_spikes;
  const corner_radius = 0.0625;

  const strength = Math.sin(x * pi);

  let threshold = 0.875 + (Math.cos((x - time) * scale) * 0.5 + 0.5) * 0.125 * strength;

  const distanceToEdge = 0.375 - Math.abs(x - 0.5);

  if (distanceToEdge < corner_radius)
    threshold -= easeInCirc(1 - distanceToEdge / corner_radius) * corner_radius;

  return y - threshold;
}

/** A (very cute) animated version of the FontAwesome.Solid.Ghost icon. */
export class GhostIcon extends CanvasDrawable {
  /** How long one complete loop of the ghost's animation takes, in milliseconds */
  animationDuration = 2000;

  protected override update(): void {
    super.update();

    this.invalidateDraw();
  }

  protected override draw(ctx: CanvasRenderingContext2D, _width: number, _height: number): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const time = Math.fround(this.time.current / this.animationDuration) % 1;
    const blendRange = 1 / w;

    const image = ctx.createImageData(w, h);
    const data = image.data;
    const colour = this.drawColourInfo.colour.averageColour;
    const r = Math.round(colour.r * 255), g = Math.round(colour.g * 255), b = Math.round(colour.b * 255);

    for (let j = 0; j < h; j++) {
      const y = (j + 0.5) / h;

      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) / w;

        let dst = mainBody(x, y);
        dst = Math.max(dst, -eyes(x, y));
        dst = Math.max(dst, zigzag(x, y, time));

        const alpha = Math.min(Math.max(-dst, 0), blendRange) / blendRange;
        if (alpha <= 0)
          continue;

        const o = (j * w + i) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = Math.round(alpha * colour.a * 255);
      }
    }

    ctx.putImageData(image, 0, 0);
  }
}
