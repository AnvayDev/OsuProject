// Ported from osu.Framework/Graphics/Transforms/TransformCustom.cs
// C# builds IL accessors via reflection; here the member is read and written by name.

import { valueAt } from './Interpolation';
import { Transform } from './Transform';
import type { Transformable } from './Transformable';

export class TransformCustom<TValue, T extends Transformable> extends Transform<TValue, T> {
  override get targetGrouping(): string {
    return this.grouping ?? this.targetMember;
  }

  override get targetMember(): string {
    return this.propertyOrFieldName;
  }

  constructor(private readonly propertyOrFieldName: string, private readonly grouping: string | null = null) {
    super();
  }

  private valueAt(time: number): TValue {
    if (time < this.startTime) return this.startValue;
    if (time >= this.endTime) return this.endValue;

    return valueAt(time, this.startValue, this.endValue, this.startTime, this.endTime, this.easing);
  }

  protected override applyTo(d: T, time: number): void {
    (d as any)[this.propertyOrFieldName] = this.valueAt(time);
  }

  protected override readIntoStartValueFrom(d: T): void {
    this.startValue = (d as any)[this.propertyOrFieldName];
  }
}
