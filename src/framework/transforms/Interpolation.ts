// Ported from osu.Framework/Utils/Interpolation.cs (the subset used by transforms)

import { DefaultEasingFunction, Easing, type IEasingFunction } from './Easing';

/** Ported from osu.Framework/Graphics/Transforms/IInterpolable.cs */
export interface IInterpolable<TValue> {
  valueAt(time: number, startValue: TValue, endValue: TValue, startTime: number, endTime: number, easing: IEasingFunction): TValue;
}

function isInterpolable<TValue>(value: unknown): value is IInterpolable<TValue> {
  return typeof value === 'object' && value !== null && typeof (value as IInterpolable<TValue>).valueAt === 'function';
}

export function valueAtNumber(time: number, val1: number, val2: number, startTime: number, endTime: number, easing: IEasingFunction): number {
  if (val1 === val2)
    return val1;

  const current = time - startTime;
  const duration = endTime - startTime;

  if (current === 0)
    return val1;
  if (duration === 0)
    return val2;

  const t = easing.applyEasing(current / duration);
  return val1 + t * (val2 - val1);
}

export function valueAt<TValue>(time: number, startValue: TValue, endValue: TValue, startTime: number, endTime: number,
                                easing: IEasingFunction | Easing = Easing.None): TValue {
  const fn = typeof easing === 'number' ? new DefaultEasingFunction(easing) : easing;

  if (typeof startValue === 'number')
    return valueAtNumber(time, startValue, endValue as number, startTime, endTime, fn) as TValue;

  if (isInterpolable<TValue>(startValue))
    return startValue.valueAt(time, startValue, endValue, startTime, endTime, fn);

  throw new TypeError(`Type ${typeof startValue} is not interpolable. Implement IInterpolable on it.`);
}
