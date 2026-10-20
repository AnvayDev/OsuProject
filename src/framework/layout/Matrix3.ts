// Port of osuTK Matrix3 (row-vector convention: p' = p * M, translation in row 2)
// plus osu.Framework/Extensions/MatrixExtensions/MatrixExtensions.cs and Vector2Extensions.Transform.
// Mutable for performance; DrawInfo copies before mutating.

import { Vector2 } from './Vector2';

export class Matrix3 {
  constructor(
    public m11 = 1, public m12 = 0, public m13 = 0,
    public m21 = 0, public m22 = 1, public m23 = 0,
    public m31 = 0, public m32 = 0, public m33 = 1,
  ) {}

  static identity(): Matrix3 {
    return new Matrix3();
  }

  clone(): Matrix3 {
    return new Matrix3(this.m11, this.m12, this.m13, this.m21, this.m22, this.m23, this.m31, this.m32, this.m33);
  }

  /** Matrix3 * Matrix3 (row-vector convention: apply this first, then other). */
  multiply(o: Matrix3): Matrix3 {
    return new Matrix3(
      this.m11 * o.m11 + this.m12 * o.m21 + this.m13 * o.m31,
      this.m11 * o.m12 + this.m12 * o.m22 + this.m13 * o.m32,
      this.m11 * o.m13 + this.m12 * o.m23 + this.m13 * o.m33,
      this.m21 * o.m11 + this.m22 * o.m21 + this.m23 * o.m31,
      this.m21 * o.m12 + this.m22 * o.m22 + this.m23 * o.m32,
      this.m21 * o.m13 + this.m22 * o.m23 + this.m23 * o.m33,
      this.m31 * o.m11 + this.m32 * o.m21 + this.m33 * o.m31,
      this.m31 * o.m12 + this.m32 * o.m22 + this.m33 * o.m32,
      this.m31 * o.m13 + this.m32 * o.m23 + this.m33 * o.m33);
  }

  equals(o: Matrix3): boolean {
    return this.m11 === o.m11 && this.m12 === o.m12 && this.m13 === o.m13
      && this.m21 === o.m21 && this.m22 === o.m22 && this.m23 === o.m23
      && this.m31 === o.m31 && this.m32 === o.m32 && this.m33 === o.m33;
  }

  /** Vector2Extensions.Transform(pos, mat) */
  transform(pos: Vector2): Vector2 {
    return new Vector2(pos.x * this.m11 + pos.y * this.m21 + this.m31, pos.x * this.m12 + pos.y * this.m22 + this.m32);
  }

  // ---- MatrixExtensions ----

  translateFromLeft(v: Vector2): void {
    // m.Row2 += m.Row0 * v.X + m.Row1 * v.Y;
    this.m31 += this.m11 * v.x + this.m21 * v.y;
    this.m32 += this.m12 * v.x + this.m22 * v.y;
    this.m33 += this.m13 * v.x + this.m23 * v.y;
  }

  translateFromRight(v: Vector2): void {
    //m.Column0 += m.Column2 * v.X;
    this.m11 += this.m13 * v.x;
    this.m21 += this.m23 * v.x;
    this.m31 += this.m33 * v.x;

    //m.Column1 += m.Column2 * v.Y;
    this.m12 += this.m13 * v.y;
    this.m22 += this.m23 * v.y;
    this.m32 += this.m33 * v.y;
  }

  rotateFromLeft(radians: number): void {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Vector3 row0 = m.Row0 * cos + m.Row1 * sin;
    const r0x = this.m11 * cos + this.m21 * sin;
    const r0y = this.m12 * cos + this.m22 * sin;
    const r0z = this.m13 * cos + this.m23 * sin;

    // m.Row1 = m.Row1 * cos - m.Row0 * sin;
    this.m21 = this.m21 * cos - this.m11 * sin;
    this.m22 = this.m22 * cos - this.m12 * sin;
    this.m23 = this.m23 * cos - this.m13 * sin;

    this.m11 = r0x;
    this.m12 = r0y;
    this.m13 = r0z;
  }

  rotateFromRight(radians: number): void {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    //Vector3 column0 = m.Column0 * cos + m.Column1 * sin;
    const m11 = this.m11 * cos - this.m12 * sin;
    const m21 = this.m21 * cos - this.m22 * sin;
    const m31 = this.m31 * cos - this.m32 * sin;

    //m.Column1 = m.Column1 * cos - m.Column0 * sin;
    this.m12 = this.m12 * cos + this.m11 * sin;
    this.m22 = this.m22 * cos + this.m21 * sin;
    this.m32 = this.m32 * cos + this.m31 * sin;

    //m.Column0 = row0;
    this.m11 = m11;
    this.m21 = m21;
    this.m31 = m31;
  }

  scaleFromLeft(v: Vector2): void {
    this.m11 *= v.x;
    this.m12 *= v.x;
    this.m13 *= v.x;
    this.m21 *= v.y;
    this.m22 *= v.y;
    this.m23 *= v.y;
  }

  scaleFromRight(v: Vector2): void {
    //m.Column0 *= v.X;
    this.m11 *= v.x;
    this.m21 *= v.x;
    this.m31 *= v.x;

    //m.Column1 *= v.Y;
    this.m12 *= v.y;
    this.m22 *= v.y;
    this.m32 *= v.y;
  }

  shearFromLeft(v: Vector2): void {
    // Vector3 row0 = m.Row0 + m.Row1 * v.Y + m.Row0 * v.X * v.Y;
    const xy = v.x * v.y;
    const r0x = this.m11 + this.m21 * v.y + this.m11 * xy;
    const r0y = this.m12 + this.m22 * v.y + this.m12 * xy;
    const r0z = this.m13 + this.m23 * v.y + this.m13 * xy;

    // m.Row1 += m.Row0 * v.X;
    this.m21 += this.m11 * v.x;
    this.m22 += this.m12 * v.x;
    this.m23 += this.m13 * v.x;

    this.m11 = r0x;
    this.m12 = r0y;
    this.m13 = r0z;
  }

  shearFromRight(v: Vector2): void {
    const xy = v.x * v.y;

    //m.Column0 += m.Column1 * v.X;
    const m11 = this.m11 + this.m12 * v.x;
    const m21 = this.m21 + this.m22 * v.x;
    const m31 = this.m31 + this.m32 * v.x;

    //m.Column1 += m.Column0 * v.Y + m.Column1 * xy;
    this.m12 += this.m11 * v.y + this.m12 * xy;
    this.m22 += this.m21 * v.y + this.m22 * xy;
    this.m32 += this.m31 * v.y + this.m32 * xy;

    this.m11 = m11;
    this.m21 = m21;
    this.m31 = m31;
  }

  /** CSS matrix() of the 2D affine part. CSS maps (x, y) to (a x + c y + e, b x + d y + f). */
  toCss(): string {
    return `matrix(${this.m11},${this.m12},${this.m21},${this.m22},${this.m31},${this.m32})`;
  }
}
