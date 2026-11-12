// Ported from osu.Game/Graphics/HSPAColour.cs. The arithmetic is in floats, as in C#.

import { Colour4 } from '@fw/graphics/Colour4';

const f = Math.fround;

const p_r = f(0.299);
const p_g = f(0.587);
const p_b = f(0.114);

const sixth = f(1 / 6);
const sqrt = (v: number) => f(Math.sqrt(v));

/** A colour as hue, saturation, perceived brightness and alpha. */
export class HSPAColour {
  /** The hue. */
  h = 0;

  /** The saturation. */
  s = 0;

  /** The perceived brightness of this colour. */
  p: number;

  /** The alpha. */
  a: number;

  /** Creates a new HSPAColour from a Colour4. */
  constructor(colour: Colour4) {
    const r = f(colour.r), g = f(colour.g), b = f(colour.b);

    this.p = sqrt(f(f(f(r * r) * p_r) + f(f(g * g) * p_g)) + f(f(b * b) * p_b));
    this.a = f(colour.a);

    if (r === g && r === b)
      return;

    if (r >= g && r >= b) {
      if (b >= g) {
        this.h = f(f(6 / 6) - f(f(sixth * f(b - g)) / f(r - g)));
        this.s = f(1 - f(g / r));
      } else {
        this.h = f(f(0 / 6) + f(f(sixth * f(g - b)) / f(r - b)));
        this.s = f(1 - f(b / r));
      }
    } else if (g >= r && g >= b) {
      if (r >= b) {
        this.h = f(f(2 / 6) - f(f(sixth * f(r - b)) / f(g - b)));
        this.s = f(1 - f(b / g));
      } else {
        this.h = f(f(2 / 6) + f(f(sixth * f(b - r)) / f(g - r)));
        this.s = f(1 - f(r / g));
      }
    } else {
      if (g >= r) {
        this.h = f(f(4 / 6) - f(f(sixth * f(g - r)) / f(b - r)));
        this.s = f(1 - f(r / b));
      } else {
        this.h = f(f(4 / 6) + f(f(sixth * f(r - g)) / f(b - g)));
        this.s = f(1 - f(g / b));
      }
    }
  }

  /** Converts this HSPAColour to a Colour4. */
  toColour4(): Colour4 {
    const minOverMax = f(1 - this.s);
    const P = this.p;

    let h = this.h;
    let r = 0, g = 0, b = 0;

    if (minOverMax > 0) {
      const inv = f(1 / minOverMax);
      const part = (hh: number) => f(1 + f(hh * f(inv - 1)));
      // P / sqrt(a / minOverMax / minOverMax + b * part * part + c)
      const low = (a: number, bb: number, c: number, pt: number) => f(P / sqrt(f(f(f(f(a / minOverMax) / minOverMax) + f(f(bb * pt) * pt)) + c)));

      if (h < f(1 / 6)) {
        h = f(6 * f(h - f(0 / 6)));
        b = low(p_r, p_g, p_b, part(h));
        r = f(b / minOverMax);
        g = f(b + f(h * f(r - b)));
      } else if (h < f(2 / 6)) {
        h = f(6 * f(-h + f(2 / 6)));
        b = low(p_g, p_r, p_b, part(h));
        g = f(b / minOverMax);
        r = f(b + f(h * f(g - b)));
      } else if (h < f(3 / 6)) {
        h = f(6 * f(h - f(2 / 6)));
        r = low(p_g, p_b, p_r, part(h));
        g = f(r / minOverMax);
        b = f(r + f(h * f(g - r)));
      } else if (h < f(4 / 6)) {
        h = f(6 * f(-h + f(4 / 6)));
        r = low(p_b, p_g, p_r, part(h));
        b = f(r / minOverMax);
        g = f(r + f(h * f(b - r)));
      } else if (h < f(5 / 6)) {
        h = f(6 * f(h - f(4 / 6)));
        g = low(p_b, p_r, p_g, part(h));
        b = f(g / minOverMax);
        r = f(g + f(h * f(b - g)));
      } else {
        h = f(6 * f(-h + f(6 / 6)));
        g = low(p_r, p_b, p_g, part(h));
        r = f(g / minOverMax);
        b = f(g + f(h * f(r - g)));
      }
    } else {
      // sqrt(P * P / (a + b * h * h))
      const high = (a: number, bb: number, hh: number) => sqrt(f(f(P * P) / f(a + f(f(bb * hh) * hh))));

      if (h < f(1 / 6)) {
        h = f(6 * f(h - f(0 / 6)));
        r = high(p_r, p_g, h);
        g = f(r * h);
        b = 0;
      } else if (h < f(2 / 6)) {
        h = f(6 * f(-h + f(2 / 6)));
        g = high(p_g, p_r, h);
        r = f(g * h);
        b = 0;
      } else if (h < f(3 / 6)) {
        h = f(6 * f(h - f(2 / 6)));
        g = high(p_g, p_b, h);
        b = f(g * h);
        r = 0;
      } else if (h < f(4 / 6)) {
        h = f(6 * f(-h + f(4 / 6)));
        b = high(p_b, p_g, h);
        g = f(b * h);
        r = 0;
      } else if (h < f(5 / 6)) {
        h = f(6 * f(h - f(4 / 6)));
        b = high(p_b, p_r, h);
        r = f(b * h);
        g = 0;
      } else {
        h = f(6 * f(-h + f(6 / 6)));
        r = high(p_r, p_b, h);
        b = f(r * h);
        g = 0;
      }
    }

    return new Colour4(r, g, b, this.a);
  }
}
