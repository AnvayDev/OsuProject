// Ported from osu.Framework/Graphics/MarginPadding.cs
// Immutable value type. C#'s object-initializer form `new MarginPadding { Top = 5, Horizontal = 10 }` becomes
// `MarginPadding.of({ top: 5, horizontal: 10 })`.

import type { IEasingFunction } from '../transforms/Easing';
import { valueAtNumber, type IInterpolable } from '../transforms/Interpolation';
import { Vector2 } from './Vector2';

export interface MarginPaddingInit {
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  /** Sets left and right. */
  horizontal?: number;
  /** Sets top and bottom. */
  vertical?: number;
}

export class MarginPadding implements IInterpolable<MarginPadding> {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;

  /** `new MarginPadding(allSides)` as in C#. The extra parameters are only used internally to build all four sides. */
  constructor(allSides = 0, left = allSides, bottom = allSides, right = allSides) {
    this.top = allSides;
    this.left = left;
    this.bottom = bottom;
    this.right = right;
  }

  static readonly Zero = new MarginPadding();

  /** Object-initializer form. horizontal/vertical are applied first, then explicit sides override them. */
  static of(init: MarginPaddingInit): MarginPadding {
    return MarginPadding.Zero.with(init);
  }

  /** Returns a copy with the given fields replaced (C# "copy, mutate field, assign back"). */
  with(init: MarginPaddingInit): MarginPadding {
    const e = expand(init);
    return new MarginPadding(e.top ?? this.top, e.left ?? this.left, e.bottom ?? this.bottom, e.right ?? this.right);
  }

  get totalHorizontal(): number {
    return this.left + this.right;
  }

  get totalVertical(): number {
    return this.top + this.bottom;
  }

  get total(): Vector2 {
    return new Vector2(this.totalHorizontal, this.totalVertical);
  }

  equals(other: MarginPadding): boolean {
    return this.top === other.top && this.left === other.left && this.bottom === other.bottom && this.right === other.right;
  }

  toString(): string {
    return `(${this.top}, ${this.left}, ${this.bottom}, ${this.right})`;
  }

  /** operator -(MarginPadding) */
  neg(): MarginPadding {
    return new MarginPadding(-this.top, -this.left, -this.bottom, -this.right);
  }

  /** operator *(MarginPadding, Vector2) */
  mul(v: Vector2): MarginPadding {
    return new MarginPadding(this.top * v.y, this.left * v.x, this.bottom * v.y, this.right * v.x);
  }

  valueAt(time: number, startValue: MarginPadding, endValue: MarginPadding, startTime: number, endTime: number, easing: IEasingFunction): MarginPadding {
    return new MarginPadding(
      valueAtNumber(time, startValue.top, endValue.top, startTime, endTime, easing),
      valueAtNumber(time, startValue.left, endValue.left, startTime, endTime, easing),
      valueAtNumber(time, startValue.bottom, endValue.bottom, startTime, endTime, easing),
      valueAtNumber(time, startValue.right, endValue.right, startTime, endTime, easing));
  }
}

function expand(init: MarginPaddingInit): MarginPaddingInit {
  const out: MarginPaddingInit = {};
  if (init.horizontal !== undefined) out.left = out.right = init.horizontal;
  if (init.vertical !== undefined) out.top = out.bottom = init.vertical;
  if (init.top !== undefined) out.top = init.top;
  if (init.left !== undefined) out.left = init.left;
  if (init.bottom !== undefined) out.bottom = init.bottom;
  if (init.right !== undefined) out.right = init.right;
  return out;
}
