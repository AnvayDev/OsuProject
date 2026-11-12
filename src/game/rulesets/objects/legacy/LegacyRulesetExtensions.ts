// Ported from osu.Game/Rulesets/Objects/Legacy/LegacyRulesetExtensions.cs (CalculateDifficultyPeppyStars is ported with the legacy score
// multiplier, where it is used).

import { BeatmapDifficultyInfo } from '../../../beatmaps/BeatmapDifficulty';
import type { TimingControlPoint } from '../../../beatmaps/controlPoints/TimingControlPoint';
import type { IHasSliderVelocity } from '../types/Types';

const f = Math.fround;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const LegacyRulesetExtensions = {
  /**
   * Introduces floating-point errors to post-multiplied beat length for legacy rulesets that depend on it.
   * You should definitely not use this unless you know exactly what you're doing.
   */
  getPrecisionAdjustedBeatLength(hasSliderVelocity: IHasSliderVelocity, timingControlPoint: TimingControlPoint, rulesetShortName: string): number {
    const sliderVelocityAsBeatLength = -100 / hasSliderVelocity.sliderVelocityMultiplier;

    // Note: In stable, the division occurs on floats, but with compiler optimisations turned on actually seems to occur on doubles via some .NET black magic (possibly inlining?).
    let bpmMultiplier: number;

    switch (rulesetShortName) {
      case 'taiko':
      case 'mania':
        bpmMultiplier = sliderVelocityAsBeatLength < 0 ? clamp(f(-sliderVelocityAsBeatLength), 10, 10000) / 100.0 : 1;
        break;

      case 'osu':
      case 'fruits':
        bpmMultiplier = sliderVelocityAsBeatLength < 0 ? clamp(f(-sliderVelocityAsBeatLength), 10, 1000) / 100.0 : 1;
        break;

      default:
        throw new Error('Must be a legacy ruleset');
    }

    return timingControlPoint.beatLength * bpmMultiplier;
  },

  /** Calculates scale from a CS value, with an optional fudge that was historically applied to the osu! ruleset. */
  calculateScaleFromCircleSize(circleSize: number, applyFudge = false): number {
    // The following comment is copied verbatim from osu-stable:
    //
    //   Builds of osu! up to 2013-05-04 had the gamefield being rounded down, which caused incorrect radius calculations
    //   in widescreen cases. This ratio adjusts to allow for old replays to work post-fix, which in turn increases the lenience
    //   for all plays, but by an amount so small it should only be effective in replays.
    //
    // To match expectations of gameplay we need to apply this multiplier to circle scale. It's weird but is what it is.
    // It works out to under 1 game pixel and is generally not meaningful to gameplay, but is to replay playback accuracy.
    const broken_gamefield_rounding_allowance = f(1.00041);

    // (float)(1.0f - 0.7f * DifficultyRange(circleSize)) / 2 * allowance: the subtraction is in doubles, the rest in floats.
    return f(f(f(1.0 - f(0.7) * BeatmapDifficultyInfo.normalisedDifficulty(circleSize)) / 2) * (applyFudge ? broken_gamefield_rounding_allowance : 1));
  },
};
