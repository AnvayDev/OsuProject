// Ported from osu.Game/Beatmaps/ControlPoints/ControlPointGroup.cs

import { BindableList } from '@fw/bindables/BindableList';
import { Signal } from '@fw/bindables/Signal';
import type { ControlPoint } from './ControlPoint';

export class ControlPointGroup {
  readonly itemAdded = new Signal<ControlPoint>();
  readonly itemChanged = new Signal<ControlPoint>();
  readonly itemRemoved = new Signal<ControlPoint>();

  private readonly raiseItemChanged = (controlPoint: ControlPoint) => this.itemChanged.emit(controlPoint);

  /** The time at which the control point takes effect. */
  readonly time: number;

  readonly controlPoints = new BindableList<ControlPoint>();

  constructor(time: number) {
    this.time = time;
  }

  compareTo(other: ControlPointGroup | null): number {
    return other === null ? 1 : Math.sign(this.time - other.time);
  }

  add(point: ControlPoint): void {
    const existing = this.controlPoints.toArray().find(p => p.constructor === point.constructor);

    if (existing !== undefined)
      this.remove(existing);

    point.attachGroup(this);

    this.controlPoints.add(point);
    this.itemAdded.emit(point);

    point.changed.add(this.raiseItemChanged);
  }

  remove(point: ControlPoint): void {
    this.controlPoints.remove(point);
    this.itemRemoved.emit(point);

    point.changed.remove(this.raiseItemChanged);
  }

  equals(other: ControlPointGroup | null): boolean {
    if (other === null || this.time !== other.time) return false;

    const a = this.controlPoints.toArray(), b = other.controlPoints.toArray();
    return a.length === b.length && a.every((p, i) => p.equals(b[i]));
  }
}
