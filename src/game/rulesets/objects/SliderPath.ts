// Ported from osu.Game/Rulesets/Objects/SliderPath.cs (float32-exact via Vector2F; the editor-only PointsInSegment is included for completeness).

import { Bindable } from '@fw/bindables/Bindable';
import { BindableList, NotifyCollectionChangedAction } from '@fw/bindables/BindableList';
import { Cached } from '@fw/caching/Cached';
import { Precision } from '@fw/layout/Primitives';
import { Vector2F } from '@fw/layout/Vector2F';
import { CircularArcProperties } from '@fw/utils/CircularArcProperties';
import { PathApproximator } from '@fw/utils/PathApproximator';
import { PathControlPoint } from './PathControlPoint';
import { PathType, SplineType } from './types/PathType';

const f = Math.fround;

export class SliderPath {
  /** The current version of this SliderPath. Updated when any change to the path occurs. */
  get version(): Bindable<number> {
    return this._version;
  }

  private readonly _version = new Bindable<number>(0);

  /** The user-set distance of the path. If non-null, Distance will match this value, and the path will be shortened/lengthened to match this length. */
  readonly expectedDistance = new Bindable<number | null>(null);

  get hasValidLengthForPlacement(): boolean {
    return Precision.definitelyBigger(this.distance, 0, 1);
  }

  /** The control points of the path. */
  readonly controlPoints = new BindableList<PathControlPoint>();

  private readonly _calculatedPath: Vector2F[] = [];
  private readonly cumulativeLength: number[] = [];
  private readonly pathCache = new Cached();

  private optimisedLength = 0;
  private calculatedLength = 0;

  private readonly segmentEnds: number[] = [];
  private segmentEndDistances: number[] = [];

  private readonly invalidate = (): void => {
    this.pathCache.invalidate();
    this._version.value++;
  };

  /** Creates a new SliderPath, optionally with control points and an expected distance (null for a calculated length). */
  constructor(controlPoints: readonly PathControlPoint[] | null = null, expectedDistance: number | null = null) {
    this.expectedDistance.bindValueChanged(() => this.invalidate());

    this.controlPoints.collectionChanged.add((_, args) => {
      switch (args.action) {
        case NotifyCollectionChangedAction.Add:
          for (const newItem of args.newItems!)
            newItem.changed.add(this.invalidate);
          break;

        case NotifyCollectionChangedAction.Reset:
        case NotifyCollectionChangedAction.Remove:
          for (const oldItem of args.oldItems!)
            oldItem.changed.remove(this.invalidate);
          break;
      }

      this.invalidate();
    });

    if (controlPoints !== null) {
      this.controlPoints.addRange(controlPoints);
      this.expectedDistance.value = expectedDistance;
    }
  }

  /** Creates a new SliderPath from vertices of one type (C# `SliderPath(PathType type, Vector2[] controlPoints, double? expectedDistance)`). */
  static fromPositions(type: PathType, positions: readonly Vector2F[], expectedDistance: number | null = null): SliderPath {
    return new SliderPath(positions.map((c, i) => new PathControlPoint(c, i === 0 ? type : null)), expectedDistance);
  }

  /** The distance of the path after lengthening/shortening to account for expectedDistance. */
  get distance(): number {
    this.ensureValid();
    return this.cumulativeLength.length === 0 ? 0 : this.cumulativeLength[this.cumulativeLength.length - 1];
  }

  /** The distance of the path prior to lengthening/shortening to account for expectedDistance. */
  get calculatedDistance(): number {
    this.ensureValid();
    return this.calculatedLength;
  }

  /** The piecewise-linear approximation of the path. */
  get calculatedPath(): readonly Vector2F[] {
    this.ensureValid();
    return this._calculatedPath;
  }

  private _optimiseCatmull = false;

  /** Whether to optimise Catmull path segments, usually resulting in removing bulbs around stacked knots. This changes the path shape and should only be used for backwards compatibility reasons. */
  get optimiseCatmull(): boolean {
    return this._optimiseCatmull;
  }

  set optimiseCatmull(value: boolean) {
    this._optimiseCatmull = value;
    this.invalidate();
  }

  /** Computes the slider path until a given progress that ranges from 0 (beginning of the slider) to 1 (end of the slider) and stores the generated path in the given list. */
  getPathToProgress(path: Vector2F[], p0: number, p1: number): void {
    this.ensureValid();

    const d0 = this.progressToDistance(p0);
    const d1 = this.progressToDistance(p1);

    path.length = 0;

    let i = 0;

    for (; i < this._calculatedPath.length && this.cumulativeLength[i] < d0; ++i) {
    }

    path.push(this.interpolateVertices(i, d0));

    for (; i < this._calculatedPath.length && this.cumulativeLength[i] <= d1; ++i)
      path.push(this._calculatedPath[i]);

    path.push(this.interpolateVertices(i, d1));
  }

