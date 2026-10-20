// DOM rendering of CompositeDrawable edge effects, matching osu!framework's masking shader (sh_Masking.h, getRoundedColor)
// as configured by CompositeDrawableDrawNode.drawEdgeEffect:
//   maskingRect = DrawRectangle inflated by Radius (offset by Offset), corner radius = effectiveCornerRadius + Radius + Roundness,
//   blend range = Radius, alpha exponent = 2.
// Solving the shader for a point at distance d outside the (offset) draw rectangle gives alpha = (1 - d / Radius)^2,
// with corners following arcs of radius (effectiveCornerRadius + Roundness). Hollow effects discard the interior (d < 0).
// This is drawn as nine background-gradient regions over the inflated rectangle.

import type { Colour4 } from '../Colour4';

/** Stops of (1 - t)^2, sampled; CSS interpolates linearly between them. */
const falloff = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(t => [t, (1 - t) * (1 - t)] as const);

function rgba(c: Colour4, alpha: number): string {
  const ch = (v: number) => Math.min(1, Math.max(0, v)) * 255;
  return `rgba(${ch(c.r)},${ch(c.g)},${ch(c.b)},${Math.min(1, Math.max(0, c.a * alpha))})`;
}

/** Colour stops for a gradient running from `start` px (the masking edge) outward over `radius` px. */
function stops(colour: Colour4, start: number, radius: number, hollow: boolean): string {
  const s = falloff.map(([t, a]) => `${rgba(colour, a)} ${start + t * radius}px`);
  const inner = hollow ? `${rgba(colour, 0)} ${start}px, ` : `${rgba(colour, 1)} 0px, `;
  return inner + s.join(', ');
}

export interface EdgeEffectGeometry {
  /** Draw size of the composite. */
  width: number;
  height: number;
  /** Effective corner radius + roundness of the edge effect's solid shape. */
  cornerRadius: number;
  /** Edge effect radius (fade distance). */
  radius: number;
  hollow: boolean;
  colour: Colour4;
}

/** Returns the CSS for an element covering the inflated rectangle (left/top = -radius relative to the offset draw rect). */
export function edgeEffectCss(g: EdgeEffectGeometry): { width: number; height: number; backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const R = g.radius;
  const rc = Math.max(0, Math.min(g.cornerRadius, g.width / 2, g.height / 2));
  const W = g.width + 2 * R;
  const H = g.height + 2 * R;
  const c = rc + R;

  const midW = Math.max(0, W - 2 * c);
  const midH = Math.max(0, H - 2 * c);

  const layers: [string, string, string][] = [];

  // corners: circle centred at the inner corner of each c x c square.
  const corner = (at: string) => `radial-gradient(circle at ${at}, ${stops(g.colour, rc, R, g.hollow)})`;
  layers.push([corner('100% 100%'), `${c}px ${c}px`, '0px 0px']);
  layers.push([corner('0% 100%'), `${c}px ${c}px`, `${W - c}px 0px`]);
  layers.push([corner('100% 0%'), `${c}px ${c}px`, `0px ${H - c}px`]);
  layers.push([corner('0% 0%'), `${c}px ${c}px`, `${W - c}px ${H - c}px`]);

  // edges: linear from the masking edge (at distance c - R ... measured from the inner side) outward.
  const edge = (dir: string) => `linear-gradient(${dir}, ${stops(g.colour, rc, R, g.hollow)})`;
  layers.push([edge('to top'), `${midW}px ${c}px`, `${c}px 0px`]);
  layers.push([edge('to bottom'), `${midW}px ${c}px`, `${c}px ${H - c}px`]);
  layers.push([edge('to left'), `${c}px ${midH}px`, `0px ${c}px`]);
  layers.push([edge('to right'), `${c}px ${midH}px`, `${W - c}px ${c}px`]);

  // centre
  if (!g.hollow)
    layers.push([`linear-gradient(${rgba(g.colour, 1)}, ${rgba(g.colour, 1)})`, `${midW}px ${midH}px`, `${c}px ${c}px`]);

  return {
    width: W,
    height: H,
    backgroundImage: layers.map(l => l[0]).join(', '),
    backgroundSize: layers.map(l => l[1]).join(', '),
    backgroundPosition: layers.map(l => l[2]).join(', '),
  };
}
