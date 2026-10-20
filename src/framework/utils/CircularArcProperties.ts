// Ported from osu.Framework/Utils/CircularArcProperties.cs (float32-exact via Vector2F).

import { Vector2F } from '../layout/Vector2F';
import { Precision } from '../layout/Primitives';

const f = Math.fround;

export class CircularArcProperties {
  readonly isValid: boolean;

  /** Starting angle of the circle. */
  readonly thetaStart: number;

  /** The angle the circle spans. */
  readonly thetaRange: number;

  /** Whether the circle goes clockwise (1) or counter-clockwise (-1). */
  readonly direction: number;

  /** The radius of the circle (float). */
  readonly radius: number;

  /** The centre position of the circle. */
  readonly centre: Vector2F;

  get thetaEnd(): number {
    return this.thetaStart + this.thetaRange * this.direction;
  }

  /** Computes various properties that can be used to approximate the circular arc through the 3 given control points. */
  constructor(controlPoints: readonly Vector2F[]) {
    const a = controlPoints[0];
    const b = controlPoints[1];
    const c = controlPoints[2];

    // If we have a degenerate triangle where a side-length is almost zero, then give up and fallback to a more numerically stable method.
    if (Precision.almostEquals(0, f(f(f(b.y - a.y) * f(c.x - a.x)) - f(f(b.x - a.x) * f(c.y - a.y))))) {
      this.isValid = false;
      this.thetaStart = 0;
      this.thetaRange = 0;
      this.direction = 0;
      this.radius = 0;
      this.centre = Vector2F.Zero;
      return;
    }

    // See: https://en.wikipedia.org/wiki/Circumscribed_circle#Cartesian_coordinates_2
    const d = f(2 * f(f(f(a.x * b.sub(c).y) + f(b.x * c.sub(a).y)) + f(c.x * a.sub(b).y)));
    const aSq = a.lengthSquared;
    const bSq = b.lengthSquared;
    const cSq = c.lengthSquared;

    this.centre = new Vector2F(
      f(f(f(aSq * b.sub(c).y) + f(bSq * c.sub(a).y)) + f(cSq * a.sub(b).y)),
      f(f(f(aSq * c.sub(b).x) + f(bSq * a.sub(c).x)) + f(cSq * b.sub(a).x))).div(d);

    const dA = a.sub(this.centre);
    const dC = c.sub(this.centre);

    this.radius = dA.length;

    this.thetaStart = Math.atan2(dA.y, dA.x);
    let thetaEnd = Math.atan2(dC.y, dC.x);

    while (thetaEnd < this.thetaStart)
      thetaEnd += 2 * Math.PI;

    let direction = 1;
    let thetaRange = thetaEnd - this.thetaStart;

    // Decide in which direction to draw the circle, depending on which side of
    // AC B lies.
    let orthoAtoC = c.sub(a);
    orthoAtoC = new Vector2F(orthoAtoC.y, -orthoAtoC.x);

    if (Vector2F.dot(orthoAtoC, b.sub(a)) < 0) {
      direction = -direction;
      thetaRange = 2 * Math.PI - thetaRange;
    }

    this.direction = direction;
    this.thetaRange = thetaRange;
    this.isValid = true;
  }
}
