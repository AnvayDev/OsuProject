// Ported from osu.Framework/Bindables/RangeConstrainedBindable.cs, BindableNumber.cs, BindableFloat.cs, BindableDouble.cs, BindableInt.cs, BindableLong.cs.
// C# generic numeric types become subclasses that define DefaultMinValue/DefaultMaxValue/DefaultPrecision/isInteger.

import { Bindable, defaultEquals } from './Bindable';
import { Signal } from './Signal';

export abstract class RangeConstrainedBindable<T> extends Bindable<T> {
  readonly minValueChanged = new Signal<T>();
  readonly maxValueChanged = new Signal<T>();

  private _minValue!: T;

  get minValue(): T {
    return this._minValue;
  }

  set minValue(value: T) {
    if (defaultEquals(value, this._minValue))
      return;

    this.setMinValue(value, true, this);
  }

  private _maxValue!: T;

  get maxValue(): T {
    return this._maxValue;
  }

  set maxValue(value: T) {
    if (defaultEquals(value, this._maxValue))
      return;

    this.setMaxValue(value, true, this);
  }

  override get value(): T {
    return super.value;
  }

  override set value(value: T) {
    this.setConstrainedValue(value);
  }

  // Abstract in C#; concrete here because TS forbids reading abstract members in constructors (the C# ctor does).
  protected get defaultMinValue(): T {
    throw new Error('defaultMinValue must be overridden.');
  }

  protected get defaultMaxValue(): T {
    throw new Error('defaultMaxValue must be overridden.');
  }

  /** Whether this bindable has a user-defined range that is not the full range of the T type. */
  get hasDefinedRange(): boolean {
    return !defaultEquals(this.minValue, this.defaultMinValue) || !defaultEquals(this.maxValue, this.defaultMaxValue);
  }

  constructor(defaultValue: T) {
    super(defaultValue);

    this._minValue = this.defaultMinValue;
    this._maxValue = this.defaultMaxValue;

    // Reapply the default value here for respecting the defined default min/max values.
    this.setConstrainedValue(defaultValue);
  }

  /** The current value, normalised to a range of 0-1 between minValue and maxValue (1 when the range is empty). */
  get normalizedValue(): number {
    const min = Number(this.minValue);
    const max = Number(this.maxValue);

    if (max - min === 0)
      return 1;

    const val = Number(this.value);
    return (val - min) / (max - min);
  }

  /** @internal */
  setMinValue(minValue: T, updateCurrentValue: boolean, source: RangeConstrainedBindable<T>): void {
    this._minValue = minValue;
    this.triggerMinValueChange(source);

    if (updateCurrentValue) {
      // Reapply the current value to respect the new minimum value.
      this.setConstrainedValue(this.value);
    }
  }

  /** @internal */
  setMaxValue(maxValue: T, updateCurrentValue: boolean, source: RangeConstrainedBindable<T>): void {
    this._maxValue = maxValue;
    this.triggerMaxValueChange(source);

    if (updateCurrentValue) {
      // Reapply the current value to respect the new maximum value.
      this.setConstrainedValue(this.value);
    }
  }

  override triggerChange(): void {
    super.triggerChange();

    this.triggerMinValueChange(this, false);
    this.triggerMaxValueChange(this, false);
  }

  protected triggerMinValueChange(source: RangeConstrainedBindable<T> | null = null, propagateToBindings = true): void {
    // check a bound bindable hasn't changed the value again (it will fire its own event)
    const beforePropagation = this._minValue;

    if (propagateToBindings && this.bindings !== null) {
      for (const b of [...this.bindings]) {
        if (b === source) continue;

        if (b instanceof RangeConstrainedBindable)
          b.setMinValue(this._minValue, false, this);
      }
    }

    if (defaultEquals(beforePropagation, this._minValue))
      this.minValueChanged.emit(this._minValue);
  }

  protected triggerMaxValueChange(source: RangeConstrainedBindable<T> | null = null, propagateToBindings = true): void {
    // check a bound bindable hasn't changed the value again (it will fire its own event)
    const beforePropagation = this._maxValue;

    if (propagateToBindings && this.bindings !== null) {
      for (const b of [...this.bindings]) {
        if (b === source) continue;

        if (b instanceof RangeConstrainedBindable)
          b.setMaxValue(this._maxValue, false, this);
      }
    }

    if (defaultEquals(beforePropagation, this._maxValue))
      this.maxValueChanged.emit(this._maxValue);
  }

  override copyTo(them: Bindable<T>): void {
    // if the other bindable is range-constrained, the bounds need to be copied across first,
    // as Value assignment (in the base call below) automatically clamps to [MinValue, MaxValue].
    if (them instanceof RangeConstrainedBindable) {
      // copy the bounds over without updating the current value, to avoid clamping on invalid ranges.
      // there is no need to clamp `Value` after that directly - the `base.CopyTo()` call will change `Value` anyway.
      them.setMinValue(this.minValue, false, this);
      them.setMaxValue(this.maxValue, false, this);
    }

    super.copyTo(them);
  }

