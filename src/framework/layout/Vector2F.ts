// osuTK's Vector2 (ppy/osuTK src/osuTK/Math/Vector2.cs) with exact IEEE single-precision semantics: every component operation is rounded
// with Math.fround, which reproduces C# float arithmetic bit-for-bit (double rounding is innocuous for + − × ÷ and sqrt).
// Used where osu! results depend on float32 maths (slider paths, ruleset geometry, difficulty calculation). Layout uses the double Vector2.

const f = Math.fround;

export class Vector2F {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y = x) {
    this.x = f(x);
    this.y = f(y);
  }

  static readonly Zero = new Vector2F(0, 0);
  static readonly One = new Vector2F(1, 1);

  add(v: Vector2F): Vector2F {
    return new Vector2F(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2F): Vector2F {
    return new Vector2F(this.x - v.x, this.y - v.y);
  }

  /** vec * float (the scalar is a float: it is rounded first), or component-wise vec * vec. */
  mul(v: Vector2F | number): Vector2F {
    if (typeof v === 'number') {
      const s = f(v);
      return new Vector2F(this.x * s, this.y * s);
    }

    return new Vector2F(this.x * v.x, this.y * v.y);
  }

  /** vec / float (true division, as osuTK's operator /). */
  div(scale: number): Vector2F {
    const s = f(scale);
    return new Vector2F(this.x / s, this.y / s);
  }

  neg(): Vector2F {
    return new Vector2F(-this.x, -this.y);
  }

  /** (float)Math.Sqrt(X * X + Y * Y) */
  get length(): number {
    return f(Math.sqrt(this.lengthSquared));
  }

  /** X * X + Y * Y */
  get lengthSquared(): number {
    return f(f(this.x * this.x) + f(this.y * this.y));
  }

  normalized(): Vector2F {
    const scale = f(1 / this.length);
    return new Vector2F(this.x * scale, this.y * scale);
  }

  equals(v: Vector2F): boolean {
    return this.x === v.x && this.y === v.y;
  }

  static distance(a: Vector2F, b: Vector2F): number {
    return f(Math.sqrt(Vector2F.distanceSquared(a, b)));
  }

  static distanceSquared(a: Vector2F, b: Vector2F): number {
    const dx = f(b.x - a.x);
    const dy = f(b.y - a.y);
    return f(f(dx * dx) + f(dy * dy));
  }

  static dot(a: Vector2F, b: Vector2F): number {
    return f(f(a.x * b.x) + f(a.y * b.y));
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}
