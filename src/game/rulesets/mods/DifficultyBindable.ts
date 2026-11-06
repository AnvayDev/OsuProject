// Ported from osu.Game/Rulesets/Mods/DifficultyBindable.cs

import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { BindableFloat } from '@fw/bindables/BindableNumber';
import type { IBeatmapDifficultyInfo } from '../../beatmaps/BeatmapDifficulty';

export class DifficultyBindable extends Bindable<number | null> {
  /** Whether the extended limits should be applied to this bindable. */
  readonly extendedLimits = new BindableBool();

  /** (internal) An internal numeric bindable to hold and propagate min/max/precision. The value of this bindable should not be set. */
  readonly currentNumber = new BindableFloat().with({
    minValue: 0,
    maxValue: 10,
  });

  /** A function that can be used to get the value to display when this bindable is null. */
  readCurrentFromDifficulty: ((difficulty: IBeatmapDifficultyInfo) => number) | null = null;

  set precision(value: number) {
    this.currentNumber.precision = value;
  }

  private _minValue = 0;

  get minValue(): number {
    return this._minValue;
  }

  set minValue(value: number) {
    if (value === this._minValue)
      return;

    this._minValue = value;
    this.updateExtents();
  }

  private _maxValue = 10; // matches default max value of `CurrentNumber`

  get maxValue(): number {
    return this._maxValue;
  }

  set maxValue(value: number) {
    if (value === this._maxValue)
      return;

    this._maxValue = value;
    this.updateExtents();
  }

  private _extendedMinValue: number | null = null;

  /** The minimum value to be used when extended limits are applied. */
  get extendedMinValue(): number | null {
    return this._extendedMinValue;
  }

  set extendedMinValue(value: number | null) {
    if (value === this._extendedMinValue)
      return;

    this._extendedMinValue = value;
    this.updateExtents();
  }

  private _extendedMaxValue: number | null = null;

  /** The maximum value to be used when extended limits are applied. */
  get extendedMaxValue(): number | null {
    return this._extendedMaxValue;
  }

  set extendedMaxValue(value: number | null) {
    if (value === this._extendedMaxValue)
      return;

    this._extendedMaxValue = value;
    this.updateExtents();
  }

  constructor(defaultValue: number | null = null) {
    super(defaultValue);

    this.extendedLimits.bindValueChanged(() => this.updateExtents());
  }

  override get value(): number | null {
    return super.value;
  }

  override set value(value: number | null) {
    // Ensure that in the case serialisation runs in the wrong order (and limit extensions aren't applied yet) the deserialised value is still propagated.
    if (value !== null) {
      this.currentNumber.minValue = clamp(Math.min(this.currentNumber.minValue, value), this.extendedMinValue ?? this.minValue, this.minValue);
      this.currentNumber.maxValue = clamp(Math.max(this.currentNumber.maxValue, value), this.maxValue, this.extendedMaxValue ?? this.maxValue);

      super.value = clamp(value, this.currentNumber.minValue, this.currentNumber.maxValue);
    } else
      super.value = value;
  }

  private updateExtents(): void {
    this.currentNumber.minValue = this.extendedLimits.value && this._extendedMinValue !== null ? this._extendedMinValue : this._minValue;
    this.currentNumber.maxValue = this.extendedLimits.value && this._extendedMaxValue !== null ? this._extendedMaxValue : this._maxValue;
  }

  override copyTo(them: Bindable<number | null>): void {
    if (!(them instanceof DifficultyBindable))
      throw new Error('Cannot copy to a non-DifficultyBindable.');

    super.copyTo(them);

    them.readCurrentFromDifficulty = this.readCurrentFromDifficulty;

    // the following max value copies are only safe as long as these values are effectively constants.
    them.maxValue = this._maxValue;
    them.extendedMaxValue = this._extendedMaxValue;
    them.minValue = this._minValue;
    them.extendedMinValue = this._extendedMinValue;
  }

  override bindTo(them: Bindable<number | null>): void {
    if (!(them instanceof DifficultyBindable))
      throw new Error('Cannot bind to a non-DifficultyBindable.');

    // ensure that MaxValue and ExtendedMaxValue are copied across first before continuing.
    // not doing so may cause the value of CurrentNumber to be truncated to 10.
    them.copyTo(this);

    // set up mutual binding for ExtendedLimits to correctly set the upper bound of CurrentNumber.
    this.extendedLimits.bindTarget = them.extendedLimits;

    // set up mutual binding for CurrentNumber. this must happen after all of the above.
    this.currentNumber.bindTarget = them.currentNumber;

    // finish up the binding by setting up weak references via the base call.
    // unfortunately this will call `.CopyTo()` again, but fixing that is problematic and messy.
    super.bindTo(them);
  }

  override unbindFrom(them: Bindable<number | null>): void {
    if (!(them instanceof DifficultyBindable))
      throw new Error('Cannot unbind from a non-DifficultyBindable.');

    super.unbindFrom(them);

    this.currentNumber.unbindFrom(them.currentNumber);
    this.extendedLimits.unbindFrom(them.extendedLimits);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
