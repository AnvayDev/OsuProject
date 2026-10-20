// Ported from osu.Game/Utils/ColourUtils.cs

import { Colour4 } from '@fw/graphics/Colour4';
import { valueAt } from '@fw/transforms/Interpolation';

export const ColourUtils = {
  /** Samples from a given linear gradient at a certain specified point. */
  sampleFromLinearGradient(gradient: readonly (readonly [position: number, colour: Colour4])[], point: number): Colour4 {
    if (point < gradient[0][0])
      return gradient[0][1];

    for (let i = 0; i < gradient.length - 1; i++) {
      const startStop = gradient[i];
      const endStop = gradient[i + 1];

      if (point >= endStop[0])
        continue;

      return valueAt(point, startStop[1], endStop[1], startStop[0], endStop[0]);
    }

    return gradient[gradient.length - 1][1];
  },
};
