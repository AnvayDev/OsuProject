// Ported from osu.Framework/Graphics/Colour/ColourInfo.cs and osu.Framework/Graphics/Colour/SRGBColour.cs
// SRGBColour is represented by Colour4 holding sRGB components; its operators are the srgb* functions below.
// ColourInfo is immutable here (C# mutates the struct in place; callers there always work on copies).

import type { IEasingFunction } from '../transforms/Easing';
import type { IInterpolable } from '../transforms/Interpolation';
import { Colour4 } from './Colour4';

const isWhite = (colour: Colour4) => colour.r === 1 && colour.g === 1 && colour.b === 1;

/** SRGBColour operator *(SRGBColour, SRGBColour): multiplication in linear space, with a fast path for white. */
export function srgbMultiply(first: Colour4, second: Colour4): Colour4 {
  if (isWhite(first)) {
    if (first.a === 1)
      return second;

    return new Colour4(second.r, second.g, second.b, first.a * second.a);
  }

  if (isWhite(second)) {
    if (second.a === 1)
      return first;

    return new Colour4(first.r, first.g, first.b, first.a * second.a);
  }

  const firstLinear = first.toLinear();
  const secondLinear = second.toLinear();

  return new Colour4(
    firstLinear.r * secondLinear.r,
    firstLinear.g * secondLinear.g,
    firstLinear.b * secondLinear.b,
    firstLinear.a * secondLinear.a).toSRGB();
}

/** SRGBColour operator *(SRGBColour, float) */
export function srgbMultiplyScalar(first: Colour4, second: number): Colour4 {
  if (second === 1)
    return first;

  const firstLinear = first.toLinear();

  return new Colour4(
    firstLinear.r * second,
    firstLinear.g * second,
    firstLinear.b * second,
    firstLinear.a * second).toSRGB();
}

/** SRGBColour operator +(SRGBColour, SRGBColour) */
export function srgbAdd(first: Colour4, second: Colour4): Colour4 {
  const firstLinear = first.toLinear();
  const secondLinear = second.toLinear();

  return new Colour4(
    firstLinear.r + secondLinear.r,
    firstLinear.g + secondLinear.g,
    firstLinear.b + secondLinear.b,
    firstLinear.a + secondLinear.a).toSRGB();
}

const srgbMultiplyAlpha = (c: Colour4, alpha: number) => new Colour4(c.r, c.g, c.b, c.a * alpha);

/** Bilinear interpolation of raw (sRGB) components, as in ColourInfo.Interpolate(Vector2). */
function interpolateVector(c: ColourInfo, x: number, y: number): Colour4 {
  // Difference-form lerps preserve constant channels exactly. Weighted sums can turn white into
  // 0.9999999999999999 and make the DOM renderer select a different tint/mask path while scrolling.
  const mix = (tl: number, tr: number, bl: number, br: number) => {
    const top = tl + x * (tr - tl);
    const bottom = bl + x * (br - bl);
    return top + y * (bottom - top);
  };
  const { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br } = c;

  return new Colour4(mix(tl.r, tr.r, bl.r, br.r), mix(tl.g, tr.g, bl.g, br.g), mix(tl.b, tr.b, bl.b, br.b), mix(tl.a, tr.a, bl.a, br.a));
}

/** Contains the (sRGB) colours of all 4 vertices of a quad. Products and interpolation happen in linear space. */
export class ColourInfo implements IInterpolable<ColourInfo> {
  private constructor(
    readonly topLeft: Colour4,
    readonly bottomLeft: Colour4,
    readonly topRight: Colour4,
    readonly bottomRight: Colour4,
    readonly hasSingleColour: boolean,
  ) {}

  /** Creates a ColourInfo with a single colour assigned to all vertices. */
  static singleColour(colour: Colour4): ColourInfo {
    return new ColourInfo(colour, colour, colour, colour, true);
  }

  /** Creates a ColourInfo with a horizontal gradient (c1 left, c2 right). */
  static gradientHorizontal(c1: Colour4, c2: Colour4): ColourInfo {
    return new ColourInfo(c1, c1, c2, c2, false);
  }

  /** Creates a ColourInfo with a vertical gradient (c1 top, c2 bottom). */
  static gradientVertical(c1: Colour4, c2: Colour4): ColourInfo {
    return new ColourInfo(c1, c2, c1, c2, false);
  }

  /** Arbitrary four-corner colours (object-initializer form in C#). */
  static fromCorners(topLeft: Colour4, topRight: Colour4, bottomLeft: Colour4, bottomRight: Colour4): ColourInfo {
    return new ColourInfo(topLeft, bottomLeft, topRight, bottomRight, false);
  }

  /** Implicit conversion: Colour4 → ColourInfo. */
  static from(colour: Colour4 | ColourInfo): ColourInfo {
    return colour instanceof ColourInfo ? colour : ColourInfo.singleColour(colour);
  }

  /** Implicit conversion ColourInfo → SRGBColour; throws for gradients. */
  get single(): Colour4 {
    if (!this.hasSingleColour)
      throw new Error('Attempted to read single colour from multi-colour ColourInfo.');

    return this.topLeft;
  }

