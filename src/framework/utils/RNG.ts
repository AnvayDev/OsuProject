// Ported from osu.Framework/Utils/RNG.cs (NextBytes omitted). System.Random is Math.random; integer ranges follow Random.Next.

/** C# int.MaxValue. */
const INT_MAX = 2147483647;

/** Static utility class for random number generation. */
export abstract class RNG {
  /** Returns a non-negative signed integer (Next()), a signed integer in the range [0, maxValue) or one in [minValue, maxValue). */
  static next(): number;
  static next(maxValue: number): number;
  static next(minValue: number, maxValue: number): number;
  static next(a?: number, b?: number): number {
    if (a === undefined)
      return Math.floor(Math.random() * INT_MAX);

    if (b === undefined) {
      throwIfNegative(a);
      return Math.floor(Math.random() * a);
    }

    throwIfGreaterThan(a, b);
    return a + Math.floor(Math.random() * (b - a));
  }

  /** Returns a double-precision floating point number in the range [0,1), [0,maxValue) or [minValue,maxValue). */
  static nextDouble(): number;
  static nextDouble(maxValue: number): number;
  static nextDouble(minValue: number, maxValue: number): number;
  static nextDouble(a?: number, b?: number): number {
    if (a === undefined)
      return Math.random();

    if (b === undefined) {
      throwIfNegative(a);
      return Math.random() * a;
    }

    throwIfGreaterThan(a, b);
    return a + Math.random() * (b - a);
  }

  /** Returns a single-precision floating point number in the range [0,1), [0,maxValue) or [minValue,maxValue). */
  static nextSingle(): number;
  static nextSingle(maxValue: number): number;
  static nextSingle(minValue: number, maxValue: number): number;
  static nextSingle(a?: number, b?: number): number {
    if (a === undefined)
      return Math.fround(RNG.nextDouble());

    if (b === undefined) {
      throwIfNegative(a);
      return Math.fround(RNG.nextSingle() * a);
    }

    throwIfGreaterThan(a, b);
    return Math.fround(a + RNG.nextSingle() * (b - a));
  }

  /** Returns true or false. The likelihood of true and false are determined by trueChance (a value from 0.0 to 1.0). */
  static nextBool(trueChance = 0.5): boolean {
    return RNG.nextDouble() < trueChance;
  }
}

function throwIfNegative(maxValue: number): void {
  if (maxValue < 0)
    throw new RangeError(`maxValue ('${maxValue}') must be a non-negative value.`);
}

function throwIfGreaterThan(minValue: number, maxValue: number): void {
  if (minValue > maxValue)
    throw new RangeError(`minValue ('${minValue}') must be less than or equal to maxValue ('${maxValue}').`);
}