  override bindTo(them: Bindable<T>): void {
    if (them instanceof RangeConstrainedBindable) {
      if (!this.isValidRange(them.minValue, them.maxValue))
        throw new RangeError(`The target bindable has specified an invalid range of [${them.minValue} - ${them.maxValue}].`);
    }

    super.bindTo(them);
  }

  override unbindEvents(): void {
    super.unbindEvents();

    this.minValueChanged.clear();
    this.maxValueChanged.clear();
  }

  /** Clamps value to the range defined by minValue and maxValue. */
  protected abstract clampValue(value: T, minValue: T, maxValue: T): T;

  /** Whether min and max define a valid range (usually min <= max). */
  protected abstract isValidRange(min: T, max: T): boolean;

  /** private setValue(T) in C#; overridden by BindableNumber to add precision rounding. */
  protected setConstrainedValue(value: T): void {
    super.value = this.clampValue(value, this._minValue, this._maxValue);
  }
}

/** Parses a JS number's string form into an exact decimal: value = mantissa / 10^scale. */
function parseDecimal(str: string): [bigint, number] {
  const [mantStr, expStr] = str.toLowerCase().split('e');
  const exp = expStr !== undefined ? parseInt(expStr, 10) : 0;
  const neg = mantStr.startsWith('-');
  const [ip, fp = ''] = (neg ? mantStr.slice(1) : mantStr).split('.');

  let m = BigInt(ip + fp);
  let scale = fp.length - exp;

  if (scale < 0) {
    m *= 10n ** BigInt(-scale);
    scale = 0;
  }

  return [neg ? -m : m, scale];
}

