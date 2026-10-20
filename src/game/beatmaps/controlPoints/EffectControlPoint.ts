// Ported from osu.Game/Beatmaps/ControlPoints/EffectControlPoint.cs

import { BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble } from '@fw/bindables/BindableNumber';
import { ControlPoint } from './ControlPoint';

export class EffectControlPoint extends ControlPoint {
  static readonly DEFAULT: EffectControlPoint = (() => {
    const p = new EffectControlPoint();
    p.kiaiModeBindable.disabled = true;
    p.scrollSpeedBindable.disabled = true;
    return p;
  })();

  /** The relative scroll speed at this control point. */
  readonly scrollSpeedBindable = new BindableDouble(1).with({ minValue: 0.01, maxValue: 10 });

  /** The relative scroll speed. */
  get scrollSpeed(): number {
    return this.scrollSpeedBindable.value;
  }

  set scrollSpeed(value: number) {
    this.scrollSpeedBindable.value = value;
  }

  /** Whether this control point enables Kiai mode. */
  readonly kiaiModeBindable = new BindableBool();

  /** Whether this control point enables Kiai mode. */
  get kiaiMode(): boolean {
    return this.kiaiModeBindable.value;
  }

  set kiaiMode(value: boolean) {
    this.kiaiModeBindable.value = value;
  }

  constructor() {
    super();

    this.kiaiModeBindable.bindValueChanged(() => this.raiseChanged());
    this.scrollSpeedBindable.bindValueChanged(() => this.raiseChanged());
  }

  override isRedundant(existing: ControlPoint | null): boolean {
    return existing instanceof EffectControlPoint
      && this.kiaiMode === existing.kiaiMode
      && this.scrollSpeed === existing.scrollSpeed;
  }

  override copyFrom(other: ControlPoint): void {
    const o = other as EffectControlPoint;
    this.kiaiMode = o.kiaiMode;
    this.scrollSpeed = o.scrollSpeed;

    super.copyFrom(other);
  }

  override equals(other: ControlPoint | null): boolean {
    return other instanceof EffectControlPoint
      && super.equals(other)
      && this.scrollSpeed === other.scrollSpeed
      && this.kiaiMode === other.kiaiMode;
  }
}
