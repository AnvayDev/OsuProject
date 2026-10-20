// Ported from osu.Framework/Graphics/Colour4.cs
// osuTK's Color4 is folded into this type. Components are stored as JS doubles (C# uses float32).

import type { IEasingFunction } from '../transforms/Easing';
import type { IInterpolable } from '../transforms/Interpolation';

const gamma = 2.4;

/** Ported from osu.Framework/Extensions/Color4Extensions/Color4Extensions.cs */
export function toLinear(color: number): number {
  if (color === 1)
    return 1;

  return color <= 0.04045 ? color / 12.92 : Math.pow((color + 0.055) / 1.055, gamma);
}

export function toSRGB(color: number): number {
  if (color === 1)
    return 1;

  return color < 0.0031308 ? 12.92 * color : 1.055 * Math.pow(color, 1.0 / gamma) - 0.055;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Represents an RGBA colour in the linear colour space, having colour components in the range 0-1. Immutable. */
export class Colour4 implements IInterpolable<Colour4> {
  constructor(readonly r: number, readonly g: number, readonly b: number, readonly a: number) {}

  /** Creates a new Colour4 with the specified RGBA components, in the range 0-255. */
  static fromBytes(r: number, g: number, b: number, a = 255): Colour4 {
    return new Colour4(r / 255, g / 255, b / 255, a / 255);
  }

  // #region Chaining Functions

  /** Returns a new Colour4 with the same RGB components, but multiplying the current alpha component by a scalar value (clamped to 1). */
  multiplyAlpha(scalar: number): Colour4 {
    if (scalar < 0) throw new RangeError('scalar must be non-negative');

    return new Colour4(this.r, this.g, this.b, Math.min(1, this.a * scalar));
  }

  /** Returns a new Colour4 with the same RGB components and a specified alpha value (0-1, clamped). */
  opacity(alpha: number): Colour4 {
    return new Colour4(this.r, this.g, this.b, clamp(alpha, 0, 1));
  }

  /** Returns a new Colour4 with the same RGB components and a specified alpha value in the range 0-255. */
  opacityByte(alpha: number): Colour4 {
    return new Colour4(this.r, this.g, this.b, clamp(alpha / 255, 0, 1));
  }

  /** Returns a new Colour4 with all components clamped to 0-1. */
  clamped(): Colour4 {
    return new Colour4(clamp(this.r, 0, 1), clamp(this.g, 0, 1), clamp(this.b, 0, 1), clamp(this.a, 0, 1));
  }

  /** Returns a lightened version of the colour (RGB multiplied by 1 + amount, clamped). */
  lighten(amount: number): Colour4 {
    const scalar = Math.max(1, 1 + amount);
    return new Colour4(this.r * scalar, this.g * scalar, this.b * scalar, this.a).clamped();
  }

  /** Returns a darkened version of the colour (RGB divided by 1 + amount, clamped). */
  darken(amount: number): Colour4 {
    const scalar = Math.max(1, 1 + amount);
    return new Colour4(this.r / scalar, this.g / scalar, this.b / scalar, this.a).clamped();
  }

  // #endregion

  // #region Operator Overloads

  /** operator *(Colour4, Colour4): component-wise multiplication. */
  multiply(second: Colour4): Colour4 {
    return new Colour4(this.r * second.r, this.g * second.g, this.b * second.b, this.a * second.a);
  }

  /** operator +(Colour4, Colour4): component-wise addition, clamped to 1. */
  add(second: Colour4): Colour4 {
    return new Colour4(Math.min(this.r + second.r, 1), Math.min(this.g + second.g, 1), Math.min(this.b + second.b, 1), Math.min(this.a + second.a, 1));
  }

  /** operator -(Colour4, Colour4): component-wise subtraction, clamped to 0. */
  subtract(second: Colour4): Colour4 {
    return new Colour4(Math.max(this.r - second.r, 0), Math.max(this.g - second.g, 0), Math.max(this.b - second.b, 0), Math.max(this.a - second.a, 0));
  }

  /** operator *(Colour4, float): all components multiplied by a scalar, clamped to 1. */
  multiplyScalar(scalar: number): Colour4 {
    if (scalar < 0) throw new RangeError('scalar must be non-negative');

    return new Colour4(Math.min(this.r * scalar, 1), Math.min(this.g * scalar, 1), Math.min(this.b * scalar, 1), Math.min(this.a * scalar, 1));
  }

  /** operator /(Colour4, float) */
  divideScalar(scalar: number): Colour4 {
    if (scalar <= 0) throw new RangeError('scalar must be positive');

    return this.multiplyScalar(1 / scalar);
  }

  // #endregion

  // #region Conversion

  /** Converts an sRGB colour to linear. */
  toLinear(): Colour4 {
    return new Colour4(toLinear(this.r), toLinear(this.g), toLinear(this.b), this.a);
  }

  /** Converts a linear colour to sRGB. */
  toSRGB(): Colour4 {
    return new Colour4(toSRGB(this.r), toSRGB(this.g), toSRGB(this.b), this.a);
  }

  /** Converts this colour to a 32-bit RGBA integer. */
  toRGBA(): number {
    return ((Math.trunc(Math.min(1, this.r) * 255) << 24) | (Math.trunc(Math.min(1, this.g) * 255) << 16)
      | (Math.trunc(Math.min(1, this.b) * 255) << 8) | Math.trunc(Math.min(1, this.a) * 255)) >>> 0;
  }

  static fromRGBA(rgba: number): Colour4 {
    return Colour4.fromBytes((rgba >>> 24) & 0xff, (rgba >>> 16) & 0xff, (rgba >>> 8) & 0xff, rgba & 0xff);
  }

  /** Converts this colour to a 32-bit ARGB integer. */
  toARGB(): number {
    return ((Math.trunc(Math.min(1, this.a) * 255) << 24) | (Math.trunc(Math.min(1, this.r) * 255) << 16)
      | (Math.trunc(Math.min(1, this.g) * 255) << 8) | Math.trunc(Math.min(1, this.b) * 255)) >>> 0;
  }

  static fromARGB(argb: number): Colour4 {
    return Colour4.fromBytes((argb >>> 16) & 0xff, (argb >>> 8) & 0xff, argb & 0xff, (argb >>> 24) & 0xff);
  }

  /** Converts an RGB or RGBA-formatted hex colour code (#RGB, #RGBA, #RRGGBB, #RRGGBBAA; # optional) into a Colour4. */
  static fromHex(hex: string): Colour4 {
    const colour = Colour4.tryParseHex(hex);
    if (colour === null)
      throw new Error(`${hex} is not a valid colour hex string.`);

    return colour;
  }

  static tryParseHex(hex: string): Colour4 | null {
    const s = hex.startsWith('#') ? hex.slice(1) : hex;
    if (!/^[0-9a-fA-F]*$/.test(s)) return null;

    const p = (i: number, n: number) => parseInt(s.slice(i, i + n), 16);

    switch (s.length) {
      default:
        return null;

      case 3:
        return Colour4.fromBytes(p(0, 1) * 17, p(1, 1) * 17, p(2, 1) * 17, 255);

      case 6:
        return Colour4.fromBytes(p(0, 2), p(2, 2), p(4, 2), 255);

      case 4:
        return Colour4.fromBytes(p(0, 1) * 17, p(1, 1) * 17, p(2, 1) * 17, p(3, 1) * 17);

      case 8:
        return Colour4.fromBytes(p(0, 2), p(2, 2), p(4, 2), p(6, 2));
    }
  }

  /** Converts this colour to a hex code (#RRGGBB, or #RRGGBBAA when alpha is not 255 or alwaysOutputAlpha). */
  toHex(alwaysOutputAlpha = false): string {
    const argb = this.toARGB();
    const a = (argb >>> 24) & 0xff;
    const r = (argb >>> 16) & 0xff;
    const g = (argb >>> 8) & 0xff;
    const b = argb & 0xff;
    const x2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

    if (!alwaysOutputAlpha && a === 255)
      return `#${x2(r)}${x2(g)}${x2(b)}`;

    return `#${x2(r)}${x2(g)}${x2(b)}${x2(a)}`;
  }

  /** Converts HSV (all 0-1) to a Colour4. */
  static fromHSV(hue: number, saturation: number, value: number, alpha = 1): Colour4 {
    const hi = Math.trunc(hue * 6);
    const f = hue * 6 - hi;
    const p = value * (1 - saturation);
    const q = value * (1 - f * saturation);
    const t = value * (1 - (1 - f) * saturation);

    switch (hi) {
      default:
      case 0:
        return new Colour4(value, t, p, alpha);

      case 1:
        return new Colour4(q, value, p, alpha);

      case 2:
        return new Colour4(p, value, t, alpha);

      case 3:
        return new Colour4(p, q, value, alpha);

      case 4:
        return new Colour4(t, p, value, alpha);

      case 5:
        return new Colour4(value, p, q, alpha);
    }
  }

  /** Converts this colour to HSV, returned as [h, s, v, a] (all 0-1). */
  toHSV(): [number, number, number, number] {
    const red = this.r;
    const green = this.g;
    const blue = this.b;

    const max = Math.max(red, Math.max(green, blue));
    const min = Math.min(red, Math.min(green, blue));

    let hue: number;

    if (max === min)
      hue = 0;
    else if (max === red)
      hue = (6 + (green - blue) / (max - min)) % 6;
    else if (max === green)
      hue = (blue - red) / (max - min) + 2;
    else
      hue = (red - green) / (max - min) + 4;

    const saturation = max === 0 ? 0 : (max - min) / max;

    hue = clamp(hue / 6, 0, 1);

    return [hue === 1 ? 0 : hue, saturation, max, this.a];
  }

  /** Converts HSL (all 0-1) to a Colour4. */
  static fromHSL(hue: number, saturation: number, lightness: number, alpha = 1): Colour4 {
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const h = hue * 6;
    const x = c * (1 - Math.abs((h % 2) - 1));

    let r: number, g: number, b: number;

    if (0 <= h && h < 1) {
      r = c;
      g = x;
      b = 0;
    } else if (1 <= h && h < 2) {
      r = x;
      g = c;
      b = 0;
    } else if (2 <= h && h < 3) {
      r = 0;
      g = c;
      b = x;
    } else if (3 <= h && h < 4) {
      r = 0;
      g = x;
      b = c;
    } else if (4 <= h && h < 5) {
      r = x;
      g = 0;
      b = c;
    } else if (5 <= h && h <= 6) {
      r = c;
      g = 0;
      b = x;
    } else
      r = g = b = 0;

    const m = lightness - c * 0.5;

    return new Colour4(r + m, g + m, b + m, alpha);
  }

  /** Converts this colour to HSL, returned as [h, s, l, a] (all 0-1). */
  toHSL(): [number, number, number, number] {
    const red = this.r;
    const green = this.g;
    const blue = this.b;

    const max = Math.max(red, Math.max(green, blue));
    const min = Math.min(red, Math.min(green, blue));

    const lightness = (max + min) / 2;

    if (lightness <= 0)
      return [0, 0, 0, this.a];

    const diff = max - min;
    let saturation = diff;

    if (saturation <= 0)
      return [0, 0, lightness, this.a];

    saturation = lightness <= 0.5 ? saturation / (min + max) : saturation / (2 - max - min);

    let hue = 0;

    if (max === red)
      hue = (green - blue) / diff;
    else if (max === green)
      hue = (blue - red) / diff + 2;
    else if (max === blue)
      hue = (red - green) / diff + 4;

    hue /= 6;

    if (hue < 0)
      hue += 1;

    return [hue, saturation, lightness, this.a];
  }

  // #endregion

  /** CSS rgba() string of this (sRGB) colour. */
  toCss(): string {
    return `rgba(${clamp(this.r, 0, 1) * 255},${clamp(this.g, 0, 1) * 255},${clamp(this.b, 0, 1) * 255},${clamp(this.a, 0, 1)})`;
  }

  equals(other: Colour4): boolean {
    return this.r === other.r && this.g === other.g && this.b === other.b && this.a === other.a;
  }

  /**
   * Interpolates between two sRGB colours in a linear (gamma-correct) RGB space, with eased t clamped to 0-1.
   * Ported from Interpolation.GenericInterpolation.ValueAt(Colour4).
   */
  valueAt(time: number, startColour: Colour4, endColour: Colour4, startTime: number, endTime: number, easing: IEasingFunction): Colour4 {
    if (startColour.equals(endColour))
      return startColour;

    const current = time - startTime;
    const duration = endTime - startTime;

    if (duration === 0 || current === 0)
      return startColour;

    const startLinear = startColour.toLinear();
    const endLinear = endColour.toLinear();

    const t = Math.max(0, Math.min(1, easing.applyEasing(current / duration)));

    return new Colour4(
      startLinear.r + t * (endLinear.r - startLinear.r),
      startLinear.g + t * (endLinear.g - startLinear.g),
      startLinear.b + t * (endLinear.b - startLinear.b),
      startLinear.a + t * (endLinear.a - startLinear.a)).toSRGB();
  }

  toString(): string {
    return `(R, G, B, A) = (${this.r.toFixed(2)}, ${this.g.toFixed(2)}, ${this.b.toFixed(2)}, ${this.a.toFixed(2)})`;
  }

  // #region Constants

  static readonly Transparent = Colour4.fromBytes(255, 255, 255, 0);
  static readonly AliceBlue = Colour4.fromBytes(240, 248, 255, 255);
  static readonly AntiqueWhite = Colour4.fromBytes(250, 235, 215, 255);
  static readonly Aqua = Colour4.fromBytes(0, 255, 255, 255);
  static readonly Aquamarine = Colour4.fromBytes(127, 255, 212, 255);
  static readonly Azure = Colour4.fromBytes(240, 255, 255, 255);
  static readonly Beige = Colour4.fromBytes(245, 245, 220, 255);
  static readonly Bisque = Colour4.fromBytes(255, 228, 196, 255);
  static readonly Black = Colour4.fromBytes(0, 0, 0, 255);
  static readonly BlanchedAlmond = Colour4.fromBytes(255, 235, 205, 255);
  static readonly Blue = Colour4.fromBytes(0, 0, 255, 255);
  static readonly BlueViolet = Colour4.fromBytes(138, 43, 226, 255);
  static readonly Brown = Colour4.fromBytes(165, 42, 42, 255);
  static readonly BurlyWood = Colour4.fromBytes(222, 184, 135, 255);
  static readonly CadetBlue = Colour4.fromBytes(95, 158, 160, 255);
  static readonly Chartreuse = Colour4.fromBytes(127, 255, 0, 255);
  static readonly Chocolate = Colour4.fromBytes(210, 105, 30, 255);
  static readonly Coral = Colour4.fromBytes(255, 127, 80, 255);
  static readonly CornflowerBlue = Colour4.fromBytes(100, 149, 237, 255);
  static readonly Cornsilk = Colour4.fromBytes(255, 248, 220, 255);
  static readonly Crimson = Colour4.fromBytes(220, 20, 60, 255);
  static readonly Cyan = Colour4.fromBytes(0, 255, 255, 255);
  static readonly DarkBlue = Colour4.fromBytes(0, 0, 139, 255);
  static readonly DarkCyan = Colour4.fromBytes(0, 139, 139, 255);
  static readonly DarkGoldenrod = Colour4.fromBytes(184, 134, 11, 255);
  static readonly DarkGray = Colour4.fromBytes(169, 169, 169, 255);
  static readonly DarkGreen = Colour4.fromBytes(0, 100, 0, 255);
  static readonly DarkKhaki = Colour4.fromBytes(189, 183, 107, 255);
  static readonly DarkMagenta = Colour4.fromBytes(139, 0, 139, 255);
  static readonly DarkOliveGreen = Colour4.fromBytes(85, 107, 47, 255);
  static readonly DarkOrange = Colour4.fromBytes(255, 140, 0, 255);
  static readonly DarkOrchid = Colour4.fromBytes(153, 50, 204, 255);
  static readonly DarkRed = Colour4.fromBytes(139, 0, 0, 255);
  static readonly DarkSalmon = Colour4.fromBytes(233, 150, 122, 255);
  static readonly DarkSeaGreen = Colour4.fromBytes(143, 188, 139, 255);
  static readonly DarkSlateBlue = Colour4.fromBytes(72, 61, 139, 255);
  static readonly DarkSlateGray = Colour4.fromBytes(47, 79, 79, 255);
  static readonly DarkTurquoise = Colour4.fromBytes(0, 206, 209, 255);
  static readonly DarkViolet = Colour4.fromBytes(148, 0, 211, 255);
  static readonly DeepPink = Colour4.fromBytes(255, 20, 147, 255);
  static readonly DeepSkyBlue = Colour4.fromBytes(0, 191, 255, 255);
  static readonly DimGray = Colour4.fromBytes(105, 105, 105, 255);
  static readonly DodgerBlue = Colour4.fromBytes(30, 144, 255, 255);
  static readonly Firebrick = Colour4.fromBytes(178, 34, 34, 255);
  static readonly FloralWhite = Colour4.fromBytes(255, 250, 240, 255);
  static readonly ForestGreen = Colour4.fromBytes(34, 139, 34, 255);
  static readonly Fuchsia = Colour4.fromBytes(255, 0, 255, 255);
  static readonly Gainsboro = Colour4.fromBytes(220, 220, 220, 255);
  static readonly GhostWhite = Colour4.fromBytes(248, 248, 255, 255);
  static readonly Gold = Colour4.fromBytes(255, 215, 0, 255);
  static readonly Goldenrod = Colour4.fromBytes(218, 165, 32, 255);
  static readonly Gray = Colour4.fromBytes(128, 128, 128, 255);
  static readonly Green = Colour4.fromBytes(0, 128, 0, 255);
  static readonly GreenYellow = Colour4.fromBytes(173, 255, 47, 255);
  static readonly Honeydew = Colour4.fromBytes(240, 255, 240, 255);
  static readonly HotPink = Colour4.fromBytes(255, 105, 180, 255);
  static readonly IndianRed = Colour4.fromBytes(205, 92, 92, 255);
  static readonly Indigo = Colour4.fromBytes(75, 0, 130, 255);
  static readonly Ivory = Colour4.fromBytes(255, 255, 240, 255);
  static readonly Khaki = Colour4.fromBytes(240, 230, 140, 255);
  static readonly Lavender = Colour4.fromBytes(230, 230, 250, 255);
  static readonly LavenderBlush = Colour4.fromBytes(255, 240, 245, 255);
  static readonly LawnGreen = Colour4.fromBytes(124, 252, 0, 255);
  static readonly LemonChiffon = Colour4.fromBytes(255, 250, 205, 255);
  static readonly LightBlue = Colour4.fromBytes(173, 216, 230, 255);
  static readonly LightCoral = Colour4.fromBytes(240, 128, 128, 255);
  static readonly LightCyan = Colour4.fromBytes(224, 255, 255, 255);
  static readonly LightGoldenrodYellow = Colour4.fromBytes(250, 250, 210, 255);
  static readonly LightGreen = Colour4.fromBytes(144, 238, 144, 255);
  static readonly LightGray = Colour4.fromBytes(211, 211, 211, 255);
  static readonly LightPink = Colour4.fromBytes(255, 182, 193, 255);
  static readonly LightSalmon = Colour4.fromBytes(255, 160, 122, 255);
  static readonly LightSeaGreen = Colour4.fromBytes(32, 178, 170, 255);
  static readonly LightSkyBlue = Colour4.fromBytes(135, 206, 250, 255);
  static readonly LightSlateGray = Colour4.fromBytes(119, 136, 153, 255);
  static readonly LightSteelBlue = Colour4.fromBytes(176, 196, 222, 255);
  static readonly LightYellow = Colour4.fromBytes(255, 255, 224, 255);
  static readonly Lime = Colour4.fromBytes(0, 255, 0, 255);
  static readonly LimeGreen = Colour4.fromBytes(50, 205, 50, 255);
  static readonly Linen = Colour4.fromBytes(250, 240, 230, 255);
  static readonly Magenta = Colour4.fromBytes(255, 0, 255, 255);
  static readonly Maroon = Colour4.fromBytes(128, 0, 0, 255);
  static readonly MediumAquamarine = Colour4.fromBytes(102, 205, 170, 255);
  static readonly MediumBlue = Colour4.fromBytes(0, 0, 205, 255);
  static readonly MediumOrchid = Colour4.fromBytes(186, 85, 211, 255);
  static readonly MediumPurple = Colour4.fromBytes(147, 112, 219, 255);
  static readonly MediumSeaGreen = Colour4.fromBytes(60, 179, 113, 255);
  static readonly MediumSlateBlue = Colour4.fromBytes(123, 104, 238, 255);
  static readonly MediumSpringGreen = Colour4.fromBytes(0, 250, 154, 255);
  static readonly MediumTurquoise = Colour4.fromBytes(72, 209, 204, 255);
  static readonly MediumVioletRed = Colour4.fromBytes(199, 21, 133, 255);
  static readonly MidnightBlue = Colour4.fromBytes(25, 25, 112, 255);
  static readonly MintCream = Colour4.fromBytes(245, 255, 250, 255);
  static readonly MistyRose = Colour4.fromBytes(255, 228, 225, 255);
  static readonly Moccasin = Colour4.fromBytes(255, 228, 181, 255);
  static readonly NavajoWhite = Colour4.fromBytes(255, 222, 173, 255);
  static readonly Navy = Colour4.fromBytes(0, 0, 128, 255);
  static readonly OldLace = Colour4.fromBytes(253, 245, 230, 255);
  static readonly Olive = Colour4.fromBytes(128, 128, 0, 255);
  static readonly OliveDrab = Colour4.fromBytes(107, 142, 35, 255);
  static readonly Orange = Colour4.fromBytes(255, 165, 0, 255);
  static readonly OrangeRed = Colour4.fromBytes(255, 69, 0, 255);
  static readonly Orchid = Colour4.fromBytes(218, 112, 214, 255);
  static readonly PaleGoldenrod = Colour4.fromBytes(238, 232, 170, 255);
  static readonly PaleGreen = Colour4.fromBytes(152, 251, 152, 255);
  static readonly PaleTurquoise = Colour4.fromBytes(175, 238, 238, 255);
  static readonly PaleVioletRed = Colour4.fromBytes(219, 112, 147, 255);
  static readonly PapayaWhip = Colour4.fromBytes(255, 239, 213, 255);
  static readonly PeachPuff = Colour4.fromBytes(255, 218, 185, 255);
  static readonly Peru = Colour4.fromBytes(205, 133, 63, 255);
  static readonly Pink = Colour4.fromBytes(255, 192, 203, 255);
  static readonly Plum = Colour4.fromBytes(221, 160, 221, 255);
  static readonly PowderBlue = Colour4.fromBytes(176, 224, 230, 255);
  static readonly Purple = Colour4.fromBytes(128, 0, 128, 255);
  static readonly Red = Colour4.fromBytes(255, 0, 0, 255);
  static readonly RosyBrown = Colour4.fromBytes(188, 143, 143, 255);
  static readonly RoyalBlue = Colour4.fromBytes(65, 105, 225, 255);
  static readonly SaddleBrown = Colour4.fromBytes(139, 69, 19, 255);
  static readonly Salmon = Colour4.fromBytes(250, 128, 114, 255);
  static readonly SandyBrown = Colour4.fromBytes(244, 164, 96, 255);
  static readonly SeaGreen = Colour4.fromBytes(46, 139, 87, 255);
  static readonly SeaShell = Colour4.fromBytes(255, 245, 238, 255);
  static readonly Sienna = Colour4.fromBytes(160, 82, 45, 255);
  static readonly Silver = Colour4.fromBytes(192, 192, 192, 255);
  static readonly SkyBlue = Colour4.fromBytes(135, 206, 235, 255);
  static readonly SlateBlue = Colour4.fromBytes(106, 90, 205, 255);
  static readonly SlateGray = Colour4.fromBytes(112, 128, 144, 255);
  static readonly Snow = Colour4.fromBytes(255, 250, 250, 255);
  static readonly SpringGreen = Colour4.fromBytes(0, 255, 127, 255);
  static readonly SteelBlue = Colour4.fromBytes(70, 130, 180, 255);
  static readonly Tan = Colour4.fromBytes(210, 180, 140, 255);
  static readonly Teal = Colour4.fromBytes(0, 128, 128, 255);
  static readonly Thistle = Colour4.fromBytes(216, 191, 216, 255);
  static readonly Tomato = Colour4.fromBytes(255, 99, 71, 255);
  static readonly Turquoise = Colour4.fromBytes(64, 224, 208, 255);
  static readonly Violet = Colour4.fromBytes(238, 130, 238, 255);
  static readonly Wheat = Colour4.fromBytes(245, 222, 179, 255);
  static readonly White = Colour4.fromBytes(255, 255, 255, 255);
  static readonly WhiteSmoke = Colour4.fromBytes(245, 245, 245, 255);
  static readonly Yellow = Colour4.fromBytes(255, 255, 0, 255);
  static readonly YellowGreen = Colour4.fromBytes(154, 205, 50, 255);

  // #endregion
}
