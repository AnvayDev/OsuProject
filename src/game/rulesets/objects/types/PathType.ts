// Ported from osu.Game/Rulesets/Objects/Types/PathType.cs

export enum SplineType {
  Catmull,
  BSpline,
  Linear,
  PerfectCurve,
}

export class PathType {
  constructor(readonly type: SplineType, readonly degree: number | null = null) {}

  static readonly CATMULL = new PathType(SplineType.Catmull);
  static readonly BEZIER = new PathType(SplineType.BSpline);
  static readonly LINEAR = new PathType(SplineType.Linear);
  static readonly PERFECT_CURVE = new PathType(SplineType.PerfectCurve);

  /** A B-spline with an explicit degree. */
  static bSpline(degree: number): PathType {
    if (degree <= 0)
      throw new RangeError(`degree ('${degree}') must be a non-negative and non-zero value.`);

    return new PathType(SplineType.BSpline, degree);
  }

  get description(): string {
    switch (this.type) {
      case SplineType.Catmull:
        return 'Catmull';

      case SplineType.BSpline:
        return this.degree === null ? 'Bezier' : 'B-spline';

      case SplineType.Linear:
        return 'Linear';

      case SplineType.PerfectCurve:
        return 'Perfect curve';
    }
  }

  equals(other: PathType | null): boolean {
    return other !== null && this.type === other.type && this.degree === other.degree;
  }

  /** C# `==` on PathType? (nullable struct equality). */
  static equals(a: PathType | null, b: PathType | null): boolean {
    return a === null ? b === null : a.equals(b);
  }

  toString(): string {
    return this.description;
  }
}
