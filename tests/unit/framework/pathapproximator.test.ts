// Ported from osu.Framework.Tests/MathUtils/TestPathApproximator.cs (Lagrange is not ported: osu!'s slider paths don't use it).

import { describe, expect, it } from 'vitest';
import { Vector2F } from '@fw/layout/Vector2F';
import { PathApproximator } from '@fw/utils/PathApproximator';

const v = (x: number, y: number) => new Vector2F(Math.fround(x), Math.fround(y));
const almostEquals = (a: Vector2F, b: Vector2F, e: number) => Math.abs(a.x - b.x) <= e && Math.abs(a.y - b.y) <= e;

const points = [v(0, 0), v(1, 0), v(1, -1), v(-1, -1), v(-1, 1), v(3, 2), v(3, 0)];

describe('PathApproximator', () => {
  it('approximates a B-spline', () => {
    const approximated = PathApproximator.bSplineToPiecewiseLinear(points, 4);

    expect(approximated.length).toBe(29);
    expect(almostEquals(approximated[0], points[0], 1e-4)).toBe(true);
    expect(almostEquals(approximated[28], points[6], 1e-4)).toBe(true);
    expect(almostEquals(approximated[10], v(-0.11415, -0.69065), 1e-4)).toBe(true);
  });

  it('throws on an invalid B-spline degree', () => {
    expect(() => PathApproximator.bSplineToPiecewiseLinear(points, 0)).toThrow(RangeError);
    expect(() => PathApproximator.bSplineToPiecewiseLinear(points, -5)).toThrow(RangeError);
  });

  it.each([0, 1])('does nothing when given %i points', pointCount => {
    const input = Array.from({ length: pointCount }, () => Vector2F.Zero);

    expect(PathApproximator.bSplineToPiecewiseLinear(input, 3)).toEqual(input);
    expect(PathApproximator.bezierToPiecewiseLinear(input)).toEqual(input);
  });
});
