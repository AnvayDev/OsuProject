// Port of the osuTK Vector2 subset used by osu!framework and osu!, plus Interpolation.ValueAt(Vector2).
// Immutable value type (C# struct semantics).

import type { IEasingFunction } from '../transforms/Easing';
import type { IInterpolable } from '../transforms/Interpolation';

export class Vector2 implements IInterpolable<Vector2> {
  constructor(readonly x: number, readonly y = x) {}

  static readonly Zero = new Vector2(0, 0);
  static readonly One = new Vector2(1, 1);
  static readonly UnitX = new Vector2(1, 0);
  static readonly UnitY = new Vector2(0, 1);

  /** osuTK's `this[int index]` (0 = X, 1 = Y). */
  get(index: number): number {
    return index === 0 ? this.x : this.y;
  }

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  /** Component-wise multiplication (Vector2 * Vector2) or scaling (Vector2 * float). */
  mul(v: Vector2 | number): Vector2 {
    return typeof v === 'number' ? new Vector2(this.x * v, this.y * v) : new Vector2(this.x * v.x, this.y * v.y);
  }

  /** Component-wise division (Vector2.Divide) or division by a scalar. */
  div(v: Vector2 | number): Vector2 {
    return typeof v === 'number' ? new Vector2(this.x / v, this.y / v) : new Vector2(this.x / v.x, this.y / v.y);
  }

  neg(): Vector2 {
    return new Vector2(-this.x, -this.y);
  }

  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  get lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalized(): Vector2 {
    const l = this.length;
    return new Vector2(this.x / l, this.y / l);
  }

  static dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
  }

  static distance(a: Vector2, b: Vector2): number {
    return a.sub(b).length;
  }

  static componentMin(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }

  static componentMax(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }

  equals(other: Vector2): boolean {
    return this.x === other.x && this.y === other.y;
  }

  /** Ported from Interpolation.GenericInterpolation.ValueAt(Vector2). */
  valueAt(time: number, val1: Vector2, val2: Vector2, startTime: number, endTime: number, easing: IEasingFunction): Vector2 {
    const current = time - startTime;
    const duration = endTime - startTime;

    if (duration === 0 || current === 0)
      return val1;

    const t = easing.applyEasing(current / duration);
    return new Vector2(val1.x + t * (val2.x - val1.x), val1.y + t * (val2.y - val1.y));
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}