  /** Computes the position on the slider at a given progress that ranges from 0 (beginning of the path) to 1 (end of the path). */
  positionAt(progress: number): Vector2F {
    this.ensureValid();

    const d = this.progressToDistance(progress);
    return this.interpolateVertices(this.indexOfDistance(d), d);
  }

  /** Returns the control points belonging to the same segment as the one given. The first point has a PathType which isn't null. */
  pointsInSegment(controlPoint: PathControlPoint): PathControlPoint[] {
    let found = false;
    const pointsInCurrentSegment: PathControlPoint[] = [];

    for (const point of this.controlPoints) {
      if (point.type !== null) {
        if (!found)
          pointsInCurrentSegment.length = 0;
        else {
          pointsInCurrentSegment.push(point);
          break;
        }
      }

      pointsInCurrentSegment.push(point);

      if (point === controlPoint)
        found = true;
    }

    return pointsInCurrentSegment;
  }

  /** Returns the progress values at which (control point) segments of the path end. Ranges from 0 (beginning of the path) to 1 (end of the path) to infinity (beyond the end of the path). */
  getSegmentEnds(): number[] {
    this.ensureValid();
    return this.segmentEndDistances.map(d => d / this.distance);
  }

  private ensureValid(): void {
    if (this.pathCache.isValid)
      return;

    this.calculatePath();
    this.calculateLength();

    this.pathCache.validate();
  }

  private calculatePath(): void {
    this._calculatedPath.length = 0;
    this.segmentEnds.length = 0;
    this.optimisedLength = 0;

    const controlPoints = this.controlPoints.toArray();

    if (controlPoints.length === 0)
      return;

    const vertices = controlPoints.map(p => p.position);

    let start = 0;

    for (let i = 0; i < controlPoints.length; i++) {
      if (controlPoints[i].type === null && i < controlPoints.length - 1)
        continue;

      // The current vertex ends the segment
      const segmentVertices = vertices.slice(start, i + 1);
      const segmentType = controlPoints[start].type ?? PathType.LINEAR;

      // No need to calculate path when there is only 1 vertex
      if (segmentVertices.length === 1)
        this._calculatedPath.push(segmentVertices[0]);
      else if (segmentVertices.length > 1) {
        const subPath = this.calculateSubPath(segmentVertices, segmentType);

        // Skip the first vertex if it is the same as the last vertex from the previous segment
        const skipFirst = this._calculatedPath.length > 0 && subPath.length > 0 && this._calculatedPath[this._calculatedPath.length - 1].equals(subPath[0]);

        for (let j = skipFirst ? 1 : 0; j < subPath.length; j++)
          this._calculatedPath.push(subPath[j]);
      }

      if (i > 0) {
        // Remember the index of the segment end
        this.segmentEnds.push(this._calculatedPath.length - 1);
      }

      // Start the new segment at the current vertex
      start = i;
    }
  }

  private calculateSubPath(subControlPoints: readonly Vector2F[], type: PathType): Vector2F[] {
    switch (type.type) {
      case SplineType.Linear:
        return PathApproximator.linearToPiecewiseLinear(subControlPoints);

      case SplineType.PerfectCurve: {
        if (subControlPoints.length !== 3)
          break;

        const circularArcProperties = new CircularArcProperties(subControlPoints);

        // `PathApproximator` will already internally revert to B-spline if the arc isn't valid.
        if (!circularArcProperties.isValid)
          break;

        // taken from https://github.com/ppy/osu-framework/blob/1201e641699a1d50d2f6f9295192dad6263d5820/osu.Framework/Utils/PathApproximator.cs#L181-L186
        const subPoints = (f(2 * circularArcProperties.radius) <= f(0.1)) ? 2
          : Math.max(2, Math.ceil(circularArcProperties.thetaRange / (2.0 * Math.acos(f(1 - f(f(0.1) / circularArcProperties.radius))))));

        // 1000 subpoints requires an arc length of at least ~120 thousand to occur
        // See here for calculations https://www.desmos.com/calculator/umj6jvmcz7
        if (subPoints >= 1000)
          break;

        const subPath = PathApproximator.circularArcToPiecewiseLinear(subControlPoints);

        // If for some reason a circular arc could not be fit to the 3 given points, fall back to a numerically stable bezier approximation.
        if (subPath.length === 0)
          break;

        return subPath;
      }

      case SplineType.Catmull: {
        const subPath = PathApproximator.catmullToPiecewiseLinear(subControlPoints);

        if (!this._optimiseCatmull)
          return subPath;

        // At draw time, osu!stable optimises paths by only keeping piecewise segments that are 6px apart.
        // For the most part we don't care about this optimisation, and its additional heuristics are hard to reproduce in every implementation.
        //
        // However, it matters for Catmull paths which form "bulbs" around sequential knots with identical positions,
        // so we'll apply a very basic form of the optimisation here and return a length representing the optimised portion.
        // The returned length is important so that the optimisation doesn't cause the path to get extended to match the value of ExpectedDistance.

        const optimisedPath: Vector2F[] = [];

        let lastStart: Vector2F | null = null;
        let lengthRemovedSinceStart = 0;

        for (let i = 0; i < subPath.length; i++) {
          if (lastStart === null) {
            optimisedPath.push(subPath[i]);
            lastStart = subPath[i];
            continue;
          }

          const distFromStart = Vector2F.distance(lastStart, subPath[i]);
          lengthRemovedSinceStart += Vector2F.distance(subPath[i - 1], subPath[i]);

          // See PathApproximator.catmull_detail.
          const catmull_detail = 50;
          const catmull_segment_length = catmull_detail * 2;

          // Either 6px from the start, the last vertex at every knot, or the end of the path.
          if (distFromStart > 6 || (i + 1) % catmull_segment_length === 0 || i === subPath.length - 1) {
            optimisedPath.push(subPath[i]);
            this.optimisedLength += lengthRemovedSinceStart - distFromStart;

            lastStart = null;
            lengthRemovedSinceStart = 0;
          }
        }

        return optimisedPath;
      }
    }

    return PathApproximator.bSplineToPiecewiseLinear(subControlPoints, type.degree ?? subControlPoints.length);
  }

