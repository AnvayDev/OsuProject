// Ported from osu.Framework/Utils/PathApproximator.cs (the path → piecewise-linear conversions; the spline-fitting helpers are editor-only and
// omitted). float32-exact via Vector2F.

import { Vector2F } from '../layout/Vector2F';
import { CircularArcProperties } from './CircularArcProperties';

const f = Math.fround;

/** Helper methods to approximate a path by interpolating a sequence of control points. */
export const PathApproximator = {
  BEZIER_TOLERANCE: f(0.25),

  /** The amount of pieces to calculate for each control point quadruplet. */
  catmull_detail: 50,

  circular_arc_tolerance: f(0.1),

  /** Creates a piecewise-linear approximation of a bezier curve, by adaptively repeatedly subdividing the control points until their approximation error vanishes below a given threshold. */
  bezierToPiecewiseLinear(controlPoints: readonly Vector2F[]): Vector2F[] {
    return PathApproximator.bSplineToPiecewiseLinear(controlPoints, Math.max(1, controlPoints.length - 1));
  },

  /** Creates a piecewise-linear approximation of a clamped uniform B-spline with polynomial order p, by dividing it into a series of bezier control points at its knots, then adaptively repeatedly subdividing those until their approximation error vanishes below a given threshold. */
  bSplineToPiecewiseLinear(controlPoints: readonly Vector2F[], degree: number): Vector2F[] {
    // Zero-th degree splines would be piecewise-constant, which cannot be represented by the piecewise-
    // linear output of this function. Negative degrees would require rational splines which this code
    // does not support.
    if (degree < 1)
      throw new RangeError('degree must be at least 1.');

    // Spline fitting does not make sense when the input contains no points or just one point. In this case
    // the user likely wants this function to behave like a no-op.
    if (controlPoints.length < 2)
      return controlPoints.length === 0 ? [] : [controlPoints[0]];

    // With fewer control points than the degree, splines can not be unambiguously fitted. Rather than erroring
    // out, we set the degree to the minimal number that permits a unique fit to avoid special casing in
    // incremental spline building algorithms that call this function.
    degree = Math.min(degree, controlPoints.length - 1);

    const output: Vector2F[] = [];
    const pointCount = controlPoints.length - 1;

    const [toFlatten, d] = bSplineToBezierInternal(controlPoints, degree);
    degree = d;
    const freeBuffers: Vector2F[][] = [];

    // "toFlatten" contains all the curves which are not yet approximated well enough.
    // We use a stack to emulate recursion without the risk of running into a stack overflow.
    // (More specifically, we iteratively and adaptively refine our curve with a
    // <a href="https://en.wikipedia.org/wiki/Depth-first_search">Depth-first search</a>
    // over the tree resulting from the subdivisions we make.)

    const subdivisionBuffer1 = new Array<Vector2F>(degree + 1);
    const subdivisionBuffer2 = new Array<Vector2F>(degree * 2 + 1);

    const leftChild = subdivisionBuffer2;

    while (toFlatten.length > 0) {
      const parent = toFlatten.pop()!;

      if (bezierIsFlatEnough(parent)) {
        // If the control points we currently operate on are sufficiently "flat", we use
        // an extension to De Casteljau's algorithm to obtain a piecewise-linear approximation
        // of the bezier curve represented by our control points, consisting of the same amount
        // of points as there are control points.
        bezierApproximate(parent, output, subdivisionBuffer1, subdivisionBuffer2, degree + 1);

        freeBuffers.push(parent);
        continue;
      }

      // If we do not yet have a sufficiently "flat" (in other words, detailed) approximation we keep
      // subdividing the curve we are currently operating on.
      const rightChild = freeBuffers.length > 0 ? freeBuffers.pop()! : new Array<Vector2F>(degree + 1);
      bezierSubdivide(parent, leftChild, rightChild, subdivisionBuffer1, degree + 1);

      // We re-use the buffer of the parent for one of the children, so that we save one allocation per iteration.
      for (let i = 0; i < degree + 1; ++i)
        parent[i] = leftChild[i];

      toFlatten.push(rightChild);
      toFlatten.push(parent);
    }

    output.push(controlPoints[pointCount]);
    return output;
  },

  /** Creates a piecewise-linear approximation of a Catmull-Rom spline. */
  catmullToPiecewiseLinear(controlPoints: readonly Vector2F[]): Vector2F[] {
    const result: Vector2F[] = [];
    const catmull_detail = PathApproximator.catmull_detail;

    for (let i = 0; i < controlPoints.length - 1; i++) {
      const v1 = i > 0 ? controlPoints[i - 1] : controlPoints[i];
      const v2 = controlPoints[i];
      const v3 = i < controlPoints.length - 1 ? controlPoints[i + 1] : v2.add(v2).sub(v1);
      const v4 = i < controlPoints.length - 2 ? controlPoints[i + 2] : v3.add(v3).sub(v2);

      for (let c = 0; c < catmull_detail; c++) {
        result.push(catmullFindPoint(v1, v2, v3, v4, f(c / catmull_detail)));
        result.push(catmullFindPoint(v1, v2, v3, v4, f((c + 1) / catmull_detail)));
      }
    }

    return result;
  },

  /** Creates a piecewise-linear approximation of a circular arc curve. */
  circularArcToPiecewiseLinear(controlPoints: readonly Vector2F[]): Vector2F[] {
    const pr = new CircularArcProperties(controlPoints);
    if (!pr.isValid)
      return PathApproximator.bezierToPiecewiseLinear(controlPoints);

    // We select the amount of points for the approximation by requiring the discrete curvature
    // to be smaller than the provided tolerance. The exact angle required to meet the tolerance
    // is: 2 * Math.Acos(1 - TOLERANCE / r)
    // The special case is required for extremely short sliders where the radius is smaller than
    // the tolerance. This is a pathological rather than a realistic case.
    const tol = PathApproximator.circular_arc_tolerance;
    const amountPoints = f(2 * pr.radius) <= tol ? 2 : Math.max(2, Math.ceil(pr.thetaRange / (2 * Math.acos(f(1 - f(tol / pr.radius))))));

    const output: Vector2F[] = [];

    for (let i = 0; i < amountPoints; ++i) {
      const fract = i / (amountPoints - 1);
      const theta = pr.thetaStart + pr.direction * fract * pr.thetaRange;
      const o = new Vector2F(f(Math.cos(theta)), f(Math.sin(theta))).mul(pr.radius);
      output.push(pr.centre.add(o));
    }

    return output;
  },

  /** Creates a piecewise-linear approximation of a linear curve. Basically, returns the input. */
  linearToPiecewiseLinear(controlPoints: readonly Vector2F[]): Vector2F[] {
    return [...controlPoints];
  },
};

