// Ported from osu.Game/Beatmaps/ControlPoints/ControlPointInfo.cs (the editor snapping helpers are omitted).

import { BindableList } from '@fw/bindables/BindableList';
import { Signal } from '@fw/bindables/Signal';
import { SortedList } from '@fw/lists/SortedList';
import { compareControlPoints, type ControlPoint, type IControlPoint } from './ControlPoint';
import { ControlPointGroup } from './ControlPointGroup';
import { EffectControlPoint } from './EffectControlPoint';
import { TimingControlPoint } from './TimingControlPoint';

export enum EqualitySelection {
  FirstFound,
  Leftmost,
  Rightmost,
}

export class ControlPointInfo {
  /** Invoked on any change to the set of control points. */
  readonly controlPointsChanged = new Signal();

  private readonly raiseControlPointsChanged = () => this.controlPointsChanged.emit();

  /** All control points grouped by time. */
  readonly groups = new BindableList<ControlPointGroup>();

  private readonly _timingPoints = new SortedList<TimingControlPoint>(compareControlPoints);

  /** All timing points. */
  get timingPoints(): readonly TimingControlPoint[] {
    return this._timingPoints.toArray();
  }

  private readonly _effectPoints = new SortedList<EffectControlPoint>(compareControlPoints);

  /** All effect points. */
  get effectPoints(): readonly EffectControlPoint[] {
    return this._effectPoints.toArray();
  }

  get allControlPoints(): ControlPoint[] {
    return this.groups.toArray().flatMap(g => g.controlPoints.toArray());
  }

  /** Finds the effect control point that is active at time. */
  effectPointAt(time: number): EffectControlPoint {
    return ControlPointInfo.binarySearchWithFallback(this.effectPoints, time, EffectControlPoint.DEFAULT);
  }

  /** Finds the timing control point that is active at time. */
  timingPointAt(time: number): TimingControlPoint {
    return ControlPointInfo.binarySearchWithFallback(this.timingPoints, time, this.timingPoints.length > 0 ? this.timingPoints[0] : TimingControlPoint.DEFAULT);
  }

  /** Finds the first timing point that is active strictly after time, or null if no such point exists. */
  timingPointAfter(time: number): TimingControlPoint | null {
    let index = ControlPointInfo.binarySearchIndex(this.timingPoints, time, EqualitySelection.Rightmost);
    index = index < 0 ? ~index : index + 1;
    return index < this.timingPoints.length ? this.timingPoints[index] : null;
  }

  /** Finds the maximum BPM represented by any timing control point. */
  get bpmMaximum(): number {
    return 60000 / (minBy(this.timingPoints, c => c.beatLength) ?? TimingControlPoint.DEFAULT).beatLength;
  }

  /** Finds the minimum BPM represented by any timing control point. */
  get bpmMinimum(): number {
    return 60000 / (maxBy(this.timingPoints, c => c.beatLength) ?? TimingControlPoint.DEFAULT).beatLength;
  }

  /** Remove all ControlPointGroups and return to a pristine state. */
  clear(): void {
    this.groups.clear();
    this._timingPoints.removeAll(() => true);
    this._effectPoints.removeAll(() => true);
  }

  /** Add a new ControlPoint. Note that the provided control point may not be added if the correct state is already present at the provided time. Returns whether the control point was added. */
  add(time: number, controlPoint: ControlPoint): boolean {
    if (this.checkAlreadyExisting(time, controlPoint))
      return false;

    this.groupAt(time, true)!.add(controlPoint);
    return true;
  }

  groupAt(time: number, addIfNotExisting = false): ControlPointGroup | null {
    const newGroup = new ControlPointGroup(time);

    const i = this.groups.binarySearch(newGroup);

    if (i >= 0)
      return this.groups.get(i);

    if (addIfNotExisting) {
      newGroup.itemAdded.add(this.groupItemAdded);
      newGroup.itemChanged.add(this.raiseControlPointsChanged);
      newGroup.itemRemoved.add(this.groupItemRemoved);

      this.groups.insert(~i, newGroup);
      return newGroup;
    }

    return null;
  }

  removeGroup(group: ControlPointGroup): void {
    for (const item of [...group.controlPoints])
      group.remove(item);

    group.itemAdded.remove(this.groupItemAdded);
    group.itemChanged.remove(this.raiseControlPointsChanged);
    group.itemRemoved.remove(this.groupItemRemoved);

    this.groups.remove(group);
  }

