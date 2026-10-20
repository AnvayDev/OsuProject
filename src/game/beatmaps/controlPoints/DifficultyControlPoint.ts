// Ported from osu.Game/Beatmaps/ControlPoints/DifficultyControlPoint.cs

import { BindableDouble } from '@fw/bindables/BindableNumber';
import { ControlPoint } from './ControlPoint';

/** Note that going forward, this control point type should always be assigned directly to HitObjects. */
export class DifficultyControlPoint extends ControlPoint {
  static readonly DEFAULT: DifficultyControlPoint = (() => {
    const p = new DifficultyControlPoint();
    p.sliderVelocityBindable.disabled = true;
    return p;
  })();

  readonly sliderVelocityBindable = new BindableDouble(1).with({ minValue: 0.1, maxValue: 10 });

  /** Whether or not slider ticks should be generated at this control point. This exists for backwards compatibility with maps that abuse NaN slider velocity behavior on osu!stable (e.g. /b/2628991). */
  generateTicks = true;

  /** The slider velocity at this control point. */
  get sliderVelocity(): number {
    return this.sliderVelocityBindable.value;
  }

  set sliderVelocity(value: number) {
    this.sliderVelocityBindable.value = value;
  }

  constructor() {
    super();

    this.sliderVelocityBindable.bindValueChanged(() => this.raiseChanged());
  }

  override isRedundant(existing: ControlPoint | null): boolean {
    return existing instanceof DifficultyControlPoint
      && this.generateTicks === existing.generateTicks
      && this.sliderVelocity === existing.sliderVelocity;
  }

  override copyFrom(other: ControlPoint): void {
    const o = other as DifficultyControlPoint;
    this.sliderVelocity = o.sliderVelocity;
    this.generateTicks = o.generateTicks;

    super.copyFrom(other);
  }

  override equals(other: ControlPoint | null): boolean {
    return other instanceof DifficultyControlPoint
      && super.equals(other)
      && this.generateTicks === other.generateTicks
      && this.sliderVelocity === other.sliderVelocity;
  }
}
