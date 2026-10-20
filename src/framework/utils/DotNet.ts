// .NET runtime semantics that osu! code depends on and JavaScript does not share:
// - Math.Round (MidpointRounding.ToEven by default),
// - double/float/int.Parse with CultureInfo.InvariantCulture (strict, whole-string; NumberStyles.Float | AllowThousands / NumberStyles.Integer).

/** System.Math.Round(value) / Math.Round(value, digits): rounds half to even. */
export function mathRound(value: number, digits = 0): number {
  if (!Number.isFinite(value))
    return value;

  const scale = digits === 0 ? 1 : Math.pow(10, digits);
  const scaled = value * scale;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;

  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;

  return digits === 0 ? rounded : rounded / scale;
}

/** System.Math.Round(value, MidpointRounding.AwayFromZero). */
export function mathRoundAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

const floatPattern = /^[+-]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** double.Parse(input, CultureInfo.InvariantCulture). Throws (FormatException) on malformed input; out-of-range values parse to ±Infinity. */
export function parseDoubleInvariant(input: string): number {
  const s = input.trim();

  if (floatPattern.test(s))
    return Number(s.replace(/,/g, ''));

  const m = /^([+-]?)(infinity|∞|nan)$/i.exec(s);
  if (m !== null)
    return m[2].toLowerCase() === 'nan' ? NaN : (m[1] === '-' ? -Infinity : Infinity);

  throw new Error(`Input string '${input}' was not in a correct format.`);
}

/** float.Parse(input, CultureInfo.InvariantCulture): as parseDoubleInvariant, rounded to single precision. */
export function parseFloatInvariant(input: string): number {
  return Math.fround(parseDoubleInvariant(input));
}

/** int.Parse(input, CultureInfo.InvariantCulture). Throws on malformed input (FormatException) or out-of-range values (OverflowException). */
export function parseIntInvariant(input: string): number {
  const s = input.trim();

  if (!/^[+-]?\d+$/.test(s))
    throw new Error(`Input string '${input}' was not in a correct format.`);

  const value = Number(s);
  if (value > 2147483647 || value < -2147483648)
    throw new RangeError('Value was either too large or too small for an Int32.');

  return value;
}

/** int.TryParse(input, out result): the parsed value, or 0 if parsing fails. */
export function tryParseInt(input: string): number {
  try {
    return parseIntInvariant(input);
  } catch {
    return 0;
  }
}

// char.IsWhiteSpace: JavaScript's \s also matches U+FEFF and misses U+0085.
const whiteSpace = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const leadingWhiteSpace = new RegExp(`^[${whiteSpace}]+`);
const trailingWhiteSpace = new RegExp(`[${whiteSpace}]+$`);

/** string.TrimStart(). */
export function trimStart(s: string): string {
  return s.replace(leadingWhiteSpace, '');
}

/** string.TrimEnd(). */
export function trimEnd(s: string): string {
  return s.replace(trailingWhiteSpace, '');
}

/** string.Trim(). */
export function trim(s: string): string {
  return trimEnd(trimStart(s));
}

/** string.IsNullOrWhiteSpace(s). */
export function isNullOrWhiteSpace(s: string | null | undefined): boolean {
  return s === null || s === undefined || trimStart(s).length === 0;
}