  /** Binary searches one of the control point lists to find the active control point at time. Includes logic for returning a specific point when no matching point is found. */
  static binarySearchWithFallback<T extends IControlPoint>(list: readonly T[], time: number, fallback: T): T {
    return ControlPointInfo.binarySearch(list, time) ?? fallback;
  }

  /** Binary searches one of the control point lists to find the active control point at time. */
  static binarySearch<T extends IControlPoint>(list: readonly T[], time: number): T | null {
    let index = ControlPointInfo.binarySearchIndex(list, time, EqualitySelection.Rightmost);

    if (index < 0)
      index = ~index - 1;

    return index >= 0 ? list[index] : null;
  }

  /**
   * Binary searches one of the control point lists to find the active control point at time.
   * Returns the index of the control point at time, or the bitwise complement of the index of the first control point after it.
   */
  static binarySearchIndex<T extends IControlPoint>(list: readonly T[], time: number, equalitySelection: EqualitySelection): number {
    const n = list.length;

    if (n === 0)
      return -1;

    if (time < list[0].time)
      return -1;

    if (time > list[n - 1].time)
      return ~n;

    let l = 0;
    let r = n - 1;
    let equalityFound = false;

    while (l <= r) {
      const pivot = l + ((r - l) >> 1);

      if (list[pivot].time < time)
        l = pivot + 1;
      else if (list[pivot].time > time)
        r = pivot - 1;
      else {
        equalityFound = true;

        switch (equalitySelection) {
          case EqualitySelection.Leftmost:
            r = pivot - 1;
            break;

          case EqualitySelection.Rightmost:
            l = pivot + 1;
            break;

          default:
            return pivot;
        }
      }
    }

    if (!equalityFound) return ~l;

    switch (equalitySelection) {
      case EqualitySelection.Leftmost:
        return l;

      default:
        return l - 1;
    }
  }

  /** Check whether newPoint should be added. Returns whether the point should be skipped (it is redundant at this time). */
  protected checkAlreadyExisting(time: number, newPoint: ControlPoint): boolean {
    let existing: ControlPoint | null = null;

    if (newPoint instanceof TimingControlPoint)
      // Timing points are a special case and need to be added regardless of fallback availability.
      existing = ControlPointInfo.binarySearch(this.timingPoints, time);
    else if (newPoint instanceof EffectControlPoint)
      existing = this.effectPointAt(time);

    return newPoint?.isRedundant(existing) === true;
  }

  protected readonly groupItemAdded = (controlPoint: ControlPoint): void => this.onGroupItemAdded(controlPoint);

  protected onGroupItemAdded(controlPoint: ControlPoint): void {
    if (controlPoint instanceof TimingControlPoint)
      this._timingPoints.add(controlPoint);
    else if (controlPoint instanceof EffectControlPoint)
      this._effectPoints.add(controlPoint);
    else
      throw new Error(`A control point of unexpected type ${controlPoint.constructor.name} was added to this ControlPointInfo`);

    this.raiseControlPointsChanged();
  }

  protected readonly groupItemRemoved = (controlPoint: ControlPoint): void => this.onGroupItemRemoved(controlPoint);

  protected onGroupItemRemoved(controlPoint: ControlPoint): void {
    if (controlPoint instanceof TimingControlPoint)
      this._timingPoints.remove(controlPoint);
    else if (controlPoint instanceof EffectControlPoint)
      this._effectPoints.remove(controlPoint);

    this.raiseControlPointsChanged();
  }

  deepClone(): ControlPointInfo {
    const controlPointInfo = new (this.constructor as new () => ControlPointInfo)();

    for (const point of this.allControlPoints)
      controlPointInfo.add(point.time, point.deepClone());

    return controlPointInfo;
  }
}

/** LINQ MinBy/MaxBy: the first element with the smallest/largest key. */
function minBy<T>(items: readonly T[], key: (t: T) => number): T | null {
  let best: T | null = null;
  let bestKey = Infinity;
  for (const i of items) {
    const k = key(i);
    if (best === null || k < bestKey) { best = i; bestKey = k; }
  }
  return best;
}

function maxBy<T>(items: readonly T[], key: (t: T) => number): T | null {
  let best: T | null = null;
  let bestKey = -Infinity;
  for (const i of items) {
    const k = key(i);
    if (best === null || k > bestKey) { best = i; bestKey = k; }
  }
  return best;
}