function bSplineToBezierInternal(controlPoints: readonly Vector2F[], degree: number): [Vector2F[][], number] {
  const result: Vector2F[][] = [];

  // With fewer control points than the degree, splines can not be unambiguously fitted. Rather than erroring
  // out, we set the degree to the minimal number that permits a unique fit to avoid special casing in
  // incremental spline building algorithms that call this function.
  degree = Math.min(degree, controlPoints.length - 1);

  const pointCount = controlPoints.length - 1;
  const points = [...controlPoints];

  if (degree === pointCount) {
    // B-spline subdivision unnecessary, degenerate to single bezier.
    result.push(points);
    return [result, degree];
  }

  // Subdivide B-spline into bezier control points at knots.
  for (let i = 0; i < pointCount - degree; i++) {
    const subBezier = new Array<Vector2F>(degree + 1);
    subBezier[0] = points[i];

    // Destructively insert the knot degree-1 times via Boehm's algorithm.
    for (let j = 0; j < degree - 1; j++) {
      subBezier[j + 1] = points[i + 1];

      for (let k = 1; k < degree - j; k++) {
        const l = Math.min(k, pointCount - degree - i);
        points[i + k] = points[i + k].mul(l).add(points[i + k + 1]).div(l + 1);
      }
    }

    subBezier[degree] = points[i + 1];
    result.push(subBezier);
  }

  result.push(points.slice(pointCount - degree));

  // Reverse the stack so elements can be accessed in order.
  result.reverse();
  return [result, degree];
}

/** Make sure the 2nd order derivative (approximated using finite elements) is within tolerable bounds. */
function bezierIsFlatEnough(controlPoints: readonly Vector2F[]): boolean {
  const t = PathApproximator.BEZIER_TOLERANCE;
  const limit = f(f(f(t * t) * 4));

  for (let i = 1; i < controlPoints.length - 1; i++) {
    if (controlPoints[i - 1].sub(controlPoints[i].mul(2)).add(controlPoints[i + 1]).lengthSquared > limit)
      return false;
  }

  return true;
}

/** Subdivides n control points representing a bezier curve into 2 sets of n control points, each describing a bezier curve equivalent to a half of the original curve. Effectively this splits the original curve into 2 curves which result in the original curve when pieced back together. */
function bezierSubdivide(controlPoints: readonly Vector2F[], l: Vector2F[], r: Vector2F[], subdivisionBuffer: Vector2F[], count: number): void {
  const midpoints = subdivisionBuffer;

  for (let i = 0; i < count; ++i)
    midpoints[i] = controlPoints[i];

  for (let i = 0; i < count; i++) {
    l[i] = midpoints[0];
    r[count - i - 1] = midpoints[count - i - 1];

    for (let j = 0; j < count - i - 1; j++)
      midpoints[j] = midpoints[j].add(midpoints[j + 1]).div(2);
  }
}

/** This uses De Casteljau's algorithm to obtain an optimal piecewise-linear approximation of the bezier curve with the same amount of points as there are control points. */
function bezierApproximate(controlPoints: readonly Vector2F[], output: Vector2F[], subdivisionBuffer1: Vector2F[], subdivisionBuffer2: Vector2F[], count: number): void {
  const l = subdivisionBuffer2;
  const r = subdivisionBuffer1;

  bezierSubdivide(controlPoints, l, r, subdivisionBuffer1, count);

  for (let i = 0; i < count - 1; ++i)
    l[count + i] = r[i + 1];

  output.push(controlPoints[0]);

  for (let i = 1; i < count - 1; ++i) {
    const index = 2 * i;
    // 0.25f * (l[index - 1] + 2 * l[index] + l[index + 1])
    const p = l[index - 1].add(l[index].mul(2)).add(l[index + 1]).mul(0.25);
    output.push(p);
  }
}

/** Finds a point on the spline at the position of a parameter. */
function catmullFindPoint(vec1: Vector2F, vec2: Vector2F, vec3: Vector2F, vec4: Vector2F, t: number): Vector2F {
  const t2 = f(t * t);
  const t3 = f(t * t2);

  const component = (v1: number, v2: number, v3: number, v4: number) =>
    f(0.5 * f(
      f(f(f(2 * v2) + f(f(-v1 + v3) * t)) + f(f(f(f(f(2 * v1) - f(5 * v2)) + f(4 * v3)) - v4) * t2))
      + f(f(f(f(-v1 + f(3 * v2)) - f(3 * v3)) + v4) * t3)));

  return new Vector2F(component(vec1.x, vec2.x, vec3.x, vec4.x), component(vec1.y, vec2.y, vec3.y, vec4.y));
}
