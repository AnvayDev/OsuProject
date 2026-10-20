// Ported from osu.Game/Beatmaps/ControlPoints/ControlPoint.cs and IControlPoint.cs (GetRepresentingColour is editor-only and omitted).

import { Signal } from '@fw/bindables/Signal';

export interface IControlPoint {
  /** The time at which the control point takes effect. */
  readonly time: number;
}

export abstract class ControlPoint implements IControlPoint {
  /** Invoked when any of this ControlPoint's properties have changed. */
  readonly changed = new Signal<ControlPoint>();

  protected raiseChanged(): void {
    this.changed.emit(this);
  }

  private _time = 0;

  get time(): number {
    return this._time;
  }

  set time(value: number) {
    if (this._time === value)
      return;

    this._time = value;
    this.raiseChanged();
  }

  attachGroup(pointGroup: { readonly time: number }): void {
    this.time = pointGroup.time;
  }

  compareTo(other: ControlPoint | null): number {
    return other === null ? 1 : Math.sign(this.time - other.time);
  }

  /** Determines whether this ControlPoint results in a meaningful change when placed alongside another. */
  abstract isRedundant(existing: ControlPoint | null): boolean;

  deepClone(): ControlPoint {
    const copy = new (this.constructor as new () => ControlPoint)();
    copy.copyFrom(this);
    return copy;
  }

  copyFrom(other: ControlPoint): void {
    this.time = other.time;
  }

  equals(other: ControlPoint | null): boolean {
    if (other === null) return false;
    if (other === this) return true;

    return this.time === other.time;
  }
}

/** Comparer<T>.Default for control points (IComparable on Time). */
export const compareControlPoints = (a: ControlPoint, b: ControlPoint) => a.compareTo(b);