  private calculateLength(): void {
    this.calculatedLength = this.optimisedLength;
    this.cumulativeLength.length = 0;
    this.cumulativeLength.push(0);

    for (let i = 0; i < this._calculatedPath.length - 1; i++) {
      const diff = this._calculatedPath[i + 1].sub(this._calculatedPath[i]);
      this.calculatedLength += diff.length;
      this.cumulativeLength.push(this.calculatedLength);
    }

    // Store the distances of the segment ends now, because after shortening the indices may be out of range
    this.segmentEndDistances = this.segmentEnds.map(e => this.cumulativeLength[e]);

    const expectedDistance = this.expectedDistance.value;

    if (expectedDistance !== null && this.calculatedLength !== expectedDistance) {
      const path = this._calculatedPath;

      // In osu-stable, if the last two path points of a slider are equal, extension is not performed.
      if (path.length >= 2 && path[path.length - 1].equals(path[path.length - 2]) && expectedDistance > this.calculatedLength) {
        this.cumulativeLength.push(this.calculatedLength);
        return;
      }

      // The last length is always incorrect
      this.cumulativeLength.pop();

      let pathEndIndex = path.length - 1;

      if (this.calculatedLength > expectedDistance) {
        // The path will be shortened further, in which case we should trim any more unnecessary lengths and their associated path segments
        while (this.cumulativeLength.length > 0 && this.cumulativeLength[this.cumulativeLength.length - 1] >= expectedDistance) {
          this.cumulativeLength.pop();
          path.splice(pathEndIndex--, 1);
        }
      }

      if (pathEndIndex <= 0) {
        // The expected distance is negative or zero
        // TODO: Perhaps negative path lengths should be disallowed altogether
        this.cumulativeLength.push(0);
        return;
      }

      // The direction of the segment to shorten or lengthen
      const dir = path[pathEndIndex].sub(path[pathEndIndex - 1]).normalized();

      path[pathEndIndex] = path[pathEndIndex - 1].add(dir.mul(f(expectedDistance - this.cumulativeLength[this.cumulativeLength.length - 1])));
      this.cumulativeLength.push(expectedDistance);
    }
  }

  private indexOfDistance(d: number): number {
    // List<double>.BinarySearch
    let lo = 0;
    let hi = this.cumulativeLength.length - 1;

    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      const v = this.cumulativeLength[mid];

      if (v === d) return mid;
      if (v < d) lo = mid + 1;
      else hi = mid - 1;
    }

    return lo;
  }

  private progressToDistance(progress: number): number {
    return Math.min(Math.max(progress, 0), 1) * this.distance;
  }

  private interpolateVertices(i: number, d: number): Vector2F {
    if (this._calculatedPath.length === 0)
      return Vector2F.Zero;

    if (i <= 0)
      return this._calculatedPath[0];
    if (i >= this._calculatedPath.length)
      return this._calculatedPath[this._calculatedPath.length - 1];

    const p0 = this._calculatedPath[i - 1];
    const p1 = this._calculatedPath[i];

    const d0 = this.cumulativeLength[i - 1];
    const d1 = this.cumulativeLength[i];

    // Avoid division by and almost-zero number in case two points are extremely close to each other.
    if (Precision.almostEquals(d0, d1, Precision.DOUBLE_EPSILON))
      return p0;

    const w = (d - d0) / (d1 - d0);
    return p0.add(p1.sub(p0).mul(f(w)));
  }
}
