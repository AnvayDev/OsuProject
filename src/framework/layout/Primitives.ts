// Ported from osu.Framework/Graphics/Primitives/RectangleF.cs and Quad.cs (the subset the framework uses),
// and osu.Framework/Utils/Precision.cs.

import type { Matrix3 } from './Matrix3';
import type { MarginPadding } from './MarginPadding';
import { Vector2 } from './Vector2';

/** C# float.MaxValue. */
export const FLOAT_MAX = 3.4028234663852886e38;

export const Precision = {
  FLOAT_EPSILON: 1e-3,
  DOUBLE_EPSILON: 1e-7,

  definitelyBigger: (value1: number, value2: number, acceptableDifference = 1e-3) => value1 - acceptableDifference > value2,
  almostBigger: (value1: number, value2: number, acceptableDifference = 1e-3) => value1 > value2 - acceptableDifference,
  almostEquals: (value1: number, value2: number, acceptableDifference = 1e-3) => Math.abs(value1 - value2) <= acceptableDifference,
  almostEqualsVector: (value1: Vector2, value2: Vector2, acceptableDifference = 1e-3) =>
    Math.abs(value1.x - value2.x) <= acceptableDifference && Math.abs(value1.y - value2.y) <= acceptableDifference,

  /** Precision.AlmostIntersects(RectangleF, RectangleF, float) */
  almostIntersects: (rect1: RectangleF, rect2: RectangleF, acceptableDifference = 1e-3) =>
    rect1.x <= rect2.x + rect2.width + acceptableDifference && rect2.x <= rect1.x + rect1.width + acceptableDifference
    && rect1.y <= rect2.y + rect2.height + acceptableDifference && rect2.y <= rect1.y + rect1.height + acceptableDifference,
};

export class RectangleF {
  constructor(readonly x: number, readonly y: number, readonly width: number, readonly height: number) {}

  static readonly Empty = new RectangleF(0, 0, 0, 0);

  get left(): number { return this.x; }
  get top(): number { return this.y; }
  get right(): number { return this.x + this.width; }
  get bottom(): number { return this.y + this.height; }

  get topLeft(): Vector2 { return new Vector2(this.left, this.top); }
  get topRight(): Vector2 { return new Vector2(this.right, this.top); }
  get bottomLeft(): Vector2 { return new Vector2(this.left, this.bottom); }
  get bottomRight(): Vector2 { return new Vector2(this.right, this.bottom); }
  get centre(): Vector2 { return new Vector2(this.x + this.width / 2, this.y + this.height / 2); }
  get size(): Vector2 { return new Vector2(this.width, this.height); }

  get isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  contains(pt: Vector2): boolean {
    return this.x <= pt.x && pt.x < this.x + this.width && this.y <= pt.y && pt.y < this.y + this.height;
  }

  inflate(amount: number | Vector2 | MarginPadding): RectangleF {
    if (typeof amount === 'number') amount = new Vector2(amount, amount);

    if (amount instanceof Vector2)
      return new RectangleF(this.x - amount.x, this.y - amount.y, this.width + amount.x * 2, this.height + amount.y * 2);

    return new RectangleF(this.x - amount.left, this.y - amount.top, this.width + amount.totalHorizontal, this.height + amount.totalVertical);
  }

  shrink(amount: number | Vector2 | MarginPadding): RectangleF {
    if (typeof amount === 'number') amount = new Vector2(amount, amount);

    return this.inflate(amount.neg());
  }

  static intersect(a: RectangleF, b: RectangleF): RectangleF {
    const x = Math.max(a.x, b.x);
    const num2 = Math.min(a.x + a.width, b.x + b.width);
    const y = Math.max(a.y, b.y);
    const num4 = Math.min(a.y + a.height, b.y + b.height);

    if (num2 >= x && num4 >= y)
      return new RectangleF(x, y, num2 - x, num4 - y);

    return RectangleF.Empty;
  }