function decimalToNumber(m: bigint, scale: number): number {
  const neg = m < 0n;
  let digits = (neg ? -m : m).toString();

  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    digits = `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  }

  return Number((neg ? '-' : '') + digits);
}

/**
 * `Math.Round(decimal(value) / decimal(precision)) * decimal(precision)`, converted back to a double.
 * Conversion to decimal keeps 15 significant digits for double and 7 for float (as .NET does), and Math.Round(decimal)
 * rounds midpoints to even.
 */
function roundToPrecisionDecimal(value: number, precision: number, significantDigits: number): number {
  const [a, sa] = parseDecimal(Number(value.toPrecision(significantDigits)).toString());
  const [b, sb] = parseDecimal(Number(precision.toPrecision(significantDigits)).toString());

  // q = (a / 10^sa) / (b / 10^sb)
  let num = a * 10n ** BigInt(sb);
  let den = b * 10n ** BigInt(sa);

  if (den < 0n) {
    num = -num;
    den = -den;
  }

  let q = num / den;
  const rem = num - q * den;
  const twice = (rem < 0n ? -rem : rem) * 2n;

  if (twice > den || (twice === den && q % 2n !== 0n))
    q += num < 0n ? -1n : 1n;

  return decimalToNumber(q * b, sb);
}

// float.Epsilon / double.Epsilon cannot be represented as a decimal (decimal.CreateTruncating gives 0), so they disable rounding.
const DECIMAL_MIN_POSITIVE = 1e-28;

export abstract class BindableNumber extends RangeConstrainedBindable<number> {
  readonly precisionChanged = new Signal<number>();

  constructor(defaultValue = 0) {
    super(defaultValue);

    this._precision = this.defaultPrecision;

    // Re-apply the current value to apply the default precision value
    this.setConstrainedValue(this.value);
  }

  private _precision!: number;

  /** The precision up to which the value of this bindable should be rounded. */
  get precision(): number {
    return this._precision;
  }

  set precision(value: number) {
    if (this._precision === value)
      return;

    if (value <= 0)
      throw new RangeError('Precision must be greater than 0.');

    this.setPrecision(value, true, this);
  }

  /** @internal */
  setPrecision(precision: number, updateCurrentValue: boolean, source: BindableNumber): void {
    this._precision = precision;
    this.triggerPrecisionChange(source);

    if (updateCurrentValue) {
      // Re-apply the current value to apply the new precision
      this.setConstrainedValue(this.value);
    }
  }

  protected override setConstrainedValue(value: number): void {
    // _precision is undefined while the base constructor runs (C# precision is 0 then, skipping rounding).
    const decPrecision = this._precision !== undefined && this._precision >= DECIMAL_MIN_POSITIVE ? this._precision : 0;

    if (decPrecision > 0) {
      // this rounding is purposefully performed (as on `decimal` in C#) to ensure that the resulting value is the closest possible floating-point
      // number to actual real-world base-10 decimals, as that is the most common usage of precision.
      const clamped = Math.min(this.maxValue, Math.max(this.minValue, value));
      super.setConstrainedValue(this.truncate(roundToPrecisionDecimal(clamped, decPrecision, this.decimalSignificantDigits)));
    } else
      super.setConstrainedValue(this.truncate(value));
  }

  /** T.CreateTruncating for integer types; identity for floating point. */
  protected truncate(value: number): number {
    return this.isInteger ? Math.trunc(value) : value;
  }

  protected get defaultPrecision(): number {
    throw new Error('defaultPrecision must be overridden.');
  }

  /** Significant digits kept when converting T to decimal (15 for double, 7 for float, exact for integers). */
  protected get decimalSignificantDigits(): number {
    return this.isInteger ? 17 : 15;
  }

  /** Whether this bindable serves an integer type. */
  abstract get isInteger(): boolean;

  override triggerChange(): void {
    super.triggerChange();

    this.triggerPrecisionChange(this, false);
  }

  protected triggerPrecisionChange(source: BindableNumber | null = null, propagateToBindings = true): void {
    // check a bound bindable hasn't changed the value again (it will fire its own event)
    const beforePropagation = this._precision;

    if (propagateToBindings && this.bindings !== null) {
      for (const b of [...this.bindings]) {
        if (b === source) continue;

        if (b instanceof BindableNumber)
          b.setPrecision(this._precision, false, this);
      }
    }

    if (beforePropagation === this._precision)
      this.precisionChanged.emit(this._precision);
  }

  override copyTo(them: Bindable<number>): void {
    if (them instanceof BindableNumber)
      them.precision = this.precision;

    super.copyTo(them);
  }

  override unbindEvents(): void {
    super.unbindEvents();

    this.precisionChanged.clear();
  }

  /** Parses strings with the invariant culture (Convert.ChangeType); numbers and bindables are assigned. */
  override parse(input: unknown): void {
    if (typeof input === 'string') {
      const n = Number(input.trim());
      if (input.trim() === '' || Number.isNaN(n))
        throw new Error(`Input string "${input}" was not in a correct format.`);

      this.value = this.isInteger ? Math.trunc(n) : n;
      return;
    }

    super.parse(input);
  }

  /** Sets the value of the bindable to the given value, converted (truncated) to this bindable's type. */
  set(val: number): void {
    this.value = this.truncate(val);
  }

  /** Adds the given value to the value of the bindable. */
  add(val: number): void {
    this.value = this.value + this.truncate(val);
  }

  /** Sets the value of the bindable to minValue + (maxValue - minValue) * amt, optionally snapped. */
  setProportional(amt: number, snap = 0): void {
    const min = this.minValue;
    const max = this.maxValue;
    let value = min + (max - min) * amt;

    if (snap > 0)
      value = Math.round(value / snap) * snap;

    this.set(value);
  }

  override get isDefault(): boolean {
    if (!this.isInteger) {
      // Take 50% of the precision to ensure the value doesn't underflow and return true for non-default values.
      return Math.abs(this.value - this.default) <= this.precision / 2;
    }

    return super.isDefault;
  }

  protected override clampValue(value: number, minValue: number, maxValue: number): number {
    return Math.min(maxValue, Math.max(minValue, value));
  }

  protected override isValidRange(min: number, max: number): boolean {
    return min <= max;
  }
}

const FLOAT_MAX = 3.4028234663852886e38;
const FLOAT_EPSILON = 1.401298464324817e-45;

export class BindableFloat extends BindableNumber {
  protected override get decimalSignificantDigits(): number { return 7; }
  protected override get defaultMinValue(): number { return -FLOAT_MAX; }
  protected override get defaultMaxValue(): number { return FLOAT_MAX; }
  protected override get defaultPrecision(): number { return FLOAT_EPSILON; }
  get isInteger(): boolean { return false; }

  override toString(): string {
    return formatFixedHash(this.value, 1, 4);
  }
}

export class BindableDouble extends BindableNumber {
  protected override get defaultMinValue(): number { return -Number.MAX_VALUE; }
  protected override get defaultMaxValue(): number { return Number.MAX_VALUE; }
  protected override get defaultPrecision(): number { return Number.MIN_VALUE; }
  get isInteger(): boolean { return false; }

  override toString(): string {
    return formatFixedHash(this.value, 1, 4);
  }
}

export class BindableInt extends BindableNumber {
  protected override get defaultMinValue(): number { return -2147483648; }
  protected override get defaultMaxValue(): number { return 2147483647; }
  protected override get defaultPrecision(): number { return 1; }
  get isInteger(): boolean { return true; }
}

export class BindableLong extends BindableNumber {
  protected override get defaultMinValue(): number { return Number.MIN_SAFE_INTEGER; }
  protected override get defaultMaxValue(): number { return Number.MAX_SAFE_INTEGER; }
  protected override get defaultPrecision(): number { return 1; }
  get isInteger(): boolean { return true; }
}

/** .NET custom format "0.0###": at least `min` and at most `max` decimals. */
function formatFixedHash(v: number, min: number, max: number): string {
  let s = v.toFixed(max);
  while (s.includes('.') && s.endsWith('0') && s.split('.')[1].length > min) s = s.slice(0, -1);
  return s;
}