  tryExtractSingleColour(): Colour4 | null {
    return this.hasSingleColour ? this.topLeft : null;
  }

  /** Interpolates this ColourInfo at a relative (0-1) position inside the quad. */
  interpolate(x: number, y: number): Colour4 {
    return interpolateVector(this, x, y);
  }

  /** Applies a child's colour onto this (parent) colour, returning the result (C# mutates in place). */
  applyChild(childColour: ColourInfo, interp?: { topLeft: [number, number]; topRight: [number, number]; bottomLeft: [number, number]; bottomRight: [number, number] }): ColourInfo {
    if (interp !== undefined || !this.hasSingleColour) {
      // ApplyChild(ColourInfo childColour, Quad interp); the Quad defaults to (0, 0, 1, 1).
      const q = interp ?? { topLeft: [0, 0], topRight: [1, 0], bottomLeft: [0, 1], bottomRight: [1, 1] };

      return new ColourInfo(
        srgbMultiply(this.interpolate(...q.topLeft), childColour.topLeft),
        srgbMultiply(this.interpolate(...q.bottomLeft), childColour.bottomLeft),
        srgbMultiply(this.interpolate(...q.topRight), childColour.topRight),
        srgbMultiply(this.interpolate(...q.bottomRight), childColour.bottomRight),
        false);
    }

    if (childColour.hasSingleColour)
      return ColourInfo.singleColour(srgbMultiply(this.topLeft, childColour.topLeft));

    return new ColourInfo(
      srgbMultiply(childColour.topLeft, this.topLeft),
      srgbMultiply(childColour.bottomLeft, this.topLeft),
      srgbMultiply(childColour.topRight, this.topLeft),
      srgbMultiply(childColour.bottomRight, this.topLeft),
      false);
  }

  /** @internal */
  static multiply(first: ColourInfo, second: ColourInfo): ColourInfo {
    return new ColourInfo(
      srgbMultiply(first.topLeft, second.topLeft),
      srgbMultiply(first.bottomLeft, second.bottomLeft),
      srgbMultiply(first.topRight, second.topRight),
      srgbMultiply(first.bottomRight, second.bottomRight),
      false);
  }

  /** Created a new ColourInfo with the alpha value of each vertex multiplied by alpha. */
  multiplyAlpha(alpha: number): ColourInfo {
    if (alpha === 1.0)
      return this;

    if (this.hasSingleColour)
      return ColourInfo.singleColour(srgbMultiplyAlpha(this.topLeft, alpha));

    return new ColourInfo(
      srgbMultiplyAlpha(this.topLeft, alpha),
      srgbMultiplyAlpha(this.bottomLeft, alpha),
      srgbMultiplyAlpha(this.topRight, alpha),
      srgbMultiplyAlpha(this.bottomRight, alpha),
      false);
  }

  equals(other: ColourInfo | Colour4): boolean {
    if (other instanceof Colour4)
      return this.hasSingleColour && this.topLeft.equals(other);

    if (!this.hasSingleColour) {
      if (other.hasSingleColour)
        return false;

      return this.topLeft.equals(other.topLeft)
        && this.topRight.equals(other.topRight)
        && this.bottomLeft.equals(other.bottomLeft)
        && this.bottomRight.equals(other.bottomRight);
    }

    return other.hasSingleColour && this.topLeft.equals(other.topLeft);
  }

  /** The average colour of all corners. */
  get averageColour(): Colour4 {
    if (this.hasSingleColour)
      return this.topLeft;

    return interpolateVector(this, 0.5, 0.5);
  }

  /** The maximum alpha value of all four corners. */
  get maxAlpha(): number {
    return Math.max(this.topLeft.a, this.topRight.a, this.bottomLeft.a, this.bottomRight.a);
  }

  /** The minimum alpha value of all four corners. */
  get minAlpha(): number {
    return Math.min(this.topLeft.a, this.topRight.a, this.bottomLeft.a, this.bottomRight.a);
  }

  /** Ported from Interpolation.GenericInterpolation.ValueAt(ColourInfo). */
  valueAt(time: number, startColour: ColourInfo, endColour: ColourInfo, startTime: number, endTime: number, easing: IEasingFunction): ColourInfo {
    const lerp = (a: Colour4, b: Colour4) => a.valueAt(time, a, b, startTime, endTime, easing);

    if (startColour.hasSingleColour && endColour.hasSingleColour)
      return ColourInfo.singleColour(lerp(startColour.topLeft, endColour.topLeft));

    return new ColourInfo(
      lerp(startColour.topLeft, endColour.topLeft),
      lerp(startColour.bottomLeft, endColour.bottomLeft),
      lerp(startColour.topRight, endColour.topRight),
      lerp(startColour.bottomRight, endColour.bottomRight),
      false);
  }

  toString(): string {
    return this.hasSingleColour ? `${this.topLeft} (Single)` : `${this.topLeft}, ${this.topRight}, ${this.bottomLeft}, ${this.bottomRight}`;
  }
}