  /** Instance Intersect (C# mutates; returns the result here). */
  intersect(rect: RectangleF): RectangleF {
    return RectangleF.intersect(rect, this);
  }

  static union(a: RectangleF, b: RectangleF): RectangleF {
    const x = Math.min(a.x, b.x);
    const num2 = Math.max(a.x + a.width, b.x + b.width);
    const y = Math.min(a.y, b.y);
    const num4 = Math.max(a.y + a.height, b.y + b.height);
    return new RectangleF(x, y, num2 - x, num4 - y);
  }

  /** @internal */
  distanceExponentiated(localSpacePos: Vector2, exponent: number): number {
    const distX = Math.max(0, Math.max(localSpacePos.x - this.right, this.left - localSpacePos.x));
    const distY = Math.max(0, Math.max(localSpacePos.y - this.bottom, this.top - localSpacePos.y));

    return Math.pow(distX, exponent) + Math.pow(distY, exponent);
  }

  equals(o: RectangleF): boolean {
    return this.x === o.x && this.y === o.y && this.width === o.width && this.height === o.height;
  }
}

const perpDot = (a: Vector2, b: Vector2) => a.x * b.y - a.y * b.x;

export class Quad {
  constructor(readonly topLeft: Vector2, readonly topRight: Vector2, readonly bottomLeft: Vector2, readonly bottomRight: Vector2) {}

  static fromRectangle(rectangle: RectangleF): Quad {
    return new Quad(new Vector2(rectangle.left, rectangle.top),
      new Vector2(rectangle.right, rectangle.top),
      new Vector2(rectangle.left, rectangle.bottom),
      new Vector2(rectangle.right, rectangle.bottom));
  }

  /** operator *(Quad, Matrix3) */
  mul(m: Matrix3): Quad {
    return new Quad(m.transform(this.topLeft), m.transform(this.topRight), m.transform(this.bottomLeft), m.transform(this.bottomRight));
  }

  get width(): number {
    return Vector2.distance(this.topLeft, this.topRight);
  }

  get height(): number {
    return Vector2.distance(this.topLeft, this.bottomLeft);
  }

  get aabbFloat(): RectangleF {
    const xMin = Math.min(this.topLeft.x, this.topRight.x, this.bottomLeft.x, this.bottomRight.x);
    const yMin = Math.min(this.topLeft.y, this.topRight.y, this.bottomLeft.y, this.bottomRight.y);
    const xMax = Math.max(this.topLeft.x, this.topRight.x, this.bottomLeft.x, this.bottomRight.x);
    const yMax = Math.max(this.topLeft.y, this.topRight.y, this.bottomLeft.y, this.bottomRight.y);

    return new RectangleF(xMin, yMin, xMax - xMin, yMax - yMin);
  }

  contains(pos: Vector2): boolean {
    if (this.width === 0 && this.height === 0)
      return pos.equals(this.topLeft);

    const perpDot1 = perpDot(this.bottomLeft.sub(this.topLeft), pos.sub(this.topLeft));
    if (Number.isNaN(perpDot1))
      return false;

    const perpDot2 = perpDot(this.bottomRight.sub(this.bottomLeft), pos.sub(this.bottomLeft));
    if (Number.isNaN(perpDot2) || perpDot1 * perpDot2 < 0)
      return false;

    const perpDot3 = perpDot(this.topRight.sub(this.bottomRight), pos.sub(this.bottomRight));
    if (Number.isNaN(perpDot3) || perpDot1 * perpDot3 < 0 || perpDot2 * perpDot3 < 0)
      return false;

    const perpDot4 = perpDot(this.topLeft.sub(this.topRight), pos.sub(this.topRight));
    if (Number.isNaN(perpDot4) || perpDot1 * perpDot4 < 0 || perpDot2 * perpDot4 < 0 || perpDot3 * perpDot4 < 0)
      return false;

    return true;
  }
}
