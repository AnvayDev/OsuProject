// Ported from osu.Framework/Graphics/Transforms/TransformBindable.cs

import type { Bindable } from '../bindables/Bindable';
import { valueAt } from './Interpolation';
import { Transform } from './Transform';
import type { Transformable } from './Transformable';

/** Stands in for C#'s GetHashCode(): a stable identity per bindable instance. */
const bindableIds = new WeakMap<object, number>();
let nextBindableId = 0;

export class TransformBindable<TValue, T extends Transformable> extends Transform<TValue, T> {
  private readonly _targetMember: string;

  override get targetMember(): string {
    return this._targetMember;
  }

  constructor(private readonly targetBindable: Bindable<TValue>) {
    super();

    let id = bindableIds.get(targetBindable);
    if (id === undefined)
      bindableIds.set(targetBindable, id = nextBindableId++);

    this._targetMember = `${id}.Value`;
  }

  private valueAt(time: number): TValue {
    if (time < this.startTime) return this.startValue;
    if (time >= this.endTime) return this.endValue;

    return valueAt(time, this.startValue, this.endValue, this.startTime, this.endTime, this.easing);
  }

  protected override applyTo(_d: T, time: number): void {
    this.targetBindable.value = this.valueAt(time);
  }

  protected override readIntoStartValueFrom(_d: T): void {
    this.startValue = this.targetBindable.value;
  }
}
