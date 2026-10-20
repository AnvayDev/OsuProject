// Ported from osu.Game/Beatmaps/Formats/Parsing.cs

import { parseDoubleInvariant, parseFloatInvariant, parseIntInvariant } from '@fw/utils/DotNet';

/** Helper methods to parse from string to number and perform very basic validation. */
export const Parsing = {
  MAX_COORDINATE_VALUE: 131072,

  MAX_PARSE_VALUE: 2147483647,

  parseFloat(input: string, parseLimit = Math.fround(2147483647), allowNaN = false): number {
    const output = parseFloatInvariant(input);

    if (output < -parseLimit) throw new RangeError('Value is too low');
    if (output > parseLimit) throw new RangeError('Value is too high');

    if (!allowNaN && Number.isNaN(output)) throw new Error('Not a number');

    return output;
  },

  parseDouble(input: string, parseLimit = 2147483647, allowNaN = false): number {
    const output = parseDoubleInvariant(input);

    if (output < -parseLimit) throw new RangeError('Value is too low');
    if (output > parseLimit) throw new RangeError('Value is too high');

    if (!allowNaN && Number.isNaN(output)) throw new Error('Not a number');

    return output;
  },

  parseInt(input: string, parseLimit = 2147483647): number {
    const output = parseIntInvariant(input);

    if (output < -parseLimit) throw new RangeError('Value is too low');
    if (output > parseLimit) throw new RangeError('Value is too high');

    return output;
  },
};
