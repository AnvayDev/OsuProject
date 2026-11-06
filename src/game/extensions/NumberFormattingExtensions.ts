// Ported from osu.Game/Extensions/NumberFormattingExtensions.cs (CultureInfo.CurrentCulture is en-US here).

import { findPrecision } from '../utils/FormatUtils';

/**
 * Formats a number to a standard string, for display (ToStandardFormattedString).
 * isInteger: whether the value is an int (an int percentage is a whole number of percent, so it is divided by 100 first).
 */
export function toStandardFormattedString(value: number, maxDecimalDigits: number, asPercentage = false, isInteger = false): string {
  let floatValue = value;

  const decimalPrecision = normalise(value, maxDecimalDigits);

  // Find the number of significant digits (we could have less than maxDecimalDigits after normalize())
  const significantDigits = findPrecision(decimalPrecision);

  if (asPercentage) {
    if (isInteger)
      floatValue /= 100;

    return `${formatFixed(floatValue * 100, Math.max(0, significantDigits - 2))}%`;
  }

  const negativeSign = roundTo(floatValue, significantDigits) < 0 ? '-' : '';

  return `${negativeSign}${Math.abs(floatValue).toLocaleString('en-US', { minimumFractionDigits: significantDigits, maximumFractionDigits: significantDigits })}`;
}

/** Removes all non-significant digits, keeping at most a requested number of decimal digits (Normalise). */
export function normalise(d: number, sd: number): number {
  return Number(roundTo(d, sd).toFixed(sd));
}

/** (Math.Round(decimal, digits): midpoints to even) */
function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  const scaled = value * scale;
  const rounded = Math.round(scaled);
  // banker's rounding of exact midpoints
  return (Math.abs(scaled % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded) / scale;
}

/** (double.ToString("0.000…")) */
function formatFixed(value: number, digits: number): string {
  return value.toFixed(digits);
}
